from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from .permissions import IsAdminForReports
from .filters import extract_report_filters
from .exporters import generate_csv_response
from .models import ReportAuditLog
from . import selectors


def log_report_access(request, report_type, export_format='JSON', count=0):
    """Utility to log report generation or export in ReportAuditLog."""
    try:
        ip = request.META.get('HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR'))
        if ip and ',' in ip:
            ip = ip.split(',')[0].strip()

        filters = {k: v for k, v in request.query_params.items() if k not in ('token', 'secret')}
        ReportAuditLog.objects.create(
            user=request.user if request.user.is_authenticated else None,
            report_type=report_type,
            export_format=export_format,
            filters=filters,
            records_count=count,
            is_success=True,
            ip_address=ip
        )
    except Exception:
        pass


class AdminBaseReportView(APIView):
    permission_classes = [IsAuthenticated, IsAdminForReports]
    report_type = 'base'

    def get_data(self, filters):
        raise NotImplementedError

    def get(self, request):
        filters = extract_report_filters(request.query_params)
        result = self.get_data(filters)
        log_report_access(request, self.report_type, 'JSON', len(result.get('rows', [])))
        return Response({
            'success': True,
            'report_type': self.report_type,
            'filters': {
                'start_date': filters['start_date'].isoformat(),
                'end_date': filters['end_date'].isoformat(),
                'preset': filters['preset'],
                'shop_id': filters['shop_id'],
            },
            'kpis': result.get('kpis', {}),
            'data': result.get('rows', []),
            'pagination': result.get('pagination', {}),
        })


class AdminBaseExportView(APIView):
    permission_classes = [IsAuthenticated, IsAdminForReports]
    report_type = 'base'
    filename_prefix = 'report'
    csv_headers = []

    def get_export_rows(self, filters):
        raise NotImplementedError

    def get(self, request):
        filters = extract_report_filters(request.query_params)
        rows = self.get_export_rows(filters)
        log_report_access(request, self.report_type, 'CSV', len(rows))
        return generate_csv_response(
            filename_prefix=self.filename_prefix,
            start_date=filters['start_date'],
            end_date=filters['end_date'],
            headers=self.csv_headers,
            rows=rows
        )


# ==============================================================================
# 1. SALES REPORT & EXPORT
# ==============================================================================

class AdminSalesReportView(AdminBaseReportView):
    report_type = 'sales'

    def get_data(self, filters):
        return selectors.get_sales_report_data(filters)


class AdminSalesExportView(AdminBaseExportView):
    report_type = 'sales'
    filename_prefix = 'sales_report'
    csv_headers = ['Date', 'Orders Count', 'Gross Sales (INR)', 'Discounts (INR)', 'Refunds (INR)', 'Net Sales (INR)']

    def get_export_rows(self, filters):
        data = selectors.get_sales_report_data(filters)
        return [
            [r['date'], r['orders_count'], r['gross_sales'], r['discounts'], r['refunds'], r['net_sales']]
            for r in data.get('all_rows', [])
        ]


# ==============================================================================
# 2. ORDERS REPORT & EXPORT
# ==============================================================================

class AdminOrdersReportView(AdminBaseReportView):
    report_type = 'orders'

    def get_data(self, filters):
        return selectors.get_orders_report_data(filters)


class AdminOrdersExportView(AdminBaseExportView):
    report_type = 'orders'
    filename_prefix = 'orders_report'
    csv_headers = [
        'Order ID', 'Order Number', 'Date', 'Customer', 'College ID', 'Shop',
        'Order Type', 'Fulfillment', 'Items Count', 'Subtotal', 'Discount',
        'Delivery Charge', 'Total Amount', 'Payment Status', 'Order Status',
        'Delivery Status', 'Completed At'
    ]

    def get_export_rows(self, filters):
        data = selectors.get_orders_report_data(filters)
        return [
            [
                r['id'], r['full_order_number'], r['created_at'], r['customer'], r['college_id'],
                r['shop_name'], r['order_type'], r['fulfillment_type'], r['items_count'],
                r['subtotal'], r['discount_amount'], r['delivery_fee'], r['total_amount'],
                r['payment_status'], r['order_status'], r['delivery_status'], r['completed_at']
            ]
            for r in data.get('all_rows', [])
        ]


