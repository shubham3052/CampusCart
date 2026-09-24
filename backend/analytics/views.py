from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from drf_spectacular.utils import extend_schema, OpenApiParameter

from .filters import parse_date_range
from .permissions import (
    IsShopOwnerForAnalytics,
    IsAdminForAnalytics,
    IsStudentForAnalytics,
    get_authorized_shop_for_request,
)
from .services import AnalyticsService
from .serializers import ShopOverviewResponseSerializer, StudentAnalyticsSummarySerializer


# ==============================================================================
# SHOP OWNER ANALYTICS VIEWS
# ==============================================================================

class ShopOverviewView(APIView):
    """
    GET /api/analytics/shop/overview/
    Top-level BI overview for shop owners: KPI cards, 30-day sales curve,
    order distribution, top 5 products, and inventory health snapshot.
    """
    permission_classes = [permissions.IsAuthenticated, IsShopOwnerForAnalytics]

    @extend_schema(
        summary="Shop Owner BI Overview",
        description="Returns top-level KPIs, sales trend, order breakdown, and inventory snapshot for the authenticated merchant.",
        parameters=[
            OpenApiParameter('preset', str, description="Preset range: today, 7d, 30d, 90d, month, year"),
            OpenApiParameter('start_date', str, description="Custom start date (YYYY-MM-DD)"),
            OpenApiParameter('end_date', str, description="Custom end date (YYYY-MM-DD)"),
        ],
        responses={200: ShopOverviewResponseSerializer}
    )
    def get(self, request):
        shop = get_authorized_shop_for_request(request)
        date_filters = parse_date_range(request.query_params)
        data = AnalyticsService.get_shop_overview(shop, date_filters, request)
        return Response(data, status=status.HTTP_200_OK)


class ShopSalesView(APIView):
    """
    GET /api/analytics/shop/sales/
    Detailed sales analytics: gross sales, discounts, refunds, net revenue,
    and daily/weekly time series for chart rendering.
    """
    permission_classes = [permissions.IsAuthenticated, IsShopOwnerForAnalytics]

    def get(self, request):
        shop = get_authorized_shop_for_request(request)
        date_filters = parse_date_range(request.query_params)
        data = AnalyticsService.get_shop_sales(shop, date_filters, request)
        return Response(data, status=status.HTTP_200_OK)


class ShopOrdersView(APIView):
    """
    GET /api/analytics/shop/orders/
    Order status distribution, completion rate, cancellation rate, and refund rate.
    """
    permission_classes = [permissions.IsAuthenticated, IsShopOwnerForAnalytics]

    def get(self, request):
        shop = get_authorized_shop_for_request(request)
        date_filters = parse_date_range(request.query_params)
        data = AnalyticsService.get_shop_orders(shop, date_filters, request)
        return Response(data, status=status.HTTP_200_OK)


class ShopProductsView(APIView):
    """
    GET /api/analytics/shop/products/
    Product sales rankings, velocity classification (FAST/NORMAL/SLOW/DEAD),
    days of cover, and category sales breakdown.
    """
    permission_classes = [permissions.IsAuthenticated, IsShopOwnerForAnalytics]

    def get(self, request):
        shop = get_authorized_shop_for_request(request)
        date_filters = parse_date_range(request.query_params)
        data = AnalyticsService.get_shop_products(shop, date_filters, request)
        return Response(data, status=status.HTTP_200_OK)


class ShopInventoryView(APIView):
    """
    GET /api/analytics/shop/inventory/
    Inventory valuation, low/out-of-stock counts, turnover ratio,
    and stock movement transaction timeline.
    """
    permission_classes = [permissions.IsAuthenticated, IsShopOwnerForAnalytics]

    def get(self, request):
        shop = get_authorized_shop_for_request(request)
        date_filters = parse_date_range(request.query_params)
        data = AnalyticsService.get_shop_inventory(shop, date_filters, request)
        return Response(data, status=status.HTTP_200_OK)


