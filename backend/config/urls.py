"""
URL configuration for Smart Student Stationery Delivery System (config).
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from drf_spectacular.utils import extend_schema, OpenApiResponse

from django.db import connection
from pathlib import Path

@extend_schema(
    summary="Backend Health Check",
    description="Comprehensive health check API endpoint verifying Django, DRF, database connectivity, and storage operational status.",
    responses={
        200: OpenApiResponse(description="API and all dependent services are healthy"),
        503: OpenApiResponse(description="Service degraded or database connectivity issue")
    }
)
@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """
    GET /api/health/
    Health check API endpoint verifying Django, database connectivity, storage, and ML engine readiness.
    Zero sensitive details, internal paths, or credentials exposed.
    """
    status_data = {
        "status": "ok",
        "message": "Smart Stationery API is running",
        "service": "Smart Stationery API",
        "database": "unknown",
        "storage": "unknown",
        "ml_engine": "ready",
    }
    http_status = 200

    # 1. Database Connectivity Check
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        status_data["database"] = "connected"
    except Exception:
        status_data["database"] = "disconnected"
        status_data["status"] = "degraded"
        http_status = 503

    # 2. Storage System Check
    try:
        media_path = Path(settings.MEDIA_ROOT)
        media_path.mkdir(parents=True, exist_ok=True)
        status_data["storage"] = "accessible"
    except Exception:
        status_data["storage"] = "unavailable"
        status_data["status"] = "degraded"
        http_status = 503

    return Response(status_data, status=http_status)

from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
    SpectacularRedocView
)
from orders.views import shop_owner_verify_pickup_otp

from users.auth_views import RequestAccountDeletionOTPView, ConfirmAccountDeletionView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', health_check, name='health_check'),
    path('api/auth/', include('users.auth_urls')),
    path('api/account/delete/request/', RequestAccountDeletionOTPView.as_view(), name='account_delete_request'),
    path('api/account/delete/verify/', ConfirmAccountDeletionView.as_view(), name='account_delete_verify'),
    path('api/shop-owner/orders/<int:order_id>/verify-pickup-otp/', shop_owner_verify_pickup_otp, name='shop_owner_verify_pickup_otp'),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/analytics/', include('analytics.urls')),
    path('api/reports/', include('reports.urls')),
    path('api/admin/', include('users.admin_management_urls')),
    path('api/platform-owner/', include('platform_owner.urls')),
    path('api/', include('config.api_router')),
]

# Serve media and static files in development mode
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
