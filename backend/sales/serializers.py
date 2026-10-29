from rest_framework import serializers
from .models import Order, OrderItem
from inventory.serializers import ProductPublicSerializer


class OrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.product_name', read_only=True)
    product_code = serializers.CharField(source='product.code', read_only=True)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = OrderItem
        fields = ['id', 'product', 'product_code', 'product_name', 'quantity', 'unit_price', 'subtotal']


class OrderItemCreateSerializer(serializers.Serializer):
    product = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source='customer.customer_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.full_name', read_only=True, default=None)
    total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'code', 'customer', 'customer_name', 'status',
            'created_at', 'approved_by', 'approved_by_name', 'approved_at',
            'shipped_at', 'comment', 'items', 'total',
        ]
        read_only_fields = ['id', 'code', 'status', 'created_at', 'approved_by',
                            'approved_at', 'shipped_at']


class OrderCreateSerializer(serializers.Serializer):
    items = OrderItemCreateSerializer(many=True)
    comment = serializers.CharField(required=False, allow_blank=True)
