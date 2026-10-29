from django.urls import path
from .views import (
    OrderListCreateView, OrderDetailView,
    OrderApproveView, OrderRejectView, OrderShipView, OrderCancelView,
)

urlpatterns = [
    path('orders/', OrderListCreateView.as_view(), name='orders'),
    path('orders/<int:pk>/', OrderDetailView.as_view(), name='order-detail'),
    path('orders/<int:pk>/approve/', OrderApproveView.as_view(), name='order-approve'),
    path('orders/<int:pk>/reject/', OrderRejectView.as_view(), name='order-reject'),
    path('orders/<int:pk>/ship/', OrderShipView.as_view(), name='order-ship'),
    path('orders/<int:pk>/cancel/', OrderCancelView.as_view(), name='order-cancel'),
]