# ==============================================================================
# 3. PRODUCTS REPORT & EXPORT
# ==============================================================================

class AdminProductsReportView(AdminBaseReportView):
    report_type = 'products'

    def get_data(self, filters):
        return selectors.get_products_report_data(filters)


class AdminProductsExportView(AdminBaseExportView):
    report_type = 'products'
    filename_prefix = 'products_report'
    csv_headers = ['Product ID', 'Product Name', 'SKU', 'Category', 'Shop', 'Price', 'Units Sold', 'Revenue', 'Orders Count', 'Current Stock', 'Predicted Demand (7D)', 'Stock Status']

    def get_export_rows(self, filters):
        data = selectors.get_products_report_data(filters)
        return [
            [
                r['id'], r['name'], r['sku'], r['category'], r['shop_name'], r['price'],
                r['units_sold'], r['revenue'], r['orders_count'], r['current_stock'],
                r['predicted_demand'], r['stock_status']
            ]
            for r in data.get('all_rows', [])
        ]


# ==============================================================================
# 4. CATEGORIES REPORT & EXPORT
# ==============================================================================

class AdminCategoriesReportView(AdminBaseReportView):
    report_type = 'categories'

    def get_data(self, filters):
        return selectors.get_categories_report_data(filters)


class AdminCategoriesExportView(AdminBaseExportView):
    report_type = 'categories'
    filename_prefix = 'categories_report'
    csv_headers = ['Category ID', 'Category Name', 'Units Sold', 'Orders Count', 'Revenue', 'Revenue Share %', 'Current Inventory']

    def get_export_rows(self, filters):
        data = selectors.get_categories_report_data(filters)
        return [
            [r['id'], r['name'], r['units_sold'], r['orders_count'], r['revenue'], f"{r['revenue_share_percentage']}%", r['current_inventory']]
            for r in data.get('all_rows', [])
        ]


# ==============================================================================
# 5. SHOPS REPORT & EXPORT
# ==============================================================================

class AdminShopsReportView(AdminBaseReportView):
    report_type = 'shops'

    def get_data(self, filters):
        return selectors.get_shops_report_data(filters)


class AdminShopsExportView(AdminBaseExportView):
    report_type = 'shops'
    filename_prefix = 'shops_report'
    csv_headers = ['Rank', 'Shop ID', 'Shop Name', 'Type', 'Owner', 'Orders', 'Completed', 'Gross Revenue', 'Refunds', 'Net Revenue', 'AOV', 'Unique Customers', 'Printing Revenue', 'Delivery Revenue', 'Rating', 'Active']

    def get_export_rows(self, filters):
        data = selectors.get_shops_report_data(filters)
        return [
            [
                r['rank'], r['shop_id'], r['name'], r['shop_type'], r['owner_username'],
                r['orders_count'], r['completed_orders'], r['gross_revenue'], r['refund_amount'],
                r['net_revenue'], r['average_order_value'], r['customers_count'],
                r['printing_revenue'], r['delivery_revenue'], r['rating'], r['is_active']
            ]
            for r in data.get('all_rows', [])
        ]


# ==============================================================================
# 6. INVENTORY & STOCK MOVEMENT REPORTS
# ==============================================================================

class AdminInventoryReportView(AdminBaseReportView):
    report_type = 'inventory'

    def get_data(self, filters):
        return selectors.get_inventory_report_data(filters)


class AdminInventoryExportView(AdminBaseExportView):
    report_type = 'inventory'
    filename_prefix = 'inventory_report'
    csv_headers = ['Inventory ID', 'Shop Name', 'Product Name', 'Category', 'Current Stock', 'Reserved Stock', 'Available Stock', 'Min Stock', 'Reorder Level', 'Unit Cost', 'Inventory Value', 'Stock Status']

    def get_export_rows(self, filters):
        data = selectors.get_inventory_report_data(filters)
        return [
            [
                r['id'], r['shop_name'], r['product_name'], r['category'], r['current_stock'],
                r['reserved_stock'], r['available_stock'], r['minimum_stock'], r['reorder_level'],
                r['unit_cost'], r['inventory_value'], r['stock_status']
            ]
            for r in data.get('all_rows', [])
        ]


