from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    PlatformOwnerDashboardStatsView,
    AdminManagementViewSet,
    UserManagementViewSet,
    ShopOwnerManagementViewSet,
    ShopManagementViewSet,
    DeliveryPartnerManagementViewSet,
    OrderOversightViewSet,
    PaymentOversightViewSet,
    RefundOversightViewSet,
    InventoryOversightViewSet,
    DemandPredictionOversightViewSet,
    PrintoutOversightViewSet,
    LocationOversightView,
    PromoCouponOversightViewSet,
    NotificationBroadcastViewSet,
    AuditLogOversightViewSet,
    PlatformOwnerProfileView,
    PlatformOwnerChangePasswordView,
    PlatformOwnerPasswordChangeStartView,
    PlatformOwnerPasswordChangeVerifyEmailView,
    PlatformOwnerPasswordChangeVerifyTOTPView,
    PlatformOwnerPasswordChangeCompleteView,
    PlatformOwnerTOTPStatusView,
    PlatformOwnerTOTPSetupView,
    PlatformOwnerTOTPConfirmView,
    PlatformOwnerTOTPResetView,
)

router = DefaultRouter()
router.register(r'admins', AdminManagementViewSet, basename='platform-owner-admins')
router.register(r'users', UserManagementViewSet, basename='platform-owner-users')
router.register(r'shop-owners', ShopOwnerManagementViewSet, basename='platform-owner-shop-owners')
router.register(r'shops', ShopManagementViewSet, basename='platform-owner-shops')
router.register(r'delivery-partners', DeliveryPartnerManagementViewSet, basename='platform-owner-delivery-partners')
router.register(r'orders', OrderOversightViewSet, basename='platform-owner-orders')
router.register(r'payments', PaymentOversightViewSet, basename='platform-owner-payments')
router.register(r'refunds', RefundOversightViewSet, basename='platform-owner-refunds')
router.register(r'inventory', InventoryOversightViewSet, basename='platform-owner-inventory')
router.register(r'demand-predictions', DemandPredictionOversightViewSet, basename='platform-owner-demand-predictions')
router.register(r'print-orders', PrintoutOversightViewSet, basename='platform-owner-print-orders')
router.register(r'coupons', PromoCouponOversightViewSet, basename='platform-owner-coupons')
router.register(r'notifications', NotificationBroadcastViewSet, basename='platform-owner-notifications')
router.register(r'audit-logs', AuditLogOversightViewSet, basename='platform-owner-audit-logs')

urlpatterns = [
    path('dashboard-stats/', PlatformOwnerDashboardStatsView.as_view(), name='platform-owner-dashboard-stats'),
    path('locations/', LocationOversightView.as_view(), name='platform-owner-locations'),
    path('profile/', PlatformOwnerProfileView.as_view(), name='platform-owner-profile'),
    path('change-password/', PlatformOwnerChangePasswordView.as_view(), name='platform-owner-change-password'),

    # Platform Owner Staged Password Change with Full 2FA (Step 18A)
    path('security/password-change/start/', PlatformOwnerPasswordChangeStartView.as_view(), name='platform-owner-password-change-start'),
    path('security/password-change/verify-email/', PlatformOwnerPasswordChangeVerifyEmailView.as_view(), name='platform-owner-password-change-verify-email'),
    path('security/password-change/verify-totp/', PlatformOwnerPasswordChangeVerifyTOTPView.as_view(), name='platform-owner-password-change-verify-totp'),
    path('security/password-change/complete/', PlatformOwnerPasswordChangeCompleteView.as_view(), name='platform-owner-password-change-complete'),

    # Microsoft Authenticator (TOTP) Security Management (Step 18)
    path('security/totp/status/', PlatformOwnerTOTPStatusView.as_view(), name='platform-owner-totp-status'),
    path('security/totp/setup/', PlatformOwnerTOTPSetupView.as_view(), name='platform-owner-totp-setup'),
    path('security/totp/confirm/', PlatformOwnerTOTPConfirmView.as_view(), name='platform-owner-totp-confirm'),
    path('security/totp/reset/', PlatformOwnerTOTPResetView.as_view(), name='platform-owner-totp-reset'),

    path('', include(router.urls)),
]
