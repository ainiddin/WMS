from django.db.models import Sum, Count, F, Q
from django.db.models.functions import TruncMonth
from django.http import HttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from accounts.permissions import IsAdminOrManager
from inventory.models import Product, StockMovement
from sales.models import Order
import openpyxl
from io import BytesIO


class DashboardView(APIView):
    permission_classes = [IsAdminOrManager]

    def get(self, request):
        below_min = Product.objects.filter(is_active=True, quantity__lt=F('min_quantity')).count()
        pending_orders = Order.objects.filter(status=Order.PENDING).count()
        from django.utils import timezone
        import datetime
        now = timezone.now()
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        shipments = Order.objects.filter(status=Order.SHIPPED, shipped_at__gte=start_of_month).count()

        monthly_movements = (
            StockMovement.objects
            .annotate(month=TruncMonth('movement_time'))
            .values('month', 'movement_type')
            .annotate(total=Sum('quantity'))
            .order_by('month', 'movement_type')
        )

        top_products = (
            StockMovement.objects
            .filter(movement_type=StockMovement.OUT)
            .values('product__code', 'product__product_name')
            .annotate(total_out=Sum('quantity'))
            .order_by('-total_out')[:5]
        )

        stock_levels = (
            Product.objects
            .filter(is_active=True)
            .values('code', 'product_name', 'quantity', 'min_quantity')
            .order_by('code')[:10]
        )

        return Response({
            'cards': {
                'below_minimum_count': below_min,
                'pending_orders': pending_orders,
                'shipments_this_month': shipments,
            },
            'monthly_movements': list(monthly_movements),
            'top_products_by_out': list(top_products),
            'stock_levels': list(stock_levels),
        })


class RestockReportView(APIView):
    permission_classes = [IsAdminOrManager]

    def get(self, request):
        products = (
            Product.objects
            .select_related('supplier')
            .filter(is_active=True, quantity__lt=F('min_quantity'))
            .values(
                'code', 'product_name', 'quantity', 'min_quantity',
                'supplier__code', 'supplier__supplier_name', 'supplier__phone', 'supplier__email'
            )
            .order_by('code')
        )
        fmt = request.query_params.get('format')
        if fmt == 'xlsx':
            return _export_restock_xlsx(list(products))
        return Response(list(products))


class MonthlyUsageView(APIView):
    permission_classes = [IsAdminOrManager]

    def get(self, request):
        data = (
            StockMovement.objects
            .filter(movement_type=StockMovement.OUT)
            .annotate(month=TruncMonth('movement_time'))
            .values('month', 'product__code', 'product__product_name')
            .annotate(total=Sum('quantity'))
            .order_by('month', 'product__code')
        )
        fmt = request.query_params.get('format')
        if fmt == 'xlsx':
            return _export_monthly_xlsx(list(data))
        return Response(list(data))


class TopCustomersView(APIView):
    permission_classes = [IsAdminOrManager]

    def get(self, request):
        data = (
            Order.objects
            .filter(status=Order.SHIPPED)
            .values('customer__code', 'customer__customer_name')
            .annotate(order_count=Count('id'))
            .order_by('-order_count')[:10]
        )
        return Response(list(data))


class ReconciliationView(APIView):
    permission_classes = [IsAdminOrManager]

    def get(self, request):
        in_totals = (
            StockMovement.objects
            .filter(movement_type=StockMovement.IN)
            .values('product_id')
            .annotate(total_in=Sum('quantity'))
        )
        out_totals = (
            StockMovement.objects
            .filter(movement_type=StockMovement.OUT)
            .values('product_id')
            .annotate(total_out=Sum('quantity'))
        )
        in_map = {r['product_id']: r['total_in'] for r in in_totals}
        out_map = {r['product_id']: r['total_out'] for r in out_totals}

        products = Product.objects.filter(is_active=True).values('id', 'code', 'product_name', 'quantity')
        result = []
        for p in products:
            expected = in_map.get(p['id'], 0) - out_map.get(p['id'], 0)
            result.append({
                'code': p['code'],
                'product_name': p['product_name'],
                'quantity_in_db': p['quantity'],
                'calculated': expected,
                'discrepancy': p['quantity'] - expected,
            })
        return Response(result)


def _export_restock_xlsx(data):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Restock'
    headers = ['Code', 'Product', 'Current Qty', 'Min Qty', 'Need', 'Supplier', 'Supplier Phone']
    ws.append(headers)
    for row in data:
        ws.append([
            row['code'], row['product_name'], row['quantity'], row['min_quantity'],
            row['min_quantity'] - row['quantity'],
            row['supplier__supplier_name'], row['supplier__phone'],
        ])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    response = HttpResponse(buf.read(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response['Content-Disposition'] = 'attachment; filename="restock.xlsx"'
    return response


def _export_monthly_xlsx(data):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Monthly Usage'
    ws.append(['Month', 'Product Code', 'Product Name', 'Total OUT'])
    for row in data:
        ws.append([str(row['month'])[:7], row['product__code'], row['product__product_name'], row['total']])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    response = HttpResponse(buf.read(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response['Content-Disposition'] = 'attachment; filename="monthly_usage.xlsx"'
    return response