class AdminStockMovementReportView(AdminBaseReportView):
    report_type = 'stock_movements'

    def get_data(self, filters):
        return selectors.get_stock_movement_report_data(filters)


class AdminStockMovementExportView(AdminBaseExportView):
    report_type = 'stock_movements'
    filename_prefix = 'stock_movements_report'
    csv_headers = ['Transaction ID', 'Date', 'Shop Name', 'Product Name', 'Transaction Type', 'Delta', 'Stock Before', 'Stock After', 'Ref Type', 'Ref ID', 'Reason', 'Performed By']

    def get_export_rows(self, filters):
        data = selectors.get_stock_movement_report_data(filters)
        return [
            [
                r['id'], r['date'], r['shop_name'], r['product_name'], r['transaction_type'],
                r['quantity_change'], r['stock_before'], r['stock_after'], r['reference_type'],
                r['reference_id'], r['reason'], r['performed_by']
            ]
            for r in data.get('all_rows', [])
        ]


# ==============================================================================
# 7. DEMAND PREDICTION & SPIKE REPORTS
# ==============================================================================

class AdminDemandPredictionReportView(AdminBaseReportView):
    report_type = 'demand_predictions'

    def get_data(self, filters):
        return selectors.get_demand_prediction_report_data(filters)


class AdminDemandPredictionExportView(AdminBaseExportView):
    report_type = 'demand_predictions'
    filename_prefix = 'demand_predictions_report'
    csv_headers = ['Prediction ID', 'Shop Name', 'Product Name', 'Target Date', 'Horizon', 'Predicted Demand', 'Actual Demand', 'Error', 'Confidence Score', 'Model', 'Generated At']

    def get_export_rows(self, filters):
        data = selectors.get_demand_prediction_report_data(filters)
        return [
            [
                r['id'], r['shop_name'], r['product_name'], r['target_date'], r['forecast_horizon'],
                r['predicted_demand'], r['actual_demand'], r['error'], r['confidence_score'],
                r['model_name'], r['generated_at']
            ]
            for r in data.get('all_rows', [])
        ]


class AdminDemandSpikeReportView(AdminBaseReportView):
    report_type = 'demand_spikes'

    def get_data(self, filters):
        return selectors.get_demand_spike_report_data(filters)


class AdminDemandSpikeExportView(AdminBaseExportView):
    report_type = 'demand_spikes'
    filename_prefix = 'demand_spikes_report'
    csv_headers = ['Alert ID', 'Shop Name', 'Product Name', 'Date', 'Baseline Demand (7D)', 'Predicted Surge', 'Spike Magnitude', 'Urgency', 'Recommended Reorder Qty', 'Rationale']

    def get_export_rows(self, filters):
        data = selectors.get_demand_spike_report_data(filters)
        return [
            [
                r['id'], r['shop_name'], r['product_name'], r['date'], r['baseline_demand'],
                r['predicted_surge'], r['spike_magnitude'], r['urgency'], r['recommended_quantity'],
                r['rationale']
            ]
            for r in data.get('all_rows', [])
        ]


# ==============================================================================
# 8. ACADEMIC DEMAND REPORT
# ==============================================================================

class AdminAcademicDemandReportView(AdminBaseReportView):
    report_type = 'academic_demand'

    def get_data(self, filters):
        return selectors.get_academic_demand_report_data(filters)


class AdminAcademicDemandExportView(AdminBaseExportView):
    report_type = 'academic_demand'
    filename_prefix = 'academic_demand_report'
    csv_headers = ['Event ID', 'Event Title', 'Event Type', 'Start Date', 'End Date', 'Pre-Event Orders (7D)', 'During-Event Orders', 'Observed Change %']

    def get_export_rows(self, filters):
        data = selectors.get_academic_demand_report_data(filters)
        return [
            [
                r['id'], r['title'], r['event_type'], r['start_date'], r['end_date'],
                r['pre_event_orders'], r['during_event_orders'], f"{r['observed_change_percentage']}%"
            ]
            for r in data.get('all_rows', [])
        ]


# ==============================================================================
# 9. PRINTING REPORT
# ==============================================================================

class AdminPrintingReportView(AdminBaseReportView):
    report_type = 'printing'

    def get_data(self, filters):
        return selectors.get_printing_report_data(filters)


