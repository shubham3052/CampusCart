from decimal import Decimal
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.shortcuts import get_object_or_404
from django.db import models, transaction
from django.utils import timezone
from .models import (
    Order,
    BulkOrder,
    OTPVerification,
    BulkOrderItem,
    BulkOrderParticipant,
    Coupon,
    CouponUsage,
    Complaint,
    ComplaintMessage,
    Payment,
    Refund,
)
from .serializers import (
    OrderSerializer,
    OrderCreateSerializer,
    BulkOrderSerializer,
    CouponSerializer,
    ComplaintSerializer,
    ComplaintMessageSerializer,
    PaymentSerializer,
    PaymentCreateIntentSerializer,
    PaymentVerifySerializer,
    RefundSerializer,
    RefundActionSerializer,
)
from .services.bulk_order_service import BulkOrderService
from .services.discount_service import DiscountService
from .services.payment_service import PaymentService
from .services.refund_service import RefundService
from .services.reconciliation_service import ReconciliationService
from notifications.models import Notification
from users.permissions import IsOrderParticipantOrAdmin, IsAdmin, IsShopOwnerOrAdmin, IsShopEntityOwnerOrAdmin
from users.models import AuditLog
from users.services.audit_service import AuditService
from users.services.security_service import SecurityMonitoringService



