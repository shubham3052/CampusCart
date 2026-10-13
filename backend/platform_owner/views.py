from decimal import Decimal
from django.db import transaction
from django.db.models import Count, Sum, F, Q
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework import viewsets, status, permissions, filters
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response

from django.core import signing
from users.permissions import IsPlatformOwner
from users.models import AuditLog, EmailVerificationOTP, PlatformOwnerTOTP
from users.services.audit_service import AuditService
from users.services.email_service import EmailService
from users.services.totp_service import OwnerTOTPService
from users.auth_serializers import (
    OwnerPasswordChangeStartSerializer,
    OwnerPasswordChangeVerifyEmailSerializer,
    OwnerPasswordChangeVerifyTOTPSerializer,
    OwnerPasswordChangeCompleteSerializer,
)
from shops.models import Shop
from orders.models import Order, Payment, Refund, Coupon
from inventory.models import Inventory
from printing.models import PrintingOrder
from predictions.models import DemandPrediction
from notifications.models import Notification
from delivery.models import DeliveryZone

from .serializers import (
    AdminManagementSerializer,
    PlatformOwnerUserSerializer,
    PlatformOwnerShopOwnerSerializer,
    PlatformOwnerShopSerializer,
    PlatformOwnerDeliveryPartnerSerializer,
    PlatformOwnerOrderSerializer,
    PlatformOwnerPaymentSerializer,
    PlatformOwnerRefundSerializer,
    PlatformOwnerInventorySerializer,
    PlatformOwnerDemandPredictionSerializer,
    PlatformOwnerPrintingSerializer,
    PlatformOwnerCouponSerializer,
    PlatformOwnerBroadcastSerializer,
    PlatformOwnerAuditLogSerializer,
    PlatformOwnerProfileSerializer,
    ChangePasswordSerializer,
)

User = get_user_model()


