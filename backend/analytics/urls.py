from django.urls import path
from .views import (
    ShopOverviewView,
    ShopSalesView,
    ShopOrdersView,
    ShopProductsView,
    ShopInventoryView,
    ShopDemandView,
    ShopPrintingView,
    ShopDeliveryView,
    ShopCustomersView,
    AdminOverviewView,
    AdminShopsView,
    AdminUsersView,
    StudentSummaryView,
)

urlpatterns = [
    # Shop Owner Analytics Endpoints
    path('shop/overview/', ShopOverviewView.as_view(), name='analytics-shop-overview'),
    path('shop/sales/', ShopSalesView.as_view(), name='analytics-shop-sales'),
    path('shop/orders/', ShopOrdersView.as_view(), name='analytics-shop-orders'),
    path('shop/products/', ShopProductsView.as_view(), name='analytics-shop-products'),
    path('shop/inventory/', ShopInventoryView.as_view(), name='analytics-shop-inventory'),
    path('shop/demand/', ShopDemandView.as_view(), name='analytics-shop-demand'),
    path('shop/printing/', ShopPrintingView.as_view(), name='analytics-shop-printing'),
    path('shop/delivery/', ShopDeliveryView.as_view(), name='analytics-shop-delivery'),
    path('shop/customers/', ShopCustomersView.as_view(), name='analytics-shop-customers'),

    # Admin Platform Analytics Endpoints
    path('admin/overview/', AdminOverviewView.as_view(), name='analytics-admin-overview'),
    path('admin/shops/', AdminShopsView.as_view(), name='analytics-admin-shops'),
    path('admin/users/', AdminUsersView.as_view(), name='analytics-admin-users'),

    # Student Personal Analytics Endpoint
    path('student/summary/', StudentSummaryView.as_view(), name='analytics-student-summary'),
]
