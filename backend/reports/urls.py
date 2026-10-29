from django.urls import path
from .views import DashboardView, RestockReportView, MonthlyUsageView, TopCustomersView, ReconciliationView

urlpatterns = [
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
    path('reports/restock/', RestockReportView.as_view(), name='report-restock'),
    path('reports/monthly-usage/', MonthlyUsageView.as_view(), name='report-monthly'),
    path('reports/top-customers/', TopCustomersView.as_view(), name='report-top-customers'),
    path('reports/reconciliation/', ReconciliationView.as_view(), name='report-reconciliation'),
]