class OrderViewSet(viewsets.ModelViewSet):
    """
    Order Placement and Lifecycle Management ViewSet.
    
    SECURITY (STEP 7 RBAC):
    - Authenticated access only.
    - Students: Create orders, view only their own orders.
    - Shop Owners: View and update status ONLY for orders placed at their own shop.
    - Admins: Global visibility and full management access.
    - Delivery Agents: View and update deliveries assigned to them.
    - Cross-shop or cross-user unauthorized access is strictly prevented.
    """
    permission_classes = [permissions.IsAuthenticated, IsOrderParticipantOrAdmin]
    lookup_field = 'id'

    def get_object(self):
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        lookup_val = self.kwargs[lookup_url_kwarg]
        queryset = self.filter_queryset(self.get_queryset())
        if str(lookup_val).isdigit():
            obj = queryset.filter(id=lookup_val).first()
        else:
            obj = queryset.filter(order_number=lookup_val).first()
        if not obj:
            from rest_framework.exceptions import NotFound
            raise NotFound("Order not found or you do not have permission to view it.")
        self.check_object_permissions(self.request, obj)
        return obj

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Order.objects.none()

        base_qs = Order.objects.select_related(
            'customer', 'shop', 'pickup_slot'
        ).prefetch_related('items__product', 'otps').order_by('-created_at')

        if user.is_admin:
            return base_qs.all()
        elif user.is_shop_owner:
            return base_qs.filter(shop__owner=user)
        elif user.is_student:
            return base_qs.filter(customer=user)
        elif user.is_delivery_agent:
            return base_qs.filter(delivery_details__delivery_agent=user)
        return Order.objects.none()

    def get_serializer_class(self):
        if self.action == 'create':
            return OrderCreateSerializer
        return OrderSerializer

    def create(self, request, *args, **kwargs):
        # Only students and admins can place orders
        if not (request.user.is_student or request.user.is_admin):
            raise PermissionDenied("Only student accounts or administrators can place stationery orders.")

        serializer = self.get_serializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        output_serializer = OrderSerializer(order)
        return Response(
            {
                "success": True,
                "message": f"Order #{str(order.order_number)[:8]} successfully placed!",
                "order": output_serializer.data
            },
            status=status.HTTP_201_CREATED
        )

    def update(self, request, *args, **kwargs):
        order = self.get_object()
        user = request.user

        # Students cannot modify order status directly
        if user.is_student and not user.is_admin:
            raise PermissionDenied("Students cannot modify order status once placed.")

        # Shop owners can only update orders for their own shop
        if user.is_shop_owner and not user.is_admin:
            if not order.shop or order.shop.owner != user:
                raise PermissionDenied("You cannot modify orders belonging to another shop.")

        new_status = request.data.get('status')
        if new_status and new_status != order.status:
            if not order.can_transition_to(new_status):
                allowed = order.VALID_TRANSITIONS.get(order.status, [])
                return Response(
                    {
                        "success": False,
                        "message": f"Invalid order status transition. Cannot move from '{order.status}' to '{new_status}'. Allowed next states: {allowed}"
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )
            if new_status == Order.Status.READY and order.fulfillment_type == Order.FulfillmentType.PICKUP:
                order.generate_pickup_otp()

        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=['get'], url_path='pickup-otp')
    def get_pickup_otp(self, request, id=None):
        """
        GET /api/orders/{id}/pickup-otp/
        Secure endpoint for students to view their 6-digit pickup OTP.
        Strictly accessible only by the order's customer or admin.
        Only returns OTP when order is in READY status.
        """
        order = self.get_object()
        user = request.user

        if not user.is_admin and order.customer != user:
            raise PermissionDenied("You do not have permission to view the pickup OTP for this order.")

        if order.fulfillment_type != Order.FulfillmentType.PICKUP:
            return Response(
                {"success": False, "message": "This is not a counter pickup order."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if order.status not in [Order.Status.READY, Order.Status.PICKED_UP]:
            return Response(
                {
                    "success": False,
                    "message": f"Order is not ready for pickup yet. Current status: '{order.get_status_display()}'. OTP will be generated once ready."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        otp_record = order.otps.filter(
            purpose=OTPVerification.Purpose.PICKUP,
            is_verified=False
        ).order_by('-created_at').first()

        if not otp_record or otp_record.expires_at < timezone.now():
            plain_otp, otp_record = order.generate_pickup_otp()
        else:
            plain_otp = otp_record.get_plaintext_otp()

        return Response({
            "success": True,
            "order_number": str(order.order_number),
            "otp": plain_otp,
            "expires_at": otp_record.expires_at,
            "purpose": otp_record.purpose,
            "attempts_remaining": max(0, otp_record.max_attempts - otp_record.attempt_count)
        })

    def _perform_otp_verification(self, request, order, is_shop_owner_endpoint=False):
        user = request.user

        # Role authorization
        is_shop_owner = order.shop and order.shop.owner == user
        is_customer = order.customer == user
        is_admin = user.is_admin
        is_agent = user.is_delivery_agent and hasattr(order, 'delivery_details') and order.delivery_details.delivery_agent == user

        if is_shop_owner_endpoint:
            if not (is_admin or is_shop_owner):
                raise PermissionDenied("Only the merchant of this shop can verify pickup OTP via this endpoint.")
        else:
            if not (is_admin or is_shop_owner or is_customer or is_agent):
                raise PermissionDenied("You are not authorized to verify fulfillment for this order.")

        code = request.data.get('otp') or request.data.get('otp_code', '')
        if isinstance(code, str):
            code = code.strip()
        else:
            code = str(code) if code is not None else ''

        if not code:
            return Response(
                {"success": False, "message": "OTP code is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            locked_order = Order.objects.select_for_update().get(id=order.id)

            if locked_order.status == Order.Status.COMPLETED:
                return Response(
                    {"success": False, "message": "Order is already completed. OTP has already been used."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if locked_order.fulfillment_type == Order.FulfillmentType.PICKUP:
                if locked_order.status not in [Order.Status.READY, Order.Status.PICKED_UP]:
                    return Response(
                        {"success": False, "message": f"Order is not ready for pickup yet. Current status: '{locked_order.get_status_display()}'."},
                        status=status.HTTP_400_BAD_REQUEST
                    )

            target_purpose = OTPVerification.Purpose.DELIVERY if locked_order.fulfillment_type == Order.FulfillmentType.DELIVERY else OTPVerification.Purpose.PICKUP

            otp_record = locked_order.otps.select_for_update().filter(
                purpose=target_purpose
            ).order_by('-created_at').first()

            if not otp_record:
                return Response(
                    {"success": False, "message": "No active OTP found for this order."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if otp_record.is_verified:
                return Response(
                    {"success": False, "message": "This OTP has already been verified and used."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if otp_record.attempt_count >= otp_record.max_attempts:
                return Response(
                    {"success": False, "message": "Maximum verification attempts exceeded. This OTP is locked."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            now = timezone.now()
            if otp_record.expires_at < now:
                return Response(
                    {"success": False, "message": "This OTP has expired. Please request a new one."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if not otp_record.check_otp(code):
                otp_record.attempt_count += 1
                otp_record.save()
                remaining = max(0, otp_record.max_attempts - otp_record.attempt_count)
                SecurityMonitoringService.record_failed_otp(
                    AuditService.get_client_ip(request),
                    identifier=str(locked_order.id),
                    purpose=otp_record.purpose,
                    request=request
                )
                AuditService.log(
                    action=AuditLog.Action.OTP_FAILED,
                    actor=user,
                    target_model='Order',
                    target_id=str(locked_order.id),
                    metadata={"purpose": otp_record.purpose, "attempts_remaining": remaining},
                    request=request
                )
                return Response(
                    {
                        "success": False,
                        "message": f"Invalid OTP code. {remaining} attempt(s) remaining.",
                        "attempts_remaining": remaining
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

            otp_record.is_verified = True
            otp_record.verified_at = now
            otp_record.verified_by = user
            otp_record.verified_by_role = 'SHOP_OWNER' if is_shop_owner else ('STUDENT' if is_customer else 'ADMIN')
            otp_record.save()

            AuditService.log(
                action=AuditLog.Action.OTP_VERIFIED,
                actor=user,
                target_model='Order',
                target_id=str(locked_order.id),
                metadata={"purpose": otp_record.purpose, "role": otp_record.verified_by_role},
                request=request
            )

            if locked_order.fulfillment_type == Order.FulfillmentType.PICKUP:
                locked_order.status = Order.Status.COMPLETED
            else:
                locked_order.status = Order.Status.COMPLETED
                if locked_order.payment_method == Order.PaymentMethod.COD:
                    locked_order.payment_status = Order.PaymentStatus.PAID
                if hasattr(locked_order, 'delivery_details'):
                    locked_order.delivery_details.delivery_status = 'DELIVERED'
                    locked_order.delivery_details.delivered_at = now
                    locked_order.delivery_details.save()

            locked_order.save()

            if hasattr(locked_order, 'printing_details'):
                p_order = locked_order.printing_details
                p_order.status = 'COMPLETED'
                p_order.completed_at = now
                p_order.save()

            try:
                Notification.objects.create(
                    recipient=locked_order.customer,
                    title="Pickup Completed!",
                    message=f"Order #{str(locked_order.order_number)[:8]} has been successfully verified and collected at {locked_order.shop.name}. Thank you!",
                    notification_type=Notification.NotificationType.ORDER_STATUS,
                    reference_id=str(locked_order.order_number)
                )
            except Exception:
                pass

        return Response({
            "success": True,
            "message": f"Pickup verified successfully! Order #{str(locked_order.order_number)[:8]} completed.",
            "order": OrderSerializer(locked_order, context={'request': request}).data,
            "verified_at": otp_record.verified_at,
            "verified_by": user.username,
            "verified_by_role": otp_record.verified_by_role
        })

    @action(detail=True, methods=['get'], url_path='delivery-otp')
    def get_delivery_otp(self, request, id=None):
        """
        GET /api/orders/{id}/delivery-otp/
        Dedicated secure retrieval endpoint for the ordering student to view their delivery OTP.
        """
        order = self.get_object()
        user = request.user
        if not (user.is_admin or order.customer == user):
            raise PermissionDenied("You are not authorized to view the delivery OTP for this order.")

        if order.status not in [Order.Status.OUT_FOR_DELIVERY, Order.Status.READY]:
            return Response(
                {"success": False, "message": f"Order is not out for delivery yet. Current status: '{order.get_status_display()}'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        now = timezone.now()
        otp_record = order.otps.filter(
            purpose=OTPVerification.Purpose.DELIVERY,
            is_verified=False,
            expires_at__gt=now
        ).order_by('-created_at').first()

        if not otp_record:
            plain_otp, otp_record = order.generate_delivery_otp(expiry_minutes=120)
        else:
            plain_otp = otp_record.get_plaintext_otp()

        return Response({
            "success": True,
            "order_number": str(order.order_number),
            "otp": plain_otp,
            "expires_at": otp_record.expires_at,
            "purpose": otp_record.purpose,
            "attempts_remaining": max(0, otp_record.max_attempts - otp_record.attempt_count)
        })

    @action(detail=True, methods=['post'], url_path='verify-delivery-otp')
    def verify_delivery_otp(self, request, id=None):
        """
        POST /api/orders/{id}/verify-delivery-otp/
        Dedicated endpoint for delivery OTP verification.
        """
        order = self.get_object()
        return self._perform_otp_verification(request, order, is_shop_owner_endpoint=False)

    @action(detail=True, methods=['post'], url_path='verify-pickup-otp')
    def verify_pickup_otp(self, request, id=None):
        """
        POST /api/orders/{id}/verify-pickup-otp/
        Dedicated endpoint for pickup OTP verification.
        Accessible by shop owner, customer, delivery agent, or admin.
        """
        order = self.get_object()
        return self._perform_otp_verification(request, order, is_shop_owner_endpoint=False)

    @action(detail=True, methods=['post'], url_path='verify-otp')
    def verify_otp(self, request, id=None):
        """
        POST /api/orders/{id}/verify-otp/
        Legacy and universal endpoint for OTP verification.
        """
        order = self.get_object()
        return self._perform_otp_verification(request, order, is_shop_owner_endpoint=False)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel_order(self, request, id=None):
        """
        Allows a student to cancel their own PENDING order and restores inventory stock safely.
        """
        order = self.get_object()
        user = request.user
        if user.is_student and order.customer != user:
            raise PermissionDenied("You can only cancel your own orders.")
        if user.is_shop_owner and order.shop.owner != user:
            raise PermissionDenied("You can only cancel orders for your own shop.")

        if order.status != Order.Status.PENDING:
            return Response(
                {
                    "success": False,
                    "message": f"Only PENDING orders can be cancelled. Current status is '{order.status}'."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        from django.db import transaction
        from inventory.models import Inventory, InventoryTransaction

        with transaction.atomic():
            order.status = Order.Status.CANCELLED
            order.save()

            AuditService.log(
                action=AuditLog.Action.ORDER_CANCELLED,
                actor=user,
                target_model='Order',
                target_id=str(order.id),
                request=request
            )

            # Restore inventory stock
            for item in order.items.select_related('product'):
                inv = Inventory.objects.select_for_update().filter(shop=order.shop, product=item.product).first()
                if inv:
                    stock_before = inv.current_stock
                    inv.current_stock += item.quantity
                    inv.last_stock_update = timezone.now()
                    inv.save()
                    InventoryTransaction.objects.create(
                        inventory=inv,
                        transaction_type=InventoryTransaction.TransactionType.RETURN,
                        quantity_change=item.quantity,
                        stock_before=stock_before,
                        stock_after=inv.current_stock,
                        reference_type='ORDER_CANCELLATION',
                        reference_id=f"CANCELLED_ORDER_{order.id}",
                        reason=f"Order #{str(order.order_number)[:8]} cancelled by {user.username}",
                        notes=f"Stock returned from cancelled order #{str(order.order_number)[:8]}",
                        performed_by=user
                    )

            # If pickup slot was reserved, decrement booked_count
            if order.pickup_slot and order.pickup_slot.booked_count > 0:
                order.pickup_slot.booked_count -= 1
                order.pickup_slot.save()

            # Auto-refund if order was already paid
            auto_refund = RefundService.auto_refund_on_cancellation(
                order=order,
                user=user,
                reason=request.data.get('reason', 'Order cancelled by user')
            )

        return Response({
            "success": True,
            "message": f"Order #{str(order.order_number)[:8]} successfully cancelled.",
            "order": OrderSerializer(order).data,
            "refund": RefundSerializer(auto_refund).data if auto_refund else None
        })


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def shop_owner_verify_pickup_otp(request, order_id):
    """
    POST /api/shop-owner/orders/{order_id}/verify-pickup-otp/
    Explicit shop-owner endpoint for verifying customer counter pickup OTP.
    Enforces that only the shop owner belonging to the order's shop can verify the OTP.
    """
    order = get_object_or_404(Order, id=order_id)
    viewset = OrderViewSet()
    viewset.request = request
    return viewset._perform_otp_verification(request, order, is_shop_owner_endpoint=True)


class BulkOrderViewSet(viewsets.ModelViewSet):
    """
    Step 23: Bulk / Class Ordering API.
    Enables class representatives, student teams, and groups to aggregate quantities,
    unlock quantity-based tiered discounts, invite members via share codes,
    and reserve inventory atomically.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = BulkOrderSerializer

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return BulkOrder.objects.none()

        base_qs = BulkOrder.objects.select_related('user', 'shop', 'pickup_slot', 'delivery_slot').prefetch_related(
            'items__product', 'participants__user', 'participants__item_selections__bulk_order_item', 'audit_logs'
        ).order_by('-created_at')

        if getattr(user, 'is_admin', False):
            return base_qs.all()
        elif getattr(user, 'is_shop_owner', False):
            return base_qs.filter(shop__owner=user)
        elif self.action in ['join', 'join_by_code_detail', 'join_by_code_detail_hyphen']:
            return base_qs.filter(status=BulkOrder.Status.OPEN)
        else:
            # Student: created by user OR user has joined as participant
            from django.db.models import Q
            return base_qs.filter(Q(user=user) | Q(participants__user=user)).distinct()

    def create(self, request, *args, **kwargs):
        """
        POST /api/bulk-orders/
        Create a new bulk or class order with items and calculated volume tiers.
        """
        data = request.data
        shop_id = data.get('shop_id') or data.get('shop')
        if not shop_id:
            return Response({'error': 'shop_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        from shops.models import Shop
        shop = get_object_or_404(Shop, id=shop_id)

        try:
            bulk_order = BulkOrderService.create_bulk_order(
                user=request.user,
                shop=shop,
                title=data.get('title') or data.get('name', 'Class Bulk Order'),
                description=data.get('description', ''),
                order_type=data.get('order_type', 'CLASS'),
                items_data=data.get('items', []),
                participant_limit=data.get('participant_limit'),
                deadline=data.get('deadline'),
                fulfillment_type=data.get('fulfillment_type') or data.get('delivery_method', 'PICKUP'),
                pickup_slot_id=data.get('pickup_slot_id'),
                delivery_slot_id=data.get('delivery_slot_id'),
                delivery_address=data.get('delivery_address', ''),
            )
            serializer = self.get_serializer(bulk_order)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='join-by-code')
    def join_by_code(self, request):
        """
        POST /api/bulk-orders/join-by-code/
        Allows a student to join an active class order using the 6-character share code.
        """
        code = (request.data.get('share_code') or '').strip().upper()
        if not code:
            return Response({'error': 'share_code is required'}, status=status.HTTP_400_BAD_REQUEST)

        bulk_order = BulkOrder.objects.filter(share_code__iexact=code).first()
        if not bulk_order:
            return Response({'error': f"No active bulk order found with code '{code}'."}, status=status.HTTP_404_NOT_FOUND)

        try:
            participant = BulkOrderService.join_bulk_order(
                bulk_order=bulk_order,
                user=request.user,
                item_allocations=request.data.get('items', []),
                notes=request.data.get('notes', '')
            )
            bulk_order.refresh_from_db()
            serializer = self.get_serializer(bulk_order)
            return Response(serializer.data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='join_by_code')
    def join_by_code_alt(self, request):
        return self.join_by_code(request)

    @action(detail=True, methods=['post'], url_path='join_by_code')
    def join_by_code_detail(self, request, pk=None):
        bulk_order = self.get_object()
        try:
            participant = BulkOrderService.join_bulk_order(
                bulk_order=bulk_order,
                user=request.user,
                item_allocations=request.data.get('items', []),
                notes=request.data.get('notes', '')
            )
            bulk_order.refresh_from_db()
            serializer = self.get_serializer(bulk_order)
            return Response(serializer.data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='join-by-code')
    def join_by_code_detail_hyphen(self, request, pk=None):
        return self.join_by_code_detail(request, pk=pk)

    @action(detail=True, methods=['post'], url_path='join')
    def join(self, request, pk=None):
        """
        POST /api/bulk-orders/{id}/join/
        Join via ID with requested quantities.
        """
        bulk_order = self.get_object()
        try:
            participant = BulkOrderService.join_bulk_order(
                bulk_order=bulk_order,
                user=request.user,
                item_allocations=request.data.get('items', []),
                notes=request.data.get('notes', '')
            )
            bulk_order.refresh_from_db()
            serializer = self.get_serializer(bulk_order)
            return Response(serializer.data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='confirm')
    def confirm(self, request, pk=None):
        """
        POST /api/bulk-orders/{id}/confirm/
        Creator or Admin confirms order, validating and atomically reserving required stock.
        """
        bulk_order = self.get_object()
        if request.user != bulk_order.user and not getattr(request.user, 'is_admin', False):
            return Response({'error': 'Only the order creator or an administrator can confirm this bulk order.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            confirmed_order = BulkOrderService.confirm_bulk_order(bulk_order, request.user)
            serializer = self.get_serializer(confirmed_order)
            return Response(serializer.data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        """
        POST /api/bulk-orders/{id}/cancel/
        Cancels order and releases reserved stock.
        """
        bulk_order = self.get_object()
        if request.user != bulk_order.user and not getattr(request.user, 'is_admin', False):
            return Response({'error': 'Only the order creator or an administrator can cancel this bulk order.'}, status=status.HTTP_403_FORBIDDEN)

        reason = request.data.get('reason', 'Cancelled by user')
        try:
            cancelled_order = BulkOrderService.cancel_bulk_order(bulk_order, request.user, reason=reason)
            serializer = self.get_serializer(cancelled_order)
            return Response(serializer.data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='advance-status')
    def advance_status(self, request, pk=None):
        """
        POST /api/bulk-orders/{id}/advance-status/
        Shopkeeper progresses order through PROCESSING -> READY -> OUT_FOR_DELIVERY -> COMPLETED.
        """
        bulk_order = self.get_object()
        new_status = request.data.get('status')

        if request.user != bulk_order.shop.owner and not getattr(request.user, 'is_admin', False):
            return Response({'error': 'Only the shop owner or admin can update order fulfillment status.'}, status=status.HTTP_403_FORBIDDEN)

        valid_targets = ['PROCESSING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED']
        if new_status not in valid_targets:
            return Response({'error': f"Invalid status. Must be one of {valid_targets}"}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            bulk_order.status = new_status

            # If COMPLETED, finalize stock deductions
            if new_status == 'COMPLETED':
                from inventory.models import Inventory, InventoryTransaction
                for b_item in bulk_order.items.all():
                    if b_item.item_type == 'STATIONERY' and b_item.product:
                        inv = Inventory.objects.select_for_update().filter(
                            shop=bulk_order.shop,
                            product=b_item.product
                        ).first()
                        if inv:
                            qty = max(b_item.target_quantity, b_item.allocated_quantity)
                            stock_before = inv.current_stock
                            inv.current_stock = max(0, inv.current_stock - qty)
                            inv.reserved_stock = max(0, inv.reserved_stock - qty)
                            inv.last_stock_update = timezone.now()
                            inv.save()

                            InventoryTransaction.objects.create(
                                inventory=inv,
                                transaction_type=InventoryTransaction.TransactionType.PURCHASE,
                                quantity_change=-qty,
                                stock_before=stock_before,
                                stock_after=inv.current_stock,
                                reference_type='BULK_ORDER',
                                reference_id=str(bulk_order.id),
                                reason=f"Bulk fulfillment for {bulk_order.title}",
                                performed_by=request.user
                            )

            bulk_order.save(update_fields=['status', 'updated_at'])

            from orders.models import BulkOrderAudit
            BulkOrderAudit.objects.create(
                bulk_order=bulk_order,
                user=request.user,
                action='STATUS_CHANGED',
                details={'new_status': new_status}
            )

            serializer = self.get_serializer(bulk_order)
            return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='advance_status')
    def advance_status_underscore(self, request, pk=None):
        return self.advance_status(request, pk=pk)

    @action(detail=False, methods=['get'], url_path='analytics')
    def analytics(self, request):
        """
        GET /api/bulk-orders/analytics/
        Operational overview of bulk purchasing volume, discounts, and participant metrics.
        """
        qs = self.get_queryset()
        total_orders = qs.count()
        confirmed_orders = qs.filter(status__in=['CONFIRMED', 'PROCESSING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED']).count()
        completed_orders = qs.filter(status='COMPLETED').count()

        from django.db.models import Sum, Avg
        total_volume = qs.filter(status__in=['CONFIRMED', 'PROCESSING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED']).aggregate(
            vol=Sum('total_amount'),
            discount=Sum('discount_amount')
        )

        from orders.models import BulkOrderParticipant
        total_participants = BulkOrderParticipant.objects.filter(bulk_order__in=qs, status='ACTIVE').count()

        return Response({
            'total_bulk_orders': total_orders,
            'confirmed_orders': confirmed_orders,
            'completed_orders': completed_orders,
            'gross_bulk_sales': float(total_volume['vol'] or 0.0),
            'total_discounts_granted': float(total_volume['discount'] or 0.0),
            'total_active_participants': total_participants,
            'average_participants_per_order': round(total_participants / max(1, total_orders), 1),
        })


class CouponViewSet(viewsets.ModelViewSet):
    """
    Step 24: Promo Codes and Coupons API.
    Supports platform and shop-isolated discount coupons, validation, user broadcasts, and usage tracking.
    """
    serializer_class = CouponSerializer
    lookup_field = 'id'

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'validate_code']:
            permission_classes = [permissions.AllowAny]
        elif self.action in ['create', 'notify_users', 'usages', 'toggle_active']:
            permission_classes = [permissions.IsAuthenticated, IsShopOwnerOrAdmin]
        else:
            permission_classes = [permissions.IsAuthenticated, IsShopEntityOwnerOrAdmin]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        user = self.request.user
        queryset = Coupon.objects.select_related('shop', 'created_by').all()

        shop_id = self.request.query_params.get('shop')
        if shop_id:
            queryset = queryset.filter(shop_id=shop_id)

        # Non-admins or unauthenticated students only see active coupons
        if not user or not user.is_authenticated or not getattr(user, 'is_admin', False):
            if user and user.is_authenticated and getattr(user, 'is_shop_owner', False):
                # Merchant sees their own shop coupons
                queryset = queryset.filter(shop__owner=user)
            else:
                # Student/public: only active coupons
                now = timezone.now()
                queryset = queryset.filter(
                    is_active=True,
                    valid_from__lte=now,
                    valid_until__gte=now
                )

        code = self.request.query_params.get('code')
        if code:
            queryset = queryset.filter(code__iexact=code)

        return queryset.order_by('-created_at')

    def perform_create(self, serializer):
        user = self.request.user
        shop = serializer.validated_data.get('shop')
        if not getattr(user, 'is_admin', False):
            if not user.is_shop_owner:
                raise PermissionDenied("Only administrators and shop owners can create promo codes.")
            if not shop or (hasattr(shop, 'owner') and shop.owner != user):
                raise PermissionDenied("You can only create coupons for your own registered shop.")
        serializer.save(created_by=user)

    def perform_update(self, serializer):
        user = self.request.user
        if not getattr(user, 'is_admin', False):
            if not user.is_shop_owner or not serializer.instance.shop or serializer.instance.shop.owner != user:
                raise PermissionDenied("You do not have permission to modify this promo code.")
        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user
        if not getattr(user, 'is_admin', False):
            if not user.is_shop_owner or not instance.shop or instance.shop.owner != user:
                raise PermissionDenied("You do not have permission to delete this promo code.")
        instance.delete()

    @action(detail=False, methods=['post'], url_path='validate')
    def validate_code(self, request):
        """
        POST /api/coupons/validate/
        Validates coupon against shop, order items, and user limits authoritatively.
        """
        code = request.data.get('code', '')
        shop_id = request.data.get('shop')
        items = request.data.get('items', [])
        if isinstance(items, str):
            import json
            try:
                items = json.loads(items)
            except Exception:
                items = []

        user = request.user if request.user.is_authenticated else None
        result = DiscountService.validate_coupon(
            code=code,
            customer=user,
            shop=shop_id,
            items_data=items
        )

        return Response({
            "is_valid": result["is_valid"],
            "valid": result["is_valid"],
            "message": result["message"],
            "coupon_code": code.upper(),
            "discount_amount": float(result["discount_amount"]),
            "subtotal": float(result["subtotal"]),
            "final_amount": float(result["final_amount"]),
        }, status=status.HTTP_200_OK if result["is_valid"] else status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='notify-users')
    def notify_users(self, request, id=None):
        """
        POST /api/coupons/{id}/notify-users/
        Broadcasts promotional coupon to eligible students with duplicate dampening.
        """
        coupon = self.get_object()
        user = request.user

        if not (user.is_admin or (user.is_shop_owner and coupon.shop and coupon.shop.owner == user)):
            raise PermissionDenied("You are not authorized to broadcast this promotional code.")

        if not coupon.is_active:
            return Response(
                {"success": False, "message": "Cannot broadcast an inactive promo code. Please activate it first."},
                status=status.HTTP_400_BAD_REQUEST
            )

        from django.contrib.auth import get_user_model
        from notifications.models import Notification, NotificationPreference
        User = get_user_model()

        # Target audience: eligible active students
        students = User.objects.filter(role=User.Role.STUDENT, is_active=True)

        # Check existing notifications for this promo to avoid duplicates
        ref_id = f"PROMO:{coupon.code}"
        existing_recipient_ids = set(
            Notification.objects.filter(
                notification_type=Notification.NotificationType.OFFER_ALERT,
                reference_id=ref_id
            ).values_list('recipient_id', flat=True)
        )

        # Respect user notification preferences
        opt_out_ids = set(
            NotificationPreference.objects.filter(offers_promotions=False).values_list('user_id', flat=True)
        )

        # Formulate promotional message
        if coupon.discount_type == Coupon.DiscountType.PERCENTAGE:
            discount_str = f"{coupon.discount_value:.0f}%"
        else:
            discount_str = f"₹{coupon.discount_value:.2f}"

        min_str = f" Minimum order: ₹{coupon.min_order_amount:.0f}." if coupon.min_order_amount > 0 else ""
        max_str = f" Maximum discount: ₹{coupon.max_discount:.0f}." if coupon.max_discount else ""
        valid_until_str = coupon.valid_until.strftime('%d %B %Y')
        shop_str = f" at {coupon.shop.name}" if coupon.shop else ""

        title = f"New Offer 🎉: {coupon.code}"
        msg = f"Use code {coupon.code} to get {discount_str} off eligible orders{shop_str}.{min_str}{max_str} Valid until {valid_until_str}."

        notifications_to_create = []
        for s in students:
            if s.id not in existing_recipient_ids and s.id not in opt_out_ids:
                notifications_to_create.append(Notification(
                    recipient=s,
                    title=title,
                    message=msg,
                    notification_type=Notification.NotificationType.OFFER_ALERT,
                    reference_id=ref_id
                ))

        if notifications_to_create:
            Notification.objects.bulk_create(notifications_to_create, batch_size=500)

        notified_count = len(notifications_to_create)
        return Response({
            "success": True,
            "notified_count": notified_count,
            "message": f"Successfully notified {notified_count} student(s) about promo code '{coupon.code}'.",
            "already_notified_count": len(existing_recipient_ids)
        })

    @action(detail=True, methods=['get'], url_path='usages')
    def usages(self, request, id=None):
        """
        GET /api/coupons/{id}/usages/
        Returns redemption logs and analytics for the promo code.
        """
        coupon = self.get_object()
        user = request.user

        if not (user.is_admin or (user.is_shop_owner and coupon.shop and coupon.shop.owner == user)):
            raise PermissionDenied("You are not authorized to view usage details for this promo code.")

        usages_qs = coupon.usages.select_related('user', 'order').order_by('-used_at')
        total_discount = usages_qs.aggregate(total=models.Sum('discount_applied'))['total'] or Decimal('0.00')
        remaining_uses = (coupon.usage_limit - coupon.times_used) if coupon.usage_limit else None

        return Response({
            "coupon_code": coupon.code,
            "title": coupon.title,
            "total_uses": coupon.times_used,
            "usage_limit": coupon.usage_limit,
            "remaining_uses": remaining_uses,
            "per_user_limit": coupon.per_user_limit,
            "total_discount_granted": float(total_discount),
            "is_active": coupon.is_active,
            "is_currently_valid": coupon.is_currently_valid,
            "usages": [
                {
                    "id": u.id,
                    "order_number": str(u.order.order_number),
                    "masked_user": f"{u.user.username[:3]}***" if len(u.user.username) > 3 else "***",
                    "user_role": u.user.role,
                    "discount_applied": float(u.discount_applied),
                    "used_at": u.used_at,
                }
                for u in usages_qs[:100]
            ]
        })

    @action(detail=True, methods=['post'], url_path='toggle-active')
    def toggle_active(self, request, id=None):
        """
        POST /api/coupons/{id}/toggle-active/
        Activates or deactivates the promo code.
        """
        coupon = self.get_object()
        user = request.user

        if not (user.is_admin or (user.is_shop_owner and coupon.shop and coupon.shop.owner == user)):
            raise PermissionDenied("You are not authorized to toggle this promo code status.")

        coupon.is_active = not coupon.is_active
        coupon.save(update_fields=['is_active', 'updated_at'])
        return Response({
            "success": True,
            "is_active": coupon.is_active,
            "message": f"Promo code '{coupon.code}' has been {'activated' if coupon.is_active else 'deactivated'}."
        })


class ComplaintViewSet(viewsets.ModelViewSet):
    """
    Step 24: Customer Grievances & Support Ticketing API.
    Supports issue reporting, status tracking, threaded discussions, and admin resolution.
    """
    serializer_class = ComplaintSerializer
    lookup_field = 'id'
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Complaint.objects.none()

        queryset = Complaint.objects.select_related('user', 'order', 'shop', 'product', 'resolved_by').prefetch_related('messages__sender')

        if getattr(user, 'is_admin', False):
            # Admin can inspect all complaints
            pass
        elif getattr(user, 'is_shop_owner', False):
            # Shop owner can inspect complaints related to their shop
            queryset = queryset.filter(shop__owner=user)
        else:
            # Student can only inspect their own complaints
            queryset = queryset.filter(user=user)

        # Filters
        c_status = self.request.query_params.get('status')
        priority = self.request.query_params.get('priority')
        category = self.request.query_params.get('category')
        shop_id = self.request.query_params.get('shop')
        search = self.request.query_params.get('search')

        if c_status:
            queryset = queryset.filter(status=c_status)
        if priority:
            queryset = queryset.filter(priority=priority)
        if category:
            queryset = queryset.filter(category=category)
        if shop_id:
            queryset = queryset.filter(shop_id=shop_id)
        if search:
            from django.db.models import Q
            queryset = queryset.filter(
                Q(subject__icontains=search) |
                Q(description__icontains=search) |
                Q(ticket_number__icontains=search)
            )

        return queryset.order_by('-created_at')

    def perform_create(self, serializer):
        user = self.request.user
        order = serializer.validated_data.get('order')
        product = serializer.validated_data.get('product')
        shop = serializer.validated_data.get('shop')

        # If order specified, verify customer ownership
        if order and order.customer != user and not getattr(user, 'is_admin', False):
            raise PermissionDenied("You cannot file a grievance against another user's order.")

        # If shop not explicitly provided but order exists, infer from order
        if not shop and order:
            shop = order.shop
        elif not shop and product:
            shop = product.shop

        complaint = serializer.save(user=user, shop=shop)

        # Notify admin/shop owner if applicable
        try:
            if shop and shop.owner:
                Notification.objects.create(
                    recipient=shop.owner,
                    title="New Customer Grievance",
                    message=f"Grievance #{str(complaint.ticket_number)[:8]} filed regarding {complaint.subject}.",
                    notification_type=Notification.NotificationType.COMPLAINT_UPDATE,
                    reference_id=str(complaint.id)
                )
        except Exception:
            pass

    @action(detail=True, methods=['post'], url_path='add-message')
    def add_message(self, request, id=None):
        """
        POST /api/complaints/{id}/add-message/
        Adds a follow-up reply message to the complaint thread.
        """
        complaint = self.get_object()
        msg_text = request.data.get('message', '').strip()
        if not msg_text:
            return Response({"error": "Message content cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)

        message = ComplaintMessage.objects.create(
            complaint=complaint,
            sender=request.user,
            message=msg_text
        )

        # Send notification to student if replied by admin/merchant
        if request.user != complaint.user:
            try:
                Notification.objects.create(
                    recipient=complaint.user,
                    title="Grievance Update",
                    message=f"New response on ticket #{str(complaint.ticket_number)[:8]}: {msg_text[:60]}...",
                    notification_type=Notification.NotificationType.COMPLAINT_UPDATE,
                    reference_id=str(complaint.id)
                )
            except Exception:
                pass

        return Response(ComplaintMessageSerializer(message).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='resolve')
    def resolve(self, request, id=None):
        """
        POST /api/complaints/{id}/resolve/
        Admins or authorized merchants can resolve a grievance with official notes.
        """
        complaint = self.get_object()
        user = request.user
        is_admin = getattr(user, 'is_admin', False)
        is_shop_owner = complaint.shop and complaint.shop.owner == user

        if not (is_admin or is_shop_owner):
            raise PermissionDenied("Only an administrator or the target shop owner can resolve this grievance.")

        resolution = request.data.get('resolution', '').strip()
        if not resolution:
            return Response({"error": "Resolution explanation is required to close/resolve a grievance."}, status=status.HTTP_400_BAD_REQUEST)

        complaint.status = Complaint.Status.RESOLVED
        complaint.resolution = resolution
        complaint.resolved_by = user
        complaint.resolved_at = timezone.now()
        complaint.save()

        # Notify student
        try:
            Notification.objects.create(
                recipient=complaint.user,
                title="Grievance Resolved",
                message=f"Your ticket #{str(complaint.ticket_number)[:8]} has been resolved: {resolution[:80]}",
                notification_type=Notification.NotificationType.COMPLAINT_UPDATE,
                reference_id=str(complaint.id)
            )
        except Exception:
            pass

        return Response(ComplaintSerializer(complaint).data)

    @action(detail=True, methods=['post'], url_path='update-status')
    def update_status(self, request, id=None):
        """
        POST /api/complaints/{id}/update-status/
        Updates status to IN_REVIEW, REJECTED, or CLOSED.
        """
        complaint = self.get_object()
        user = request.user
        is_admin = getattr(user, 'is_admin', False)
        is_shop_owner = complaint.shop and complaint.shop.owner == user

        if not (is_admin or is_shop_owner):
            raise PermissionDenied("Only administrators or shop owners can update grievance status.")

        new_status = request.data.get('status')
        if new_status not in Complaint.Status.values:
            return Response({"error": f"Invalid status: {new_status}"}, status=status.HTTP_400_BAD_REQUEST)

        complaint.status = new_status
        if request.data.get('priority') and request.data.get('priority') in Complaint.Priority.values:
            complaint.priority = request.data.get('priority')
        complaint.save()

        return Response(ComplaintSerializer(complaint).data)

    @action(detail=False, methods=['get'], url_path='analytics')
    def analytics(self, request):
        """
        GET /api/complaints/analytics/
        Overview of grievance resolution performance for administrators.
        """
        if not getattr(request.user, 'is_admin', False):
            raise PermissionDenied("Only administrators can view grievance analytics.")

        total = Complaint.objects.count()
        open_count = Complaint.objects.filter(status__in=['OPEN', 'IN_REVIEW']).count()
        resolved_count = Complaint.objects.filter(status='RESOLVED').count()
        urgent_count = Complaint.objects.filter(priority__in=['HIGH', 'URGENT'], status__in=['OPEN', 'IN_REVIEW']).count()

        resolution_rate = round((resolved_count / max(1, total)) * 100.0, 1)

        from django.db.models import Count
        by_category = dict(Complaint.objects.values_list('category').annotate(c=Count('id')))

        return Response({
            "total_complaints": total,
            "open_complaints": open_count,
            "resolved_complaints": resolved_count,
            "urgent_pending_complaints": urgent_count,
            "resolution_rate_percentage": resolution_rate,
            "complaints_by_category": by_category,
        })


class PaymentViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Authoritative Payment Management ViewSet (Phase 18).
    Supports:
    - List/Retrieve payments with role-based scoping (Student sees own, Shop Owner sees shop's, Admin sees all).
    - Create payment intent (`create-intent`).
    - Verify gateway payment (`verify`).
    - Retry failed payment (`retry`).
    - Mark COD/Pickup cash collected (`mark-cash-collected`).
    - Ingest gateway webhook (`webhook`).
    - Payment analytics (`analytics`).
    - Reconciliation audit (`reconciliation`).
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = 'payment'
    serializer_class = PaymentSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Payment.objects.select_related('order', 'shop', 'user', 'collected_by')

        if getattr(user, 'is_admin', False):
            pass  # Global access
        elif getattr(user, 'is_shop_owner', False):
            qs = qs.filter(shop__owner=user)
        elif getattr(user, 'is_delivery_agent', False):
            qs = qs.filter(order__delivery_details__delivery_person=user)
        else:
            qs = qs.filter(user=user)

        # Query Filters
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param.upper())

        method_param = self.request.query_params.get('payment_method')
        if method_param:
            qs = qs.filter(payment_method=method_param.upper())

        order_id = self.request.query_params.get('order_id')
        if order_id:
            qs = qs.filter(order_id=order_id)

        shop_id = self.request.query_params.get('shop_id')
        if shop_id and getattr(user, 'is_admin', False):
            qs = qs.filter(shop_id=shop_id)

        return qs.order_by('-created_at')

    @action(detail=False, methods=['post'], url_path='create-intent')
    def create_intent(self, request):
        """
        POST /api/payments/create-intent/
        Initializes an authoritative payment order for checkout or retry.
        """
        serializer = PaymentCreateIntentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order_id = serializer.validated_data['order_id']
        method = serializer.validated_data.get('payment_method')
        idempotency_key = serializer.validated_data.get('idempotency_key')

        order = get_object_or_404(Order, id=order_id)
        user = request.user

        if order.customer != user and not getattr(user, 'is_admin', False):
            raise PermissionDenied("You can only initiate payment for your own orders.")

        try:
            res = PaymentService.initialize_payment(
                order=order,
                user=user,
                payment_method=method,
                idempotency_key=idempotency_key
            )
            return Response({
                "success": True,
                "payment": PaymentSerializer(res['payment']).data,
                "session": res['session']
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"success": False, "error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='verify')
    def verify(self, request, pk=None):
        """
        POST /api/payments/{id}/verify/
        Verifies gateway payment signature and captures transaction.
        """
        payment = self.get_object()
        serializer = PaymentVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        res = PaymentService.verify_payment(
            payment_id=payment.id,
            verification_data=serializer.validated_data,
            user=request.user
        )

        if not res.get('success', False):
            return Response({
                "success": False,
                "error": res.get('error', 'Payment verification failed.'),
                "payment": PaymentSerializer(res['payment']).data if 'payment' in res else None,
                "order": OrderSerializer(res['order']).data if 'order' in res else None,
            }, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "success": True,
            "message": res.get('message'),
            "payment": PaymentSerializer(res['payment']).data,
            "order": OrderSerializer(res['order']).data
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='retry')
    def retry(self, request, pk=None):
        """
        POST /api/payments/{id}/retry/
        Allows student to retry payment on a failed or pending payment.
        """
        payment = self.get_object()
        try:
            res = PaymentService.retry_payment(payment.order_id, request.user)
            return Response({
                "success": True,
                "payment": PaymentSerializer(res['payment']).data,
                "session": res['session']
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"success": False, "error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='mark-cash-collected')
    def mark_cash_collected(self, request, pk=None):
        """
        POST /api/payments/{id}/mark-cash-collected/
        Audited endpoint for shop owners or delivery agents to record cash collected for COD or Pickup.
        """
        payment = self.get_object()
        try:
            res = PaymentService.mark_cash_collected(
                order_id=payment.order_id,
                user=request.user,
                notes=request.data.get('notes', '')
            )
            return Response({
                "success": True,
                "payment": PaymentSerializer(res['payment']).data,
                "order": OrderSerializer(res['order']).data,
                "message": res['message']
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"success": False, "error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny], url_path='webhook')
    def webhook(self, request):
        """
        POST /api/payments/webhook/
        External webhook receiver with signature validation.
        """
        signature = request.headers.get('X-Razorpay-Signature', '') or request.META.get('HTTP_X_RAZORPAY_SIGNATURE', '')
        payload = request.body

        res = PaymentService.process_webhook(payload, signature, dict(request.headers))
        if not res.get('success', False):
            return Response(res, status=status.HTTP_400_BAD_REQUEST)

        return Response(res, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='analytics')
    def analytics(self, request):
        """
        GET /api/payments/analytics/
        Financial metrics dashboard for shop owners and platform administrators.
        """
        user = request.user
        is_admin = getattr(user, 'is_admin', False)
        is_shop_owner = getattr(user, 'is_shop_owner', False)

        if not (is_admin or is_shop_owner):
            raise PermissionDenied("Analytics are restricted to shop owners and administrators.")

        qs = Payment.objects.all()
        refunds_qs = Refund.objects.all()
        orders_qs = Order.objects.all()

        if is_shop_owner and not is_admin:
            qs = qs.filter(shop__owner=user)
            refunds_qs = refunds_qs.filter(order__shop__owner=user)
            orders_qs = orders_qs.filter(shop__owner=user)

        from decimal import Decimal
        from django.db.models import Sum

        total_payments = qs.count()
        captured_qs = qs.filter(status=Payment.Status.CAPTURED)
        failed_qs = qs.filter(status=Payment.Status.FAILED)
        pending_qs = qs.filter(status=Payment.Status.PENDING)

        gross_revenue = captured_qs.aggregate(t=Sum('amount'))['t'] or Decimal('0.00')
        platform_revenue = captured_qs.aggregate(t=Sum('platform_fee'))['t'] or Decimal('0.00')
        merchant_payouts = captured_qs.aggregate(t=Sum('merchant_payout'))['t'] or Decimal('0.00')

        total_refunded = refunds_qs.filter(status=Refund.Status.COMPLETED).aggregate(t=Sum('amount'))['t'] or Decimal('0.00')
        net_revenue = max(Decimal('0.00'), gross_revenue - total_refunded)

        today = timezone.now().date()
        today_captured = captured_qs.filter(paid_at__date=today)
        today_paid_orders = today_captured.count()
        today_revenue = today_captured.aggregate(t=Sum('amount'))['t'] or Decimal('0.00')

        success_count = captured_qs.count()
        failure_count = failed_qs.count()
        success_rate = round((success_count / max(1, success_count + failure_count)) * 100.0, 1)

        delivery_revenue = orders_qs.filter(payment_status=Order.PaymentStatus.PAID).aggregate(t=Sum('delivery_fee'))['t'] or Decimal('0.00')
        printing_revenue = orders_qs.filter(order_type=Order.OrderType.PRINTING, payment_status=Order.PaymentStatus.PAID).aggregate(t=Sum('total_amount'))['t'] or Decimal('0.00')

        return Response({
            "total_payments": total_payments,
            "captured_count": success_count,
            "failed_count": failure_count,
            "pending_count": pending_qs.count(),
            "gross_revenue": float(gross_revenue),
            "platform_revenue": float(platform_revenue),
            "merchant_payouts": float(merchant_payouts),
            "total_refunded": float(total_refunded),
            "net_revenue": float(net_revenue),
            "today_paid_orders": today_paid_orders,
            "today_revenue": float(today_revenue),
            "success_rate_percentage": success_rate,
            "delivery_revenue": float(delivery_revenue),
            "printing_revenue": float(printing_revenue),
        })

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated, IsAdmin], url_path='reconciliation')
    def reconciliation(self, request):
        """
        GET /api/payments/reconciliation/
        Admin-only transaction reconciliation audit.
        """
        shop_id = request.query_params.get('shop_id')
        data = ReconciliationService.run_reconciliation(shop_id=shop_id)
        return Response(data, status=status.HTTP_200_OK)


class RefundViewSet(viewsets.ModelViewSet):
    """
    Authoritative Refund Management ViewSet (Phase 10 & 18).
    Supports:
    - List/Retrieve refunds (Student sees own, Shop Owner sees shop's, Admin sees all).
    - Create refund request (`POST /api/refunds/`).
    - Staff approve refund (`POST /api/refunds/{id}/approve/`).
    - Staff reject refund (`POST /api/refunds/{id}/reject/`).
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = RefundSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Refund.objects.select_related('order', 'payment', 'requested_by', 'approved_by')

        if getattr(user, 'is_admin', False):
            pass
        elif getattr(user, 'is_shop_owner', False):
            qs = qs.filter(order__shop__owner=user)
        else:
            qs = qs.filter(requested_by=user)

        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param.upper())

        order_id = self.request.query_params.get('order_id')
        if order_id:
            qs = qs.filter(order_id=order_id)

        return qs.order_by('-created_at')

    def create(self, request, *args, **kwargs):
        order_id = request.data.get('order_id')
        amount = request.data.get('amount')
        reason = request.data.get('reason', '')

        if not order_id or amount is None:
            return Response({"error": "order_id and amount are required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            refund = RefundService.request_refund(
                order_id=order_id,
                amount=amount,
                reason=reason,
                user=request.user
            )
            AuditService.log(
                action=AuditLog.Action.REFUND_REQUESTED,
                actor=request.user,
                target_model='Refund',
                target_id=str(refund.id),
                metadata={"amount": str(amount), "order_id": str(order_id)},
                request=request
            )
            return Response(RefundSerializer(refund).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        refund = self.get_object()
        try:
            updated_refund = RefundService.approve_refund(refund.id, request.user)
            AuditService.log(
                action=AuditLog.Action.REFUND_APPROVED,
                actor=request.user,
                target_model='Refund',
                target_id=str(updated_refund.id),
                metadata={"amount": str(updated_refund.amount)},
                request=request
            )
            return Response(RefundSerializer(updated_refund).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        refund = self.get_object()
        reason = request.data.get('reason', '')
        try:
            updated_refund = RefundService.reject_refund(refund.id, request.user, reason=reason)
            AuditService.log(
                action=AuditLog.Action.REFUND_REJECTED,
                actor=request.user,
                target_model='Refund',
                target_id=str(updated_refund.id),
                metadata={"reason": reason},
                request=request
            )
            return Response(RefundSerializer(updated_refund).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)




