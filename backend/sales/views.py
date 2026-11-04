from django.db import transaction
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.permissions import IsAdminOrManager, IsWorkerOrAbove, IsCustomer
from accounts.models import User
from inventory.models import Product, Employee, Customer
from inventory.services import record_movement
from .models import Order, OrderItem
from .serializers import OrderSerializer, OrderCreateSerializer


class OrderListCreateView(generics.ListCreateAPIView):
    serializer_class = OrderSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Order.objects.prefetch_related('items__product').select_related('customer', 'approved_by')
        if user.role == User.CUSTOMER:
            qs = qs.filter(customer__user=user)
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter.upper())
        return qs

    def create(self, request, *args, **kwargs):
        if request.user.role != User.CUSTOMER:
            return Response({'detail': 'Only customers can create orders.'}, status=403)
        serializer = OrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            customer = request.user.customer
        except Exception:
            return Response({'detail': 'No customer profile.'}, status=400)

        product_ids = [item_data['product'] for item_data in data['items']]
        products = Product.objects.in_bulk(product_ids)
        for product_id in product_ids:
            if product_id not in products or not products[product_id].is_active:
                return Response({'detail': f'Product {product_id} not found.'}, status=400)

        with transaction.atomic():
            order = Order.objects.create(
                customer=customer,
                comment=data.get('comment', ''),
            )
            for item_data in data['items']:
                product = products[item_data['product']]
                OrderItem.objects.create(
                    order=order,
                    product=product,
                    quantity=item_data['quantity'],
                    unit_price=product.unit_price,
                )
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


class OrderDetailView(generics.RetrieveAPIView):
    serializer_class = OrderSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Order.objects.prefetch_related('items__product').select_related('customer', 'approved_by')
        if user.role == User.CUSTOMER:
            return qs.filter(customer__user=user)
        return qs


class OrderApproveView(APIView):
    permission_classes = [IsAdminOrManager]

    def post(self, request, pk):
        try:
            order = Order.objects.prefetch_related('items__product').get(pk=pk)
        except Order.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        if order.status != Order.PENDING:
            return Response({'detail': f'Order is {order.status}, not PENDING.'}, status=400)
        for item in order.items.all():
            if item.product.quantity < item.quantity:
                return Response(
                    {'detail': f'Insufficient stock for {item.product.product_name}: '
                               f'available {item.product.quantity}, need {item.quantity}.'},
                    status=400
                )
        try:
            employee = request.user.employee
        except Exception:
            return Response({'detail': 'No employee profile.'}, status=400)
        order.status = Order.APPROVED
        order.approved_by = employee
        order.approved_at = timezone.now()
        order.save()
        return Response(OrderSerializer(order).data)


class OrderRejectView(APIView):
    permission_classes = [IsAdminOrManager]

    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        if order.status not in (Order.PENDING, Order.APPROVED):
            return Response({'detail': f'Cannot reject order with status {order.status}.'}, status=400)
        order.status = Order.REJECTED
        order.comment = request.data.get('comment', order.comment)
        order.save()
        return Response(OrderSerializer(order).data)


class OrderShipView(APIView):
    permission_classes = [IsWorkerOrAbove]

    def post(self, request, pk):
        try:
            employee = request.user.employee
        except Exception:
            return Response({'detail': 'No employee profile.'}, status=400)

        try:
            with transaction.atomic():
                try:
                    # Lock the order row so two concurrent requests cannot ship it twice
                    order = Order.objects.select_for_update().select_related('customer').get(pk=pk)
                except Order.DoesNotExist:
                    return Response({'detail': 'Not found.'}, status=404)
                if order.status != Order.APPROVED:
                    return Response({'detail': f'Order is {order.status}, not APPROVED.'}, status=400)
                for item in order.items.select_related('product'):
                    record_movement(
                        product=item.product,
                        employee=employee,
                        movement_type='OUT',
                        quantity=item.quantity,
                        customer=order.customer,
                        order=order,
                        note=f'Order {order.code}',
                    )
                order.status = Order.SHIPPED
                order.shipped_at = timezone.now()
                order.save()
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        return Response(OrderSerializer(order).data)


class OrderCancelView(APIView):
    def post(self, request, pk):
        user = request.user
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        if user.role == User.CUSTOMER:
            if order.customer.user != user:
                return Response({'detail': 'Forbidden.'}, status=403)
            if order.status != Order.PENDING:
                return Response({'detail': 'Customers can only cancel PENDING orders.'}, status=400)
        elif user.role not in (User.ADMIN, User.MANAGER):
            return Response({'detail': 'Forbidden.'}, status=403)
        elif order.status not in (Order.PENDING, Order.APPROVED):
            return Response({'detail': f'Cannot cancel order with status {order.status}.'}, status=400)

        order.status = Order.CANCELLED
        order.save()
        return Response(OrderSerializer(order).data)
