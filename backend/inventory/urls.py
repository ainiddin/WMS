from django.urls import path
from .views import (
    SupplierListCreateView, SupplierDetailView,
    ProductListCreateView, ProductDetailView, ProductByBarcodeView,
    EmployeeListView, CustomerListView,
    StockMovementListView, StockInView,
)

urlpatterns = [
    path('suppliers/', SupplierListCreateView.as_view(), name='suppliers'),
    path('suppliers/<int:pk>/', SupplierDetailView.as_view(), name='supplier-detail'),
    path('products/', ProductListCreateView.as_view(), name='products'),
    path('products/<int:pk>/', ProductDetailView.as_view(), name='product-detail'),
    path('products/by-barcode/<str:barcode>/', ProductByBarcodeView.as_view(), name='product-by-barcode'),
    path('employees/', EmployeeListView.as_view(), name='employees'),
    path('customers/', CustomerListView.as_view(), name='customers'),
    path('movements/', StockMovementListView.as_view(), name='movements'),
    path('movements/in/', StockInView.as_view(), name='stock-in'),
]