class PlatformOwnerDashboardStatsView(APIView):
    """
    GET /api/platform-owner/dashboard-stats/
    Returns 100% authentic, aggregated platform-wide operational and financial metrics.
    Zero mock numbers. Strictly authorized to Platform Owner.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]

    def get(self, request):
        # 1. User Population Breakdown
        total_users = User.objects.count()
        active_users = User.objects.filter(is_active=True).count()
        students_count = User.objects.filter(role=User.Role.STUDENT).count()
        shop_owners_count = User.objects.filter(role=User.Role.SHOP_OWNER).count()
        delivery_agents_count = User.objects.filter(role=User.Role.DELIVERY_AGENT).count()
        admins_count = User.objects.filter(role=User.Role.ADMIN).count()
        platform_owners_count = User.objects.filter(role=User.Role.PLATFORM_OWNER).count()

        # 2. Campus Shop Network
        total_shops = Shop.objects.count()
        active_shops = Shop.objects.filter(is_active=True).count()
        inactive_shops = total_shops - active_shops
        shop_type_aggregates = dict(Shop.objects.values('shop_type').annotate(count=Count('id')).values_list('shop_type', 'count'))

        # 3. Orders Overview
        total_orders = Order.objects.count()
        pending_orders = Order.objects.filter(status=Order.Status.PENDING).count()
        preparing_orders = Order.objects.filter(status__in=[Order.Status.CONFIRMED, Order.Status.PREPARING]).count()
        ready_or_out_orders = Order.objects.filter(status__in=[Order.Status.READY, Order.Status.OUT_FOR_DELIVERY]).count()
        completed_orders = Order.objects.filter(status__in=[Order.Status.DELIVERED, Order.Status.PICKED_UP, Order.Status.COMPLETED]).count()
        cancelled_orders = Order.objects.filter(status=Order.Status.CANCELLED).count()

        # 4. Financial & Gateway Summary
        completed_payments = Payment.objects.filter(status=Payment.Status.CAPTURED)
        gross_revenue = completed_payments.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        successful_payments_count = completed_payments.count()
        failed_payments_count = Payment.objects.filter(status=Payment.Status.FAILED).count()
        total_refunds_count = Refund.objects.count()
        approved_refunds_amount = Refund.objects.filter(status='APPROVED').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        # 5. Inventory & Supply Chain Health
        low_stock_query = Inventory.objects.filter(current_stock__lte=F('reorder_level'))
        low_stock_count = low_stock_query.count()
        out_of_stock_count = Inventory.objects.filter(current_stock=0).count()
        shops_with_low_stock = low_stock_query.values('shop').distinct().count()

        # 6. Recent Real Data Feeds
        recent_orders = PlatformOwnerOrderSerializer(
            Order.objects.select_related('customer', 'shop').order_by('-created_at')[:6],
            many=True
        ).data

        recent_users = PlatformOwnerUserSerializer(
            User.objects.order_by('-created_at')[:6],
            many=True
        ).data

        recent_shops = PlatformOwnerShopSerializer(
            Shop.objects.select_related('owner').order_by('-created_at')[:6],
            many=True
        ).data

        recent_audit_logs = PlatformOwnerAuditLogSerializer(
            AuditLog.objects.order_by('-timestamp')[:8],
            many=True
        ).data

        data = {
            "users": {
                "total": total_users,
                "active": active_users,
                "students": students_count,
                "shop_owners": shop_owners_count,
                "delivery_agents": delivery_agents_count,
                "admins": admins_count,
                "platform_owners": platform_owners_count,
            },
            "shops": {
                "total": total_shops,
                "active": active_shops,
                "inactive": inactive_shops,
                "by_type": shop_type_aggregates,
            },
            "orders": {
                "total": total_orders,
                "pending": pending_orders,
                "preparing": preparing_orders,
                "in_transit": ready_or_out_orders,
                "completed": completed_orders,
                "cancelled": cancelled_orders,
            },
            "financials": {
                "gross_revenue": float(gross_revenue),
                "successful_payments_count": successful_payments_count,
                "failed_payments_count": failed_payments_count,
                "refunds_count": total_refunds_count,
                "refunds_amount": float(approved_refunds_amount),
            },
            "inventory": {
                "low_stock_count": low_stock_count,
                "out_of_stock_count": out_of_stock_count,
                "shops_with_low_stock": shops_with_low_stock,
            },
            "recent_orders": recent_orders,
            "recent_users": recent_users,
            "recent_shops": recent_shops,
            "recent_audit_logs": recent_audit_logs,
        }
        return Response(data, status=status.HTTP_200_OK)


class AdminManagementViewSet(viewsets.ModelViewSet):
    """
    CRUD ViewSet for managing Administrator accounts.
    Strictly restricted to PLATFORM_OWNER.
    Prevents role escalation or creating Platform Owners.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]
    serializer_class = AdminManagementSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['username', 'first_name', 'last_name', 'email', 'phone_number', 'department']

    def get_queryset(self):
        qs = User.objects.filter(role=User.Role.ADMIN).order_by('-created_at')
        is_active_param = self.request.query_params.get('is_active')
        if is_active_param is not None:
            if is_active_param.lower() in ['true', '1']:
                qs = qs.filter(is_active=True)
            elif is_active_param.lower() in ['false', '0']:
                qs = qs.filter(is_active=False)
        return qs

    def destroy(self, request, *args, **kwargs):
        """
        DELETE /api/platform-owner/admins/{id}/
        Prevent direct deletion of administrator accounts to safeguard database integrity,
        audit logs, and platform operations. Admins should be deactivated instead.
        """
        return Response(
            {
                "success": False,
                "error": "AccountDeletionProhibited",
                "message": (
                    "Direct administrator account deletion is prohibited to safeguard audit integrity "
                    "and operational history. Please deactivate the administrator account instead."
                )
            },
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    @action(detail=True, methods=['post'], url_path='toggle-status')
    def toggle_status(self, request, pk=None):
        admin_user = self.get_object()

        # Protection 1: System Owner cannot be deactivated
        if getattr(admin_user, 'is_platform_owner', False) or admin_user.email.lower() == 'garibhokya@gmail.com':
            return Response(
                {
                    "success": False,
                    "error": "SystemOwnerProtection",
                    "message": "The System Owner account cannot be deactivated or modified."
                },
                status=status.HTTP_403_FORBIDDEN
            )

        # Protection 2: Prevent deactivating the only remaining active administrator
        if admin_user.is_active:
            active_admins_count = User.objects.filter(role=User.Role.ADMIN, is_active=True).exclude(id=admin_user.id).count()
            if active_admins_count == 0:
                return Response(
                    {
                        "success": False,
                        "error": "LastAdminProtection",
                        "message": "Cannot deactivate the only remaining active administrator. At least one active administrator must remain on the platform."
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

        admin_user.is_active = not admin_user.is_active
        admin_user.save(update_fields=['is_active'])

        AuditService.log(
            action=AuditLog.Action.ADMIN_ACTION,
            actor=request.user,
            actor_email=request.user.email,
            target_model='User',
            target_id=str(admin_user.id),
            metadata={"sub_action": "ADMIN_STATUS_TOGGLED", "new_is_active": admin_user.is_active},
            request=request
        )

        return Response({
            "id": admin_user.id,
            "email": admin_user.email,
            "is_active": admin_user.is_active,
            "message": f"Administrator account {'activated' if admin_user.is_active else 'deactivated'} successfully."
        }, status=status.HTTP_200_OK)


class UserManagementViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Platform Owner to oversee campus students / users.
    Supports status toggle.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]
    serializer_class = PlatformOwnerUserSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['username', 'first_name', 'last_name', 'email', 'phone_number', 'college_id', 'department']

    def get_queryset(self):
        qs = User.objects.filter(role=User.Role.STUDENT).order_by('-created_at')
        is_active_param = self.request.query_params.get('is_active')
        if is_active_param is not None:
            qs = qs.filter(is_active=(is_active_param.lower() in ['true', '1']))
        verified_param = self.request.query_params.get('verified')
        if verified_param is not None:
            qs = qs.filter(email_verified=(verified_param.lower() in ['true', '1']))
        return qs

    @action(detail=True, methods=['post'], url_path='toggle-status')
    def toggle_status(self, request, pk=None):
        user = self.get_object()
        user.is_active = not user.is_active
        user.save(update_fields=['is_active'])

        AuditService.log(
            action=AuditLog.Action.ADMIN_ACTION,
            actor=request.user,
            actor_email=request.user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={"sub_action": "USER_STATUS_TOGGLED", "new_is_active": user.is_active},
            request=request
        )

        return Response({
            "id": user.id,
            "email": user.email,
            "is_active": user.is_active,
            "message": f"Student account {'activated' if user.is_active else 'deactivated'} successfully."
        }, status=status.HTTP_200_OK)


class ShopOwnerManagementViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Platform Owner to oversee registered shop owners.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]
    serializer_class = PlatformOwnerShopOwnerSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['username', 'first_name', 'last_name', 'email', 'phone_number']

    def get_queryset(self):
        qs = User.objects.filter(role=User.Role.SHOP_OWNER).select_related('owned_shop').order_by('-created_at')
        is_active_param = self.request.query_params.get('is_active')
        if is_active_param is not None:
            qs = qs.filter(is_active=(is_active_param.lower() in ['true', '1']))
        return qs

    @action(detail=True, methods=['post'], url_path='toggle-status')
    def toggle_status(self, request, pk=None):
        shop_owner = self.get_object()
        shop_owner.is_active = not shop_owner.is_active
        shop_owner.save(update_fields=['is_active'])

        # Also toggle associated shop
        shop = getattr(shop_owner, 'owned_shop', None)
        if shop:
            shop.is_active = shop_owner.is_active
            shop.save(update_fields=['is_active'])

        AuditService.log(
            action=AuditLog.Action.ADMIN_ACTION,
            actor=request.user,
            actor_email=request.user.email,
            target_model='User',
            target_id=str(shop_owner.id),
            metadata={"sub_action": "SHOP_OWNER_STATUS_TOGGLED", "new_is_active": shop_owner.is_active},
            request=request
        )

        return Response({
            "id": shop_owner.id,
            "email": shop_owner.email,
            "is_active": shop_owner.is_active,
            "message": f"Shop owner account {'activated' if shop_owner.is_active else 'deactivated'} successfully."
        }, status=status.HTTP_200_OK)


class ShopManagementViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Platform Owner to oversee campus stores.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]
    serializer_class = PlatformOwnerShopSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'address', 'campus_location', 'contact_phone', 'contact_email', 'owner__email', 'owner__username']

    def get_queryset(self):
        qs = Shop.objects.select_related('owner').order_by('-created_at')
        is_active_param = self.request.query_params.get('is_active')
        if is_active_param is not None:
            qs = qs.filter(is_active=(is_active_param.lower() in ['true', '1']))
        shop_type_param = self.request.query_params.get('shop_type')
        if shop_type_param:
            qs = qs.filter(shop_type=shop_type_param)
        return qs

    @action(detail=True, methods=['post'], url_path='toggle-status')
    def toggle_status(self, request, pk=None):
        shop = self.get_object()
        shop.is_active = not shop.is_active
        shop.save(update_fields=['is_active'])

        AuditService.log(
            action=AuditLog.Action.ADMIN_ACTION,
            actor=request.user,
            actor_email=request.user.email,
            target_model='Shop',
            target_id=str(shop.id),
            metadata={"sub_action": "SHOP_STATUS_TOGGLED", "new_is_active": shop.is_active},
            request=request
        )

        return Response({
            "id": shop.id,
            "name": shop.name,
            "is_active": shop.is_active,
            "message": f"Store '{shop.name}' {'activated' if shop.is_active else 'deactivated'} successfully."
        }, status=status.HTTP_200_OK)


class DeliveryPartnerManagementViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Platform Owner to oversee delivery agents.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]
    serializer_class = PlatformOwnerDeliveryPartnerSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['username', 'first_name', 'last_name', 'email', 'phone_number']

    def get_queryset(self):
        qs = User.objects.filter(role=User.Role.DELIVERY_AGENT).order_by('-created_at')
        status_param = self.request.query_params.get('availability_status')
        if status_param:
            qs = qs.filter(availability_status=status_param)
        approval_param = self.request.query_params.get('approval_status')
        if approval_param:
            qs = qs.filter(approval_status=approval_param)
        is_active_param = self.request.query_params.get('is_active')
        if is_active_param is not None:
            qs = qs.filter(is_active=(is_active_param.lower() in ['true', '1']))
        return qs

    @action(detail=True, methods=['post'], url_path='approve')
    def approve_courier(self, request, pk=None):
        courier = self.get_object()
        courier.approval_status = User.ApprovalStatus.APPROVED
        courier.save(update_fields=['approval_status'])

        Notification.objects.create(
            recipient=courier,
            notification_type=Notification.NotificationType.DELIVERY_UPDATE,
            title="Courier Application Approved",
            message="Congratulations! Your delivery partner application has been approved by the platform owner. You can now accept deliveries."
        )

        AuditService.log(
            action=AuditLog.Action.ADMIN_ACTION,
            actor=request.user,
            actor_email=request.user.email,
            target_model='User',
            target_id=str(courier.id),
            metadata={"sub_action": "COURIER_APPROVED", "courier_email": courier.email},
            request=request
        )

        return Response({
            "id": courier.id,
            "email": courier.email,
            "approval_status": courier.approval_status,
            "message": f"Delivery courier '{courier.email}' approved successfully."
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject_courier(self, request, pk=None):
        courier = self.get_object()
        reason = request.data.get('reason', 'Application did not meet campus delivery criteria.')
        courier.approval_status = User.ApprovalStatus.REJECTED
        courier.save(update_fields=['approval_status'])

        Notification.objects.create(
            recipient=courier,
            notification_type=Notification.NotificationType.DELIVERY_UPDATE,
            title="Courier Application Status Update",
            message=f"Your delivery partner application was not approved. Reason: {reason}"
        )

        AuditService.log(
            action=AuditLog.Action.ADMIN_ACTION,
            actor=request.user,
            actor_email=request.user.email,
            target_model='User',
            target_id=str(courier.id),
            metadata={"sub_action": "COURIER_REJECTED", "courier_email": courier.email, "reason": reason},
            request=request
        )

        return Response({
            "id": courier.id,
            "email": courier.email,
            "approval_status": courier.approval_status,
            "message": f"Delivery courier '{courier.email}' rejected."
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='toggle-status')
    def toggle_status(self, request, pk=None):
        courier = self.get_object()
        courier.is_active = not courier.is_active
        courier.save(update_fields=['is_active'])

        AuditService.log(
            action=AuditLog.Action.ADMIN_ACTION,
            actor=request.user,
            actor_email=request.user.email,
            target_model='User',
            target_id=str(courier.id),
            metadata={"sub_action": "COURIER_STATUS_TOGGLED", "new_is_active": courier.is_active},
            request=request
        )

        return Response({
            "id": courier.id,
            "email": courier.email,
            "is_active": courier.is_active,
            "message": f"Delivery courier {'activated' if courier.is_active else 'deactivated'} successfully."
        }, status=status.HTTP_200_OK)


class OrderOversightViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Platform Owner system-wide order feed.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]
    serializer_class = PlatformOwnerOrderSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['order_number', 'customer__username', 'customer__email', 'customer__first_name', 'shop__name']

    def get_queryset(self):
        qs = Order.objects.select_related('customer', 'shop').prefetch_related('items__product').order_by('-created_at')
        order_status = self.request.query_params.get('status')
        if order_status:
            qs = qs.filter(status=order_status)
        order_type = self.request.query_params.get('order_type')
        if order_type:
            qs = qs.filter(order_type=order_type)
        return qs

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel_order(self, request, pk=None):
        order = self.get_object()
        reason = request.data.get('reason', 'Administrative intervention by Platform Owner.')

        if order.status in [Order.Status.COMPLETED, Order.Status.CANCELLED]:
            return Response(
                {"detail": f"Cannot cancel an order that is already {order.status}."},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            old_status = order.status
            order.status = Order.Status.CANCELLED
            order.cancellation_reason = reason
            order.cancelled_by = request.user
            order.cancelled_at = timezone.now()
            order.save()

            # Release reserved inventory
            for item in order.items.all():
                try:
                    inv = Inventory.objects.get(shop=order.shop, product=item.product)
                    inv.release_reservation(item.quantity)
                except Inventory.DoesNotExist:
                    pass

            # Log audit
            AuditService.log(
                action=AuditLog.Action.ORDER_CANCELLED,
                actor=request.user,
                actor_email=request.user.email,
                target_model='Order',
                target_id=str(order.id),
                metadata={"reason": reason, "previous_status": old_status},
                request=request
            )

        return Response({
            "order_number": str(order.order_number),
            "status": order.status,
            "message": "Order successfully cancelled and inventory released."
        }, status=status.HTTP_200_OK)


class PaymentOversightViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Platform Owner to monitor payment gateway records.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]
    serializer_class = PlatformOwnerPaymentSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['transaction_id', 'order__order_number', 'order__customer__email', 'gateway_name']

    def get_queryset(self):
        qs = Payment.objects.select_related('order__customer').order_by('-created_at')
        payment_status = self.request.query_params.get('status')
        if payment_status:
            qs = qs.filter(status=payment_status)
        return qs


class RefundOversightViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Platform Owner to monitor customer refunds.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]
    serializer_class = PlatformOwnerRefundSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['refund_number', 'order__order_number', 'order__customer__email', 'reason']

    def get_queryset(self):
        qs = Refund.objects.select_related('order__customer').order_by('-created_at')
        refund_status = self.request.query_params.get('status')
        if refund_status:
            qs = qs.filter(status=refund_status)
        return qs


class InventoryOversightViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Platform Owner to monitor inventory health and stockouts across all campus stores.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]
    serializer_class = PlatformOwnerInventorySerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['product__name', 'product__sku', 'shop__name', 'product__category__name']

    def get_queryset(self):
        qs = Inventory.objects.select_related('shop', 'product__category').order_by('current_stock')
        low_stock_only = self.request.query_params.get('low_stock')
        if low_stock_only and low_stock_only.lower() in ['true', '1']:
            qs = qs.filter(current_stock__lte=F('reorder_level'))
        shop_id = self.request.query_params.get('shop')
        if shop_id:
            qs = qs.filter(shop_id=shop_id)
        return qs


class DemandPredictionOversightViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Platform Owner to oversee ML demand forecasts and trends.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]
    serializer_class = PlatformOwnerDemandPredictionSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['product__name', 'shop__name', 'product__category__name']

    def get_queryset(self):
        qs = DemandPrediction.objects.select_related('shop', 'product__category').order_by('-target_date')
        horizon = self.request.query_params.get('horizon')
        if horizon:
            qs = qs.filter(forecast_horizon=horizon)
        return qs


class PrintoutOversightViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Platform Owner to oversee student document printing jobs.
    Safely presents metadata only, zero raw file leakage.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]
    serializer_class = PlatformOwnerPrintingSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['order__order_number', 'order__shop__name', 'order__customer__email']

    def get_queryset(self):
        qs = PrintingOrder.objects.select_related('order__shop', 'order__customer').order_by('-created_at')
        print_status = self.request.query_params.get('status')
        if print_status:
            qs = qs.filter(status=print_status)
        return qs


class LocationOversightView(APIView):
    """
    GET /api/platform-owner/locations/
    Provides registered store locations, GPS coordinates, and campus delivery zones.
    No live GPS tracking.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]

    def get(self, request):
        shops = Shop.objects.filter(latitude__isnull=False, longitude__isnull=False).values(
            'id', 'name', 'shop_type', 'campus_location', 'address', 'latitude', 'longitude', 'is_active', 'rating', 'contact_phone'
        )
        zones = DeliveryZone.objects.values(
            'id', 'name', 'minimum_distance', 'maximum_distance', 'base_charge'
        )

        return Response({
            "shops": list(shops),
            "zones": list(zones),
        }, status=status.HTTP_200_OK)


class PromoCouponOversightViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Platform Owner to manage and oversee promotional campaigns and coupons.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]
    serializer_class = PlatformOwnerCouponSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['code', 'title', 'description']

    def get_queryset(self):
        return Coupon.objects.all().order_by('-created_at')

    @action(detail=True, methods=['post'], url_path='toggle-status')
    def toggle_status(self, request, pk=None):
        coupon = self.get_object()
        coupon.is_active = not coupon.is_active
        coupon.save(update_fields=['is_active'])

        AuditService.log(
            action=AuditLog.Action.COUPON_MODIFIED,
            actor=request.user,
            actor_email=request.user.email,
            target_model='Coupon',
            target_id=str(coupon.id),
            metadata={"code": coupon.code, "new_is_active": coupon.is_active},
            request=request
        )

        return Response({
            "id": coupon.id,
            "code": coupon.code,
            "is_active": coupon.is_active,
            "message": f"Coupon {coupon.code} {'activated' if coupon.is_active else 'deactivated'} successfully."
        }, status=status.HTTP_200_OK)


class NotificationBroadcastViewSet(viewsets.ViewSet):
    """
    ViewSet for Platform Owner notification feed & broadcasting alerts.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]

    def list(self, request):
        notifications = Notification.objects.filter(recipient=request.user).order_by('-created_at')[:50]
        data = [{
            "id": n.id,
            "title": n.title,
            "message": n.message,
            "notification_type": n.notification_type,
            "is_read": n.is_read,
            "created_at": n.created_at,
        } for n in notifications]
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request):
        count = Notification.objects.filter(recipient=request.user, is_read=False).count()
        return Response({"unread_count": count}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='mark-all-read')
    def mark_all_read(self, request):
        count = Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
        return Response({"success": True, "marked_count": count}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='broadcast')
    def broadcast(self, request):
        serializer = PlatformOwnerBroadcastSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target_group = serializer.validated_data['target_group']
        title = serializer.validated_data['title']
        message = serializer.validated_data['message']
        notification_type = serializer.validated_data.get('notification_type', Notification.NotificationType.OFFER_ALERT)

        recipient_qs = User.objects.filter(is_active=True)
        if target_group == 'STUDENT':
            recipient_qs = recipient_qs.filter(role=User.Role.STUDENT)
        elif target_group == 'SHOP_OWNER':
            recipient_qs = recipient_qs.filter(role=User.Role.SHOP_OWNER)
        elif target_group == 'DELIVERY_AGENT':
            recipient_qs = recipient_qs.filter(role=User.Role.DELIVERY_AGENT)
        elif target_group == 'ADMIN':
            recipient_qs = recipient_qs.filter(role=User.Role.ADMIN)

        recipients = list(recipient_qs)
        notifications_to_create = [
            Notification(
                recipient=u,
                title=title,
                message=message,
                notification_type=notification_type
            )
            for u in recipients
        ]
        created = Notification.objects.bulk_create(notifications_to_create)

        AuditService.log(
            action=AuditLog.Action.ADMIN_ACTION,
            actor=request.user,
            actor_email=request.user.email,
            target_model='Notification',
            metadata={"broadcast_target": target_group, "count": len(created), "title": title},
            request=request
        )

        return Response({
            "success": True,
            "dispatched_count": len(created),
            "target_group": target_group,
            "message": f"Broadcast dispatched to {len(created)} active accounts."
        }, status=status.HTTP_201_CREATED)


class AuditLogOversightViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Platform Owner to examine security audit logs.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]
    serializer_class = PlatformOwnerAuditLogSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['actor_email', 'action', 'target_model', 'target_id']

    def get_queryset(self):
        qs = AuditLog.objects.all().order_by('-timestamp')
        action_param = self.request.query_params.get('action')
        if action_param:
            qs = qs.filter(action=action_param)
        return qs


class PlatformOwnerProfileView(APIView):
    """
    GET /api/platform-owner/profile/
    PATCH /api/platform-owner/profile/
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]

    def get(self, request):
        serializer = PlatformOwnerProfileSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request):
        user = request.user
        serializer = PlatformOwnerProfileSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


class PlatformOwnerChangePasswordView(APIView):
    """
    POST /api/platform-owner/change-password/
    Legacy direct password change endpoint - strictly disabled for Platform Owner.
    Full 2FA (Gmail OTP and Microsoft Authenticator TOTP) is required.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]

    def post(self, request):
        return Response(
            {
                "success": False,
                "message": "Direct password change is disabled for Platform Owner. Full Two-Factor Authentication (Gmail OTP and Microsoft Authenticator) is required via /api/platform-owner/security/password-change/."
            },
            status=status.HTTP_400_BAD_REQUEST
        )


class PlatformOwnerPasswordChangeStartView(APIView):
    """
    POST /api/platform-owner/security/password-change/start/
    Stage 1: Validates current password, verifies active TOTP requirement, and dispatches Gmail OTP.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]

    def post(self, request):
        serializer = OwnerPasswordChangeStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        current_password = serializer.validated_data['current_password']

        # Verify Owner role
        if not (getattr(user, 'is_platform_owner', False) or user.has_role(User.Role.PLATFORM_OWNER) or user.email.lower() == 'garibhokya@gmail.com'):
            return Response(
                {"success": False, "message": "Only Platform Owner accounts can access this endpoint."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Verify current password
        if not user.check_password(current_password):
            AuditService.log(
                action=AuditLog.Action.OWNER_PASSWORD_CHANGE_FAILURE,
                actor=user,
                actor_email=user.email,
                target_model='User',
                target_id=str(user.id),
                metadata={"reason": "INVALID_CURRENT_PASSWORD"},
                request=request
            )
            return Response(
                {"success": False, "message": "Current password does not match our records."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Enforce that Microsoft Authenticator TOTP is active
        totp_config = PlatformOwnerTOTP.objects.filter(user=user).first()
        if not (totp_config and totp_config.enabled and totp_config.verified):
            AuditService.log(
                action=AuditLog.Action.OWNER_PASSWORD_CHANGE_FAILURE,
                actor=user,
                actor_email=user.email,
                target_model='User',
                target_id=str(user.id),
                metadata={"reason": "TOTP_NOT_ACTIVE"},
                request=request
            )
            return Response(
                {
                    "success": False,
                    "message": "Microsoft Authenticator (TOTP) must be enabled and active on your account before changing your password. Please complete TOTP enrollment in Security settings."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        AuditService.log(
            action=AuditLog.Action.OWNER_PASSWORD_CHANGE_STARTED,
            actor=user,
            actor_email=user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={"stage": "STARTED"},
            request=request
        )

        AuditService.log(
            action=AuditLog.Action.OWNER_PASSWORD_CHANGE_PASSWORD_VERIFIED,
            actor=user,
            actor_email=user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={"stage": "PASSWORD_VERIFIED"},
            request=request
        )

        # Dispatch 6-digit Gmail OTP to registered Owner email
        sent, dispatch_msg, otp_rec = EmailService.create_and_send_otp(
            email=user.email,
            purpose=EmailVerificationOTP.Purpose.OWNER_PASSWORD_CHANGE,
            user=user
        )

        if not sent:
            return Response(
                {"success": False, "message": dispatch_msg},
                status=status.HTTP_429_TOO_MANY_REQUESTS if ("wait" in dispatch_msg or "limit" in dispatch_msg) else status.HTTP_400_BAD_REQUEST
            )

        AuditService.log(
            action=AuditLog.Action.OWNER_PASSWORD_CHANGE_OTP_SENT,
            actor=user,
            actor_email=user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={"otp_id": otp_rec.id if otp_rec else None},
            request=request
        )

        stage_token = signing.dumps(
            {
                'user_id': user.id,
                'email': user.email.lower(),
                'purpose': 'OWNER_PASSWORD_CHANGE',
                'stage': 'PASSWORD_VERIFIED',
                'ts': timezone.now().timestamp()
            },
            salt='owner-password-change-salt'
        )

        return Response(
            {
                "success": True,
                "stage": "PASSWORD_VERIFIED",
                "stage_token": stage_token,
                "email": user.email,
                "message": "Current password confirmed. A 6-digit verification code has been sent to your registered Platform Owner email."
            },
            status=status.HTTP_200_OK
        )


class PlatformOwnerPasswordChangeVerifyEmailView(APIView):
    """
    POST /api/platform-owner/security/password-change/verify-email/
    Stage 2: Verifies Gmail OTP and advances challenge to Microsoft Authenticator stage.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]

    def post(self, request):
        serializer = OwnerPasswordChangeVerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        stage_token = serializer.validated_data['stage_token']
        code = serializer.validated_data['code']

        try:
            payload = signing.loads(stage_token, salt='owner-password-change-salt', max_age=300)
        except signing.SignatureExpired:
            return Response(
                {"success": False, "message": "Password change session expired. Please start again."},
                status=status.HTTP_400_BAD_REQUEST
            )
        except signing.BadSignature:
            return Response(
                {"success": False, "message": "Invalid password change token."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if payload.get('purpose') != 'OWNER_PASSWORD_CHANGE' or payload.get('stage') != 'PASSWORD_VERIFIED':
            return Response(
                {"success": False, "message": "Invalid password change stage."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if payload.get('user_id') != user.id or payload.get('email', '').lower() != user.email.lower():
            return Response(
                {"success": False, "message": "Password change challenge was issued to a different account."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Verify Gmail OTP
        success, message, otp_rec = EmailService.verify_otp(
            email=user.email,
            candidate_otp=code,
            purpose=EmailVerificationOTP.Purpose.OWNER_PASSWORD_CHANGE,
            user=user
        )

        if not success:
            AuditService.log(
                action=AuditLog.Action.OWNER_PASSWORD_CHANGE_OTP_FAILED,
                actor=user,
                actor_email=user.email,
                target_model='User',
                target_id=str(user.id),
                metadata={"reason": message},
                request=request
            )
            return Response({"success": False, "message": message}, status=status.HTTP_400_BAD_REQUEST)

        AuditService.log(
            action=AuditLog.Action.OWNER_PASSWORD_CHANGE_OTP_SUCCESS,
            actor=user,
            actor_email=user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={"otp_id": otp_rec.id if otp_rec else None},
            request=request
        )

        next_token = signing.dumps(
            {
                'user_id': user.id,
                'email': user.email.lower(),
                'purpose': 'OWNER_PASSWORD_CHANGE',
                'stage': 'EMAIL_OTP_VERIFIED',
                'ts': timezone.now().timestamp()
            },
            salt='owner-password-change-salt'
        )

        return Response(
            {
                "success": True,
                "stage": "EMAIL_OTP_VERIFIED",
                "stage_token": next_token,
                "message": "Email verification code confirmed. Please enter your 6-digit code from Microsoft Authenticator."
            },
            status=status.HTTP_200_OK
        )


class PlatformOwnerPasswordChangeVerifyTOTPView(APIView):
    """
    POST /api/platform-owner/security/password-change/verify-totp/
    Stage 3: Verifies Microsoft Authenticator TOTP and issues full MFA authorization token.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]

    def post(self, request):
        serializer = OwnerPasswordChangeVerifyTOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        stage_token = serializer.validated_data['stage_token']
        code = serializer.validated_data['code']

        try:
            payload = signing.loads(stage_token, salt='owner-password-change-salt', max_age=300)
        except signing.SignatureExpired:
            return Response(
                {"success": False, "message": "Password change session expired. Please start again."},
                status=status.HTTP_400_BAD_REQUEST
            )
        except signing.BadSignature:
            return Response(
                {"success": False, "message": "Invalid password change token."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if payload.get('purpose') != 'OWNER_PASSWORD_CHANGE' or payload.get('stage') != 'EMAIL_OTP_VERIFIED':
            return Response(
                {"success": False, "message": "Invalid password change stage."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if payload.get('user_id') != user.id or payload.get('email', '').lower() != user.email.lower():
            return Response(
                {"success": False, "message": "Password change challenge was issued to a different account."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Verify TOTP code via OwnerTOTPService
        valid, msg = OwnerTOTPService.verify_login_code(user, code, request=request)
        if not valid:
            AuditService.log(
                action=AuditLog.Action.OWNER_PASSWORD_CHANGE_TOTP_FAILED,
                actor=user,
                actor_email=user.email,
                target_model='User',
                target_id=str(user.id),
                metadata={"reason": msg},
                request=request
            )
            return Response({"success": False, "message": msg}, status=status.HTTP_400_BAD_REQUEST)

        AuditService.log(
            action=AuditLog.Action.OWNER_PASSWORD_CHANGE_TOTP_SUCCESS,
            actor=user,
            actor_email=user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={"stage": "TOTP_VERIFIED"},
            request=request
        )

        auth_token = signing.dumps(
            {
                'user_id': user.id,
                'email': user.email.lower(),
                'purpose': 'OWNER_PASSWORD_CHANGE',
                'stage': 'FULL_MFA_VERIFIED',
                'ts': timezone.now().timestamp()
            },
            salt='owner-password-change-salt'
        )

        return Response(
            {
                "success": True,
                "stage": "FULL_MFA_VERIFIED",
                "stage_token": auth_token,
                "message": "Microsoft Authenticator verified. You may now set your new password."
            },
            status=status.HTTP_200_OK
        )


class PlatformOwnerPasswordChangeCompleteView(APIView):
    """
    POST /api/platform-owner/security/password-change/complete/
    Stage 4: Verifies full MFA authorization token, updates password, and invalidates all existing sessions.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]

    def post(self, request):
        serializer = OwnerPasswordChangeCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        stage_token = serializer.validated_data['stage_token']
        new_password = serializer.validated_data['new_password']

        try:
            payload = signing.loads(stage_token, salt='owner-password-change-salt', max_age=300)
        except signing.SignatureExpired:
            return Response(
                {"success": False, "message": "Password change session expired. Please start again."},
                status=status.HTTP_400_BAD_REQUEST
            )
        except signing.BadSignature:
            return Response(
                {"success": False, "message": "Invalid password change authorization token."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if payload.get('purpose') != 'OWNER_PASSWORD_CHANGE' or payload.get('stage') != 'FULL_MFA_VERIFIED':
            return Response(
                {"success": False, "message": "Incomplete verification. Both Gmail OTP and Microsoft Authenticator are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if payload.get('user_id') != user.id or payload.get('email', '').lower() != user.email.lower():
            return Response(
                {"success": False, "message": "Password change challenge was issued to a different account."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Reject if new password matches current password
        if user.check_password(new_password):
            return Response(
                {"new_password": ["New password cannot be the same as your current password."]},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Update password using Django's set_password()
        user.set_password(new_password)
        user.save()

        # Invalidate all existing tokens and sessions
        try:
            from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
            tokens = OutstandingToken.objects.filter(user=user)
            for tok in tokens:
                BlacklistedToken.objects.get_or_create(token=tok)
        except Exception:
            pass

        AuditService.log(
            action=AuditLog.Action.OWNER_PASSWORD_CHANGE_SUCCESS,
            actor=user,
            actor_email=user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={"method": "MFA_GMAIL_AND_TOTP"},
            request=request
        )

        AuditService.log(
            action=AuditLog.Action.PASSWORD_CHANGE,
            actor=user,
            actor_email=user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={"role": "PLATFORM_OWNER", "mfa_verified": True},
            request=request
        )

        return Response(
            {
                "success": True,
                "message": "Platform Owner password has been successfully updated. All existing sessions have been revoked. Please sign in again with your new password."
            },
            status=status.HTTP_200_OK
        )


class PlatformOwnerTOTPStatusView(APIView):
    """
    GET /api/platform-owner/security/totp/status/
    Returns current Microsoft Authenticator configuration status for Platform Owner.
    Never exposes secrets or recovery keys.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]

    def get(self, request):
        user = request.user
        totp_config = getattr(user, 'owner_totp', None)
        enabled = bool(totp_config and totp_config.enabled and totp_config.verified)
        verified_at = totp_config.verified_at if totp_config and totp_config.verified else None
        return Response({
            "success": True,
            "email": user.email,
            "enabled": enabled,
            "verified": bool(totp_config and totp_config.verified),
            "verified_at": verified_at.isoformat() if verified_at else None,
            "issuer": "CampusCart"
        }, status=status.HTTP_200_OK)


class PlatformOwnerTOTPSetupView(APIView):
    """
    POST /api/platform-owner/security/totp/setup/
    Initiates Microsoft Authenticator enrollment.
    Returns QR code data URI and manual setup key.
    Only accessible by authenticated Platform Owner.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]

    def post(self, request):
        from users.services.totp_service import OwnerTOTPService
        user = request.user
        enrollment_data = OwnerTOTPService.initiate_enrollment(user, request=request)
        return Response({
            "success": True,
            "provisioning_uri": enrollment_data["provisioning_uri"],
            "manual_entry_key": enrollment_data["manual_entry_key"],
            "qr_code_data_uri": enrollment_data["qr_code_data_uri"],
            "issuer": enrollment_data["issuer"],
            "account": enrollment_data["account"],
            "message": "Scan the QR code with Microsoft Authenticator, then enter the 6-digit code to confirm."
        }, status=status.HTTP_200_OK)


class PlatformOwnerTOTPConfirmView(APIView):
    """
    POST /api/platform-owner/security/totp/confirm/
    Confirms TOTP enrollment with first 6-digit code from Microsoft Authenticator.
    Activates TOTP on success.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]

    def post(self, request):
        from users.services.totp_service import OwnerTOTPService
        from users.auth_serializers import OwnerTOTPConfirmSerializer
        serializer = OwnerTOTPConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data['code']

        success, message = OwnerTOTPService.confirm_enrollment(request.user, code, request=request)
        if not success:
            return Response({"success": False, "message": message}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "success": True,
            "message": message,
            "enabled": True,
            "verified": True
        }, status=status.HTTP_200_OK)


class PlatformOwnerTOTPResetView(APIView):
    """
    POST /api/platform-owner/security/totp/reset/
    Securely resets Microsoft Authenticator configuration.
    Requires account password + current authenticator code.
    Admin CANNOT disable Platform Owner TOTP.
    """
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwner]

    def post(self, request):
        from users.services.totp_service import OwnerTOTPService
        from users.auth_serializers import OwnerTOTPResetSerializer
        serializer = OwnerTOTPResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        password = serializer.validated_data['password']
        code = serializer.validated_data['code']

        success, message = OwnerTOTPService.reset_totp(request.user, password, code, request=request)
        if not success:
            return Response({"success": False, "message": message}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "success": True,
            "message": message,
            "enabled": False,
            "verified": False
        }, status=status.HTTP_200_OK)

