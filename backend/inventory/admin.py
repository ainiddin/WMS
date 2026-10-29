from django.contrib import admin
from .models import Supplier, Product, Employee, Customer, StockMovement


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ['code', 'supplier_name', 'phone', 'email', 'is_active']
    list_filter = ['is_active']
    search_fields = ['code', 'supplier_name']


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['code', 'product_name', 'supplier', 'quantity', 'min_quantity', 'unit_price', 'is_active']
    list_filter = ['is_active', 'supplier']
    search_fields = ['code', 'product_name', 'barcode']


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ['code', 'full_name', 'user', 'phone', 'is_active']
    list_filter = ['is_active']


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ['code', 'customer_name', 'phone', 'email', 'is_active']
    list_filter = ['is_active']
    search_fields = ['code', 'customer_name', 'email']


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ['code', 'product', 'movement_type', 'quantity', 'employee', 'customer', 'movement_time']
    list_filter = ['movement_type']
    search_fields = ['code', 'product__code', 'product__product_name']
