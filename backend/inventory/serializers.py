from rest_framework import serializers
from .models import Supplier, Product, Employee, Customer, StockMovement


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ['id', 'code', 'supplier_name', 'phone', 'email', 'is_active', 'created_at']
        read_only_fields = ['id', 'code', 'created_at']


class ProductSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.supplier_name', read_only=True)
    below_minimum = serializers.BooleanField(read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'code', 'product_name', 'description', 'supplier', 'supplier_name',
            'quantity', 'min_quantity', 'unit_price', 'barcode',
            'last_updated', 'is_active', 'below_minimum',
        ]
        read_only_fields = ['id', 'code', 'last_updated', 'below_minimum']


class ProductPublicSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.supplier_name', read_only=True)
    in_stock = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ['id', 'code', 'product_name', 'description', 'supplier_name',
                  'unit_price', 'barcode', 'in_stock', 'is_active']

    def get_in_stock(self, obj):
        return obj.quantity > 0


class EmployeeSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = Employee
        fields = ['id', 'code', 'full_name', 'username', 'phone', 'is_active', 'created_at']
        read_only_fields = ['id', 'code', 'created_at']


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ['id', 'code', 'customer_name', 'phone', 'email', 'address', 'is_active', 'created_at']
        read_only_fields = ['id', 'code', 'created_at']


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.product_name', read_only=True)
    product_code = serializers.CharField(source='product.code', read_only=True)
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    customer_name = serializers.CharField(source='customer.customer_name', read_only=True, default=None)

    class Meta:
        model = StockMovement
        fields = [
            'id', 'code', 'product', 'product_code', 'product_name',
            'employee', 'employee_name', 'customer', 'customer_name',
            'order', 'movement_type', 'quantity', 'movement_time', 'note',
        ]
        read_only_fields = ['id', 'code', 'movement_time']


class StockInSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.filter(is_active=True))
    quantity = serializers.IntegerField(min_value=1)
    note = serializers.CharField(required=False, allow_blank=True)
