import sys
import hashlib
from django.core.cache import cache
from . import selectors


class AnalyticsService:
    """
    Centralized analytics and business intelligence service orchestrating database
    selectors, multi-tenant scoped caching, and financial accuracy formatting.
    """
    CACHE_TIMEOUT = 60  # 60 seconds TTL

    @classmethod
    def _is_cache_enabled(cls, request=None):
        if 'test' in sys.argv:
            return False
        if request and request.query_params.get('nocache', '').lower() in ('true', '1'):
            return False
        return True

    @classmethod
    def _build_cache_key(cls, scope_type, scope_id, endpoint_name, query_params):
        # Hash query parameters for stable key generation
        param_str = "&".join(f"{k}={v}" for k, v in sorted(query_params.items()) if k != 'nocache')
        param_hash = hashlib.md5(param_str.encode('utf-8')).hexdigest()[:12]
        return f"analytics:{scope_type}:{scope_id}:{endpoint_name}:{param_hash}"

    # --------------------------------------------------------------------------
    # Shop Analytics Services
    # --------------------------------------------------------------------------

    @classmethod
    def get_shop_overview(cls, shop, date_filters, request=None):
        cache_key = cls._build_cache_key('shop', shop.id, 'overview', request.query_params if request else {})
        if cls._is_cache_enabled(request):
            cached = cache.get(cache_key)
            if cached is not None:
                return cached

        kpis = selectors.get_shop_kpi_summary(shop.id, date_filters['start_datetime'], date_filters['end_datetime'])
        sales_series = selectors.get_daily_sales_series(shop.id, date_filters['start_date'], date_filters['end_date'])
        order_analytics = selectors.get_order_analytics_data(shop.id, date_filters['start_datetime'], date_filters['end_datetime'])
        top_products = selectors.get_top_selling_products(shop.id, date_filters['start_datetime'], date_filters['end_datetime'], limit=5)
        inventory_health = selectors.get_inventory_analytics_data(shop.id)

        data = {
            'shop_id': shop.id,
            'shop_name': shop.name,
            'filters': {
                'start_date': date_filters['start_date'].isoformat(),
                'end_date': date_filters['end_date'].isoformat(),
                'preset': date_filters['preset'],
                'days': date_filters['days'],
            },
            'kpis': kpis,
            'sales_series': sales_series,
            'order_analytics': order_analytics,
            'top_products': top_products,
            'inventory_health': inventory_health,
        }

        if cls._is_cache_enabled(request):
            cache.set(cache_key, data, cls.CACHE_TIMEOUT)

        return data

    @classmethod
    def get_shop_sales(cls, shop, date_filters, request=None):
        cache_key = cls._build_cache_key('shop', shop.id, 'sales', request.query_params if request else {})
        if cls._is_cache_enabled(request):
            cached = cache.get(cache_key)
            if cached is not None:
                return cached

        kpis = selectors.get_shop_kpi_summary(shop.id, date_filters['start_datetime'], date_filters['end_datetime'])
        series = selectors.get_daily_sales_series(shop.id, date_filters['start_date'], date_filters['end_date'])

        data = {
            'shop_id': shop.id,
            'filters': {
                'start_date': date_filters['start_date'].isoformat(),
                'end_date': date_filters['end_date'].isoformat(),
                'preset': date_filters['preset'],
            },
            'summary': {
                'gross_sales': kpis['gross_sales'],
                'discount_amount': kpis['discount_amount'],
                'refund_amount': kpis['refund_amount'],
                'net_revenue': kpis['net_revenue'],
                'average_order_value': kpis['average_order_value'],
                'valid_orders': kpis['completed_orders'] + kpis['pending_orders'],
            },
            'series': series,
        }

        if cls._is_cache_enabled(request):
            cache.set(cache_key, data, cls.CACHE_TIMEOUT)

        return data

    @classmethod
    def get_shop_orders(cls, shop, date_filters, request=None):
        return selectors.get_order_analytics_data(shop.id, date_filters['start_datetime'], date_filters['end_datetime'])

    @classmethod
    def get_shop_products(cls, shop, date_filters, request=None):
        top_by_revenue = selectors.get_top_selling_products(shop.id, date_filters['start_datetime'], date_filters['end_datetime'], limit=10, sort_by='revenue')
        top_by_qty = selectors.get_top_selling_products(shop.id, date_filters['start_datetime'], date_filters['end_datetime'], limit=10, sort_by='quantity')
        performance_matrix = selectors.get_product_performance_matrix(shop.id, date_filters['start_datetime'], date_filters['end_datetime'], days=date_filters['days'])
        category_breakdown = selectors.get_category_analytics_data(shop.id, date_filters['start_datetime'], date_filters['end_datetime'])

        return {
            'top_by_revenue': top_by_revenue,
            'top_by_quantity': top_by_qty,
            'performance_matrix': performance_matrix,
            'categories': category_breakdown,
        }

    @classmethod
    def get_shop_inventory(cls, shop, date_filters, request=None):
        health = selectors.get_inventory_analytics_data(shop.id)
        movements = selectors.get_stock_movement_trends(shop.id, date_filters['start_datetime'], date_filters['end_datetime'])
        return {
            'health': health,
            'movements': movements,
        }

    @classmethod
    def get_shop_demand(cls, shop, request=None):
        predictions_data = selectors.get_demand_prediction_analytics(shop.id)
        academic_data = selectors.get_academic_demand_analytics(shop.id)
        return {
            'demand_predictions': predictions_data,
            'academic_impact': academic_data,
        }

    @classmethod
    def get_shop_printing(cls, shop, date_filters, request=None):
        return selectors.get_printing_analytics_data(shop.id, date_filters['start_datetime'], date_filters['end_datetime'])

    @classmethod
    def get_shop_delivery(cls, shop, date_filters, request=None):
        return selectors.get_delivery_analytics_data(shop.id, date_filters['start_datetime'], date_filters['end_datetime'])

    @classmethod
    def get_shop_customers(cls, shop, date_filters, request=None):
        return selectors.get_customer_analytics_data(shop.id, date_filters['start_datetime'], date_filters['end_datetime'])

    # --------------------------------------------------------------------------
    # Admin Analytics Services
    # --------------------------------------------------------------------------

    @classmethod
    def get_admin_overview(cls, date_filters, request=None):
        cache_key = cls._build_cache_key('admin', 'platform', 'overview', request.query_params if request else {})
        if cls._is_cache_enabled(request):
            cached = cache.get(cache_key)
            if cached is not None:
                return cached

        data = selectors.get_admin_platform_overview(
            date_filters['start_datetime'],
            date_filters['end_datetime'],
            date_filters['start_date'],
            date_filters['end_date']
        )

        if cls._is_cache_enabled(request):
            cache.set(cache_key, data, cls.CACHE_TIMEOUT)

        return data

    # --------------------------------------------------------------------------
    # Student Personal Analytics Service
    # --------------------------------------------------------------------------

    @classmethod
    def get_student_summary(cls, user):
        return selectors.get_student_personal_analytics(user)