class AdminPrintingExportView(AdminBaseExportView):
    report_type = 'printing'
    filename_prefix = 'printing_report'
    csv_headers = ['Print ID', 'Order Number', 'Shop Name', 'Date', 'Customer', 'Pages', 'Copies', 'Color Mode', 'Paper Size', 'Print Sides', 'Binding', 'Price', 'Status']

    def get_export_rows(self, filters):
        data = selectors.get_printing_report_data(filters)
        return [
            [
                r['id'], r['order_number'], r['shop_name'], r['date'], r['customer'],
                r['pages'], r['copies'], r['color_mode'], r['paper_size'], r['print_sides'],
                r['binding_type'], r['price'], r['status']
            ]
            for r in data.get('all_rows', [])
        ]


# ==============================================================================
# 10. DELIVERY REPORT
# ==============================================================================

class AdminDeliveryReportView(AdminBaseReportView):
    report_type = 'delivery'

    def get_data(self, filters):
        return selectors.get_delivery_report_data(filters)


class AdminDeliveryExportView(AdminBaseExportView):
    report_type = 'delivery'
    filename_prefix = 'delivery_report'
    csv_headers = ['Delivery ID', 'Order Number', 'Shop Name', 'Courier', 'Date', 'Status', 'Priority', 'Estimated Time', 'Duration (Mins)', 'Attempts', 'Failure Reason']

    def get_export_rows(self, filters):
        data = selectors.get_delivery_report_data(filters)
        return [
            [
                r['id'], r['order_number'], r['shop_name'], r['courier_name'], r['date'],
                r['status'], r['priority'], r['estimated_time'], r['duration_mins'],
                r['attempt_count'], r['failure_reason']
            ]
            for r in data.get('all_rows', [])
        ]


# ==============================================================================
# 11. CUSTOMER REPORT
# ==============================================================================

class AdminCustomersReportView(AdminBaseReportView):
    report_type = 'customers'

    def get_data(self, filters):
        return selectors.get_customers_report_data(filters)


class AdminCustomersExportView(AdminBaseExportView):
    report_type = 'customers'
    filename_prefix = 'customers_report'
    csv_headers = ['User ID', 'Username', 'College ID', 'Department', 'Email Verified', 'Orders in Period', 'Spend in Period', 'Member Since']

    def get_export_rows(self, filters):
        data = selectors.get_customers_report_data(filters)
        return [
            [
                r['id'], r['username'], r['college_id'], r['department'],
                r['email_verified'], r['orders_in_period'], r['spend_in_period'], r['joined_at']
            ]
            for r in data.get('all_rows', [])
        ]


# ==============================================================================
# 12. PAYMENTS & REFUNDS REPORTS
# ==============================================================================

class AdminPaymentsReportView(AdminBaseReportView):
    report_type = 'payments'

    def get_data(self, filters):
        return selectors.get_payments_report_data(filters)


class AdminPaymentsExportView(AdminBaseExportView):
    report_type = 'payments'
    filename_prefix = 'payments_report'
    csv_headers = ['Payment ID', 'Order Number', 'Shop Name', 'Customer', 'Date', 'Payment Method', 'Amount', 'Status', 'Gateway', 'Paid At']

    def get_export_rows(self, filters):
        data = selectors.get_payments_report_data(filters)
        return [
            [
                r['id'], r['order_number'], r['shop_name'], r['customer'], r['date'],
                r['payment_method'], r['amount'], r['status'], r['gateway'], r['paid_at']
            ]
            for r in data.get('all_rows', [])
        ]


class AdminRefundsReportView(AdminBaseReportView):
    report_type = 'refunds'

    def get_data(self, filters):
        return selectors.get_refunds_report_data(filters)


class AdminRefundsExportView(AdminBaseExportView):
    report_type = 'refunds'
    filename_prefix = 'refunds_report'
    csv_headers = ['Refund ID', 'Order Number', 'Payment ID', 'Amount', 'Reason', 'Status', 'Requested By', 'Approved By', 'Created At']

    def get_export_rows(self, filters):
        data = selectors.get_refunds_report_data(filters)
        return [
            [
                r['id'], r['order_number'], r['payment_id'], r['amount'], r['reason'],
                r['status'], r['requested_by'], r['approved_by'], r['created_at']
            ]
            for r in data.get('all_rows', [])
        ]


