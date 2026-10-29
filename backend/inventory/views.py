from rest_framework import generics, permissions, status, filters
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.permissions import IsAdminOrManager, IsWorkerOrAbove
from accounts.models import User
from .models import Supplier, Product, Employee, Customer, StockMovement
from .serializers import (
    SupplierSerializer, ProductSerializer, ProductPublicSerializer,
    EmployeeSerializer, CustomerSerializer, StockMovementSerializer, StockInSerializer,
)
from .services import record_movement


class SupplierListCreateView(generics.ListCreateAPIView):
    serializer_class = SupplierSerializer
    permission_classes = [IsAdminOrManager]
    filter_backends = [filters.SearchFilter]
    search_fields = ['supplier_name', 'code']

    def get_queryset(self):
        qs = Supplier.objects.all()
        active = self.request.query_params.get('active')
        if active is not None:
            qs = qs.filter(is_active=active.lower() == 'true')
        return qs


class SupplierDetailView(generics.RetrieveUpdateAPIView):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [IsAdminOrManager]


class ProductListCreateView(generics.ListCreateAPIView):
    filter_backends = [filters.SearchFilter]
    search_fields = ['product_name', 'code', 'barcode']

    def get_permissions(self):
        if self.request.method == 'GET':
            return [permissions.IsAuthenticated()]
        return [IsAdminOrManager()]

    def get_serializer_class(self):
        user = self.request.user
        if user.role == User.CUSTOMER:
            return ProductPublicSerializer
        return ProductSerializer

    def get_queryset(self):
        qs = Product.objects.select_related('supplier')
        user = self.request.user
        if user.role == User.CUSTOMER:
            qs = qs.filter(is_active=True)
        active = self.request.query_params.get('active')
        if active is not None:
            qs = qs.filter(is_active=active.lower() == 'true')
        below_min = self.request.query_params.get('below_min')
        if below_min == 'true':
            from django.db.models import F
            qs = qs.filter(quantity__lt=F('min_quantity'))
        return qs


class ProductDetailView(generics.RetrieveUpdateAPIView):
    queryset = Product.objects.select_related('supplier')

    def get_permissions(self):
        if self.request.method == 'GET':
            return [permissions.IsAuthenticated()]
        return [IsAdminOrManager()]

    def get_serializer_class(self):
        user = self.request.user
        if user.role == User.CUSTOMER:
            return ProductPublicSerializer
        return ProductSerializer


class ProductByBarcodeView(APIView):
    permission_classes = [IsWorkerOrAbove]

    def get(self, request, barcode):
        try:
            product = Product.objects.get(barcode=barcode, is_active=True)
        except Product.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(ProductSerializer(product).data)


class EmployeeListView(generics.ListAPIView):
    queryset = Employee.objects.select_related('user').filter(is_active=True)
    serializer_class = EmployeeSerializer
    permission_classes = [IsAdminOrManager]


class CustomerListView(generics.ListAPIView):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAdminOrManager]
    filter_backends = [filters.SearchFilter]
    search_fields = ['customer_name', 'code', 'email']


class StockMovementListView(generics.ListAPIView):
    serializer_class = StockMovementSerializer
    permission_classes = [IsWorkerOrAbove]

    def get_queryset(self):
        qs = StockMovement.objects.select_related('product', 'employee', 'customer')
        product = self.request.query_params.get('product')
        mtype = self.request.query_params.get('type')
        date_from = self.request.query_params.get('from')
        date_to = self.request.query_params.get('to')
        if product:
            qs = qs.filter(product_id=product)
        if mtype:
            qs = qs.filter(movement_type=mtype.upper())
        if date_from:
            qs = qs.filter(movement_time__date__gte=date_from)
        if date_to:
            qs = qs.filter(movement_time__date__lte=date_to)
        return qs


class StockInView(APIView):
    permission_classes = [IsWorkerOrAbove]

    def post(self, request):
        serializer = StockInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            employee = request.user.employee
        except Exception:
            return Response({'detail': 'No employee profile linked to this user.'}, status=400)
        movement = record_movement(
            product=data['product'],
            employee=employee,
            movement_type=StockMovement.IN,
            quantity=data['quantity'],
            note=data.get('note', ''),
        )
        return Response(StockMovementSerializer(movement).data, status=status.HTTP_201_CREATED)