class ShopDemandView(APIView):
    """
    GET /api/analytics/shop/demand/
    Demand prediction accuracy evaluation (MAE, RMSE, MAPE),
    upcoming 7-day forecasts, demand spike warnings, and academic event impact.
    """
    permission_classes = [permissions.IsAuthenticated, IsShopOwnerForAnalytics]

    def get(self, request):
        shop = get_authorized_shop_for_request(request)
        data = AnalyticsService.get_shop_demand(shop, request)
        return Response(data, status=status.HTTP_200_OK)


class ShopPrintingView(APIView):
    """
    GET /api/analytics/shop/printing/
    Xerox and printing analytics: print volume, page counts, B/W vs Color,
    paper sizes, binding orders, and average turnaround time.
    """
    permission_classes = [permissions.IsAuthenticated, IsShopOwnerForAnalytics]

    def get(self, request):
        shop = get_authorized_shop_for_request(request)
        date_filters = parse_date_range(request.query_params)
        data = AnalyticsService.get_shop_printing(shop, date_filters, request)
        return Response(data, status=status.HTTP_200_OK)


class ShopDeliveryView(APIView):
    """
    GET /api/analytics/shop/delivery/
    Campus delivery logistics analytics: success rates, delivery delays,
    and assigned courier performance metrics.
    """
    permission_classes = [permissions.IsAuthenticated, IsShopOwnerForAnalytics]

    def get(self, request):
        shop = get_authorized_shop_for_request(request)
        date_filters = parse_date_range(request.query_params)
        data = AnalyticsService.get_shop_delivery(shop, date_filters, request)
        return Response(data, status=status.HTTP_200_OK)


class ShopCustomersView(APIView):
    """
    GET /api/analytics/shop/customers/
    Student customer intelligence: acquisition, repeat purchase percentage,
    average spend, and order frequency.
    """
    permission_classes = [permissions.IsAuthenticated, IsShopOwnerForAnalytics]

    def get(self, request):
        shop = get_authorized_shop_for_request(request)
        date_filters = parse_date_range(request.query_params)
        data = AnalyticsService.get_shop_customers(shop, date_filters, request)
        return Response(data, status=status.HTTP_200_OK)


# ==============================================================================
# PLATFORM ADMIN ANALYTICS VIEWS
# ==============================================================================

class AdminOverviewView(APIView):
    """
    GET /api/analytics/admin/overview/
    SuperAdmin platform BI dashboard: system-wide KPIs, multi-shop comparison,
    revenue streams (stationery, printing, delivery, bulk), and user growth trends.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminForAnalytics]

    def get(self, request):
        date_filters = parse_date_range(request.query_params)
        data = AnalyticsService.get_admin_overview(date_filters, request)
        return Response(data, status=status.HTTP_200_OK)


class AdminShopsView(APIView):
    """
    GET /api/analytics/admin/shops/
    Multi-shop comparison table ranking merchants by revenue, orders, AOV, and rating.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminForAnalytics]

    def get(self, request):
        date_filters = parse_date_range(request.query_params)
        overview = AnalyticsService.get_admin_overview(date_filters, request)
        return Response({'shops': overview['shop_comparison']}, status=status.HTTP_200_OK)


class AdminUsersView(APIView):
    """
    GET /api/analytics/admin/users/
    User registration growth and demographic role breakdown.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminForAnalytics]

    def get(self, request):
        date_filters = parse_date_range(request.query_params)
        overview = AnalyticsService.get_admin_overview(date_filters, request)
        return Response({
            'user_roles': overview['user_roles'],
            'growth_trend': overview['user_growth_trend']
        }, status=status.HTTP_200_OK)


# ==============================================================================
# STUDENT PERSONAL ANALYTICS VIEW
# ==============================================================================

class StudentSummaryView(APIView):
    """
    GET /api/analytics/student/summary/
    Lightweight, privacy-safe personal activity summary for the authenticated student.
    """
    permission_classes = [permissions.IsAuthenticated, IsStudentForAnalytics]

    @extend_schema(
        summary="Student Personal Activity Summary",
        description="Returns total student spend, completed order counts, printing page counts, and favorite categories.",
        responses={200: StudentAnalyticsSummarySerializer}
    )
    def get(self, request):
        data = AnalyticsService.get_student_summary(request.user)
        return Response(data, status=status.HTTP_200_OK)