# ==============================================================================
# 13. BULK ORDERS REPORT
# ==============================================================================

class AdminBulkOrdersReportView(AdminBaseReportView):
    report_type = 'bulk_orders'

    def get_data(self, filters):
        return selectors.get_bulk_orders_report_data(filters)


class AdminBulkOrdersExportView(AdminBaseExportView):
    report_type = 'bulk_orders'
    filename_prefix = 'bulk_orders_report'
    csv_headers = ['Bulk Order ID', 'Title', 'Share Code', 'Type', 'Shop Name', 'Coordinator', 'Current Qty', 'Target Qty', 'Total Amount', 'Status', 'Created Date']

    def get_export_rows(self, filters):
        data = selectors.get_bulk_orders_report_data(filters)
        return [
            [
                r['id'], r['title'], r['share_code'], r['order_type'], r['shop_name'],
                r['coordinator'], r['current_quantity'], r['target_quantity'], r['total_amount'],
                r['status'], r['created_at']
            ]
            for r in data.get('all_rows', [])
        ]


# ==============================================================================
# 14. REVIEWS & COMPLAINTS REPORT
# ==============================================================================

class AdminReviewsComplaintsReportView(AdminBaseReportView):
    report_type = 'reviews_complaints'

    def get_data(self, filters):
        return selectors.get_reviews_complaints_report_data(filters)


class AdminReviewsComplaintsExportView(AdminBaseExportView):
    report_type = 'reviews_complaints'
    filename_prefix = 'complaints_report'
    csv_headers = ['Ticket Number', 'User', 'Shop Name', 'Category', 'Subject', 'Priority', 'Status', 'Created At']

    def get_export_rows(self, filters):
        data = selectors.get_reviews_complaints_report_data(filters)
        return [
            [
                r['ticket_number'], r['user'], r['shop_name'], r['category'],
                r['subject'], r['priority'], r['status'], r['created_at']
            ]
            for r in data.get('all_rows', [])
        ]


# ==============================================================================
# 15. OFFERS & COUPONS REPORT
# ==============================================================================

class AdminOffersReportView(AdminBaseReportView):
    report_type = 'offers'

    def get_data(self, filters):
        return selectors.get_offers_report_data(filters)


class AdminOffersExportView(AdminBaseExportView):
    report_type = 'offers'
    filename_prefix = 'coupon_redemptions_report'
    csv_headers = ['Coupon Code', 'User', 'Order Number', 'Discount Applied', 'Used At']

    def get_export_rows(self, filters):
        data = selectors.get_offers_report_data(filters)
        return [
            [r['coupon_code'], r['user'], r['order_number'], r['discount_applied'], r['used_at']]
            for r in data.get('all_rows', [])
        ]


# ==============================================================================
# 16. RECOMMENDATIONS REPORT
# ==============================================================================

class AdminRecommendationsReportView(AdminBaseReportView):
    report_type = 'recommendations'

    def get_data(self, filters):
        return selectors.get_recommendations_report_data(filters)


class AdminRecommendationsExportView(AdminBaseExportView):
    report_type = 'recommendations'
    filename_prefix = 'recommendations_interactions_report'
    csv_headers = ['Interaction ID', 'User', 'Product', 'Type', 'Action', 'Timestamp']

    def get_export_rows(self, filters):
        data = selectors.get_recommendations_report_data(filters)
        return [
            [r['id'], r['user'], r['product'], r['recommendation_type'], r['action'], r['timestamp']]
            for r in data.get('all_rows', [])
        ]


# ==============================================================================
# 17. USER MANAGEMENT REPORT
# ==============================================================================

class AdminUsersReportView(AdminBaseReportView):
    report_type = 'users'

    def get_data(self, filters):
        return selectors.get_user_management_report_data(filters)


class AdminUsersExportView(AdminBaseExportView):
    report_type = 'users'
    filename_prefix = 'user_management_report'
    csv_headers = ['User ID', 'Username', 'Email', 'Role', 'Active', 'Email Verified', 'Joined Date']

    def get_export_rows(self, filters):
        data = selectors.get_user_management_report_data(filters)
        return [
            [r['id'], r['username'], r['email'], r['role'], r['is_active'], r['email_verified'], r['date_joined']]
            for r in data.get('all_rows', [])
        ]
