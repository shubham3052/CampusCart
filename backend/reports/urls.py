from django.urls import path
from . import views

urlpatterns = [
    # 1. Sales
    path('admin/sales/', views.AdminSalesReportView.as_view(), name='report-admin-sales'),
    path('admin/sales/export/', views.AdminSalesExportView.as_view(), name='report-admin-sales-export'),

    # 2. Orders
    path('admin/orders/', views.AdminOrdersReportView.as_view(), name='report-admin-orders'),
    path('admin/orders/export/', views.AdminOrdersExportView.as_view(), name='report-admin-orders-export'),

    # 3. Products
    path('admin/products/', views.AdminProductsReportView.as_view(), name='report-admin-products'),
    path('admin/products/export/', views.AdminProductsExportView.as_view(), name='report-admin-products-export'),

    # 4. Categories
    path('admin/categories/', views.AdminCategoriesReportView.as_view(), name='report-admin-categories'),
    path('admin/categories/export/', views.AdminCategoriesExportView.as_view(), name='report-admin-categories-export'),

    # 5. Shops
    path('admin/shops/', views.AdminShopsReportView.as_view(), name='report-admin-shops'),
    path('admin/shops/export/', views.AdminShopsExportView.as_view(), name='report-admin-shops-export'),

    # 6. Inventory & Stock Movement
    path('admin/inventory/', views.AdminInventoryReportView.as_view(), name='report-admin-inventory'),
    path('admin/inventory/export/', views.AdminInventoryExportView.as_view(), name='report-admin-inventory-export'),
    path('admin/stock-movements/', views.AdminStockMovementReportView.as_view(), name='report-admin-stock-movements'),
    path('admin/stock-movements/export/', views.AdminStockMovementExportView.as_view(), name='report-admin-stock-movements-export'),

    # 7. Demand Prediction & Demand Spikes
    path('admin/demand-predictions/', views.AdminDemandPredictionReportView.as_view(), name='report-admin-demand-predictions'),
    path('admin/demand-predictions/export/', views.AdminDemandPredictionExportView.as_view(), name='report-admin-demand-predictions-export'),
    path('admin/demand-spikes/', views.AdminDemandSpikeReportView.as_view(), name='report-admin-demand-spikes'),
    path('admin/demand-spikes/export/', views.AdminDemandSpikeExportView.as_view(), name='report-admin-demand-spikes-export'),

    # 8. Academic Demand
    path('admin/academic-demand/', views.AdminAcademicDemandReportView.as_view(), name='report-admin-academic-demand'),
    path('admin/academic-demand/export/', views.AdminAcademicDemandExportView.as_view(), name='report-admin-academic-demand-export'),

    # 9. Printing
    path('admin/printing/', views.AdminPrintingReportView.as_view(), name='report-admin-printing'),
    path('admin/printing/export/', views.AdminPrintingExportView.as_view(), name='report-admin-printing-export'),

    # 10. Delivery
    path('admin/delivery/', views.AdminDeliveryReportView.as_view(), name='report-admin-delivery'),
    path('admin/delivery/export/', views.AdminDeliveryExportView.as_view(), name='report-admin-delivery-export'),

    # 11. Customers
    path('admin/customers/', views.AdminCustomersReportView.as_view(), name='report-admin-customers'),
    path('admin/customers/export/', views.AdminCustomersExportView.as_view(), name='report-admin-customers-export'),

    # 12. Payments & Refunds
    path('admin/payments/', views.AdminPaymentsReportView.as_view(), name='report-admin-payments'),
    path('admin/payments/export/', views.AdminPaymentsExportView.as_view(), name='report-admin-payments-export'),
    path('admin/refunds/', views.AdminRefundsReportView.as_view(), name='report-admin-refunds'),
    path('admin/refunds/export/', views.AdminRefundsExportView.as_view(), name='report-admin-refunds-export'),

    # 13. Bulk Orders
    path('admin/bulk-orders/', views.AdminBulkOrdersReportView.as_view(), name='report-admin-bulk-orders'),
    path('admin/bulk-orders/export/', views.AdminBulkOrdersExportView.as_view(), name='report-admin-bulk-orders-export'),

    # 14. Reviews & Complaints
    path('admin/reviews-complaints/', views.AdminReviewsComplaintsReportView.as_view(), name='report-admin-reviews-complaints'),
    path('admin/reviews-complaints/export/', views.AdminReviewsComplaintsExportView.as_view(), name='report-admin-reviews-complaints-export'),

    # 15. Offers & Coupons
    path('admin/offers/', views.AdminOffersReportView.as_view(), name='report-admin-offers'),
    path('admin/offers/export/', views.AdminOffersExportView.as_view(), name='report-admin-offers-export'),

    # 16. Recommendations
    path('admin/recommendations/', views.AdminRecommendationsReportView.as_view(), name='report-admin-recommendations'),
    path('admin/recommendations/export/', views.AdminRecommendationsExportView.as_view(), name='report-admin-recommendations-export'),

    # 17. User Management
    path('admin/users/', views.AdminUsersReportView.as_view(), name='report-admin-users'),
    path('admin/users/export/', views.AdminUsersExportView.as_view(), name='report-admin-users-export'),
]
