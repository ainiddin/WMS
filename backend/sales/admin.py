from django.contrib import admin
from .models import Order, OrderItem


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ['subtotal']


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ['code', 'customer', 'status', 'created_at', 'approved_by', 'shipped_at']
    list_filter = ['status']
    search_fields = ['code', 'customer__customer_name']
    inlines = [OrderItemInline]
