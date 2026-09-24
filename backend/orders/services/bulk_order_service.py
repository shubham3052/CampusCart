from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError
from typing import Dict, Any, List, Optional

from orders.models import (
    BulkOrder,
    BulkOrderItem,
    BulkOrderParticipant,
    BulkOrderParticipantItem,
    BulkOrderAudit,
)
from products.models import Product, BulkPricingTier
from inventory.models import Inventory, InventoryTransaction
from printing.models import ShopPrintingConfig
from notifications.models import Notification


class BulkOrderService:
    """
    Intelligent Bulk & Class Ordering Service.
    Handles tiered volume discounts, participant aggregation, atomic inventory reservations,
    and lifecycle workflow.
    """

    @staticmethod
    def calculate_item_pricing(shop, product: Optional[Product], quantity: int, item_type: str = 'STATIONERY', printing_spec: Optional[dict] = None) -> Dict[str, Any]:
        """
        Server-authoritative calculation of base unit price, tiered bulk discount, and line total.
        Never trusts client-calculated prices or discounts.
        """
        quantity = max(1, int(quantity))

        if item_type == 'PRINTING' or printing_spec:
            spec = printing_spec or {}
            pages = max(1, int(spec.get('pages', 1)))
            copies = quantity
            color_mode = spec.get('color_mode', 'BW')
            paper_size = spec.get('paper_size', 'A4')
            print_sides = spec.get('print_sides', 'SINGLE')
            binding_type = spec.get('binding_type', 'NONE')

            # Look up shop printing config
            cfg = getattr(shop, 'printing_config', None)
            if not cfg:
                cfg = ShopPrintingConfig.objects.filter(shop=shop).first()

            if cfg:
                calc = cfg.calculate_pricing(pages, copies, color_mode, paper_size, print_sides, binding_type)
                base_subtotal = calc['subtotal']
                unit_price = base_subtotal / Decimal(copies)
            else:
                unit_price = Decimal('2.00') * Decimal(pages)
                base_subtotal = unit_price * Decimal(copies)

            # Check for bulk discount on printing
            discount_amount = Decimal('0.00')
            if copies >= 50:
                discount_amount = (base_subtotal * Decimal('0.15')).quantize(Decimal('0.01'))
            elif copies >= 25:
                discount_amount = (base_subtotal * Decimal('0.10')).quantize(Decimal('0.01'))
            elif copies >= 10:
                discount_amount = (base_subtotal * Decimal('0.05')).quantize(Decimal('0.01'))

            discounted_subtotal = max(Decimal('0.00'), base_subtotal - discount_amount)
            discounted_unit_price = (discounted_subtotal / Decimal(copies)).quantize(Decimal('0.01'))

            return {
                'base_unit_price': unit_price.quantize(Decimal('0.01')),
                'discounted_unit_price': discounted_unit_price,
                'discount_amount': discount_amount,
                'subtotal': discounted_subtotal,
                'tier_matched': f"{copies} copies volume rate" if discount_amount > 0 else "Standard Rate",
            }

        # Stationery Catalog Item
        if not product:
            raise ValidationError("Product is required for stationery bulk items.")

        base_unit_price = product.price
        base_subtotal = base_unit_price * Decimal(quantity)

        # Look up matching BulkPricingTier
        tier = BulkPricingTier.objects.filter(
            shop=shop,
            is_active=True,
            min_quantity__lte=quantity
        ).filter(
            models_q_filter := (
                # Prefer product-specific tier, fallback to shop-wide tier
                django_models_q(product=product) | django_models_q(product__isnull=True)
            )
        ).order_by('-product_id', '-min_quantity').first()

        discount_amount = Decimal('0.00')
        tier_description = "Standard Catalog Price"

        if tier:
            if tier.max_quantity is None or quantity <= tier.max_quantity:
                if tier.discount_type == BulkPricingTier.DiscountType.PERCENTAGE:
                    pct = tier.discount_value / Decimal('100.00')
                    discount_amount = (base_subtotal * pct).quantize(Decimal('0.01'))
                    tier_description = f"{tier.discount_value}% Bulk Tier ({tier.min_quantity}+ units)"
                else:  # FIXED per unit
                    fixed_reduction = tier.discount_value * Decimal(quantity)
                    discount_amount = min(base_subtotal, fixed_reduction).quantize(Decimal('0.01'))
                    tier_description = f"₹{tier.discount_value}/unit Bulk Tier ({tier.min_quantity}+ units)"

        discounted_subtotal = max(Decimal('0.00'), base_subtotal - discount_amount)
        discounted_unit_price = (discounted_subtotal / Decimal(quantity)).quantize(Decimal('0.01'))

        return {
            'base_unit_price': base_unit_price.quantize(Decimal('0.01')),
            'discounted_unit_price': discounted_unit_price,
            'discount_amount': discount_amount,
            'subtotal': discounted_subtotal,
            'tier_matched': tier_description,
        }

    @staticmethod
    def create_bulk_order(
        user=None,
        shop=None,
        title: str = '',
        description: str = '',
        order_type: str = 'CLASS',
        items_data: List[Dict[str, Any]] = None,
        participant_limit: Optional[int] = None,
        deadline: Optional[Any] = None,
        fulfillment_type: str = 'PICKUP',
        pickup_slot_id: Optional[int] = None,
        delivery_slot_id: Optional[int] = None,
        delivery_address: str = '',
        creator=None,
        name: str = '',
        delivery_method: str = '',
        **kwargs
    ) -> BulkOrder:
        """
        Creates a new collective or bulk purchase order with calculated pricing tiers.
        """
        user = user or creator
        title = title or name or 'Class Bulk Order'
        fulfillment_type = delivery_method or fulfillment_type or 'PICKUP'

        if not items_data:
            raise ValidationError("At least one bulk order item is required.")

        with transaction.atomic():
            bulk_order = BulkOrder.objects.create(
                user=user,
                shop=shop,
                title=title,
                description=description,
                order_type=order_type,
                status=BulkOrder.Status.OPEN,
                participant_limit=participant_limit,
                deadline=deadline,
                fulfillment_type=fulfillment_type,
                pickup_slot_id=pickup_slot_id,
                delivery_slot_id=delivery_slot_id,
                delivery_address=delivery_address,
            )

            total_subtotal = Decimal('0.00')
            total_discount = Decimal('0.00')

            for item_spec in items_data:
                product_id = item_spec.get('product_id')
                product = Product.objects.filter(id=product_id, shop=shop).first() if product_id else None
                item_type = item_spec.get('item_type', 'STATIONERY')
                quantity = int(item_spec.get('target_quantity', item_spec.get('quantity', 1)))
                printing_spec = item_spec.get('printing_spec', {})

                pricing = BulkOrderService.calculate_item_pricing(
                    shop=shop,
                    product=product,
                    quantity=quantity,
                    item_type=item_type,
                    printing_spec=printing_spec
                )

                base_line_subtotal = pricing['base_unit_price'] * Decimal(quantity)
                total_subtotal += base_line_subtotal
                total_discount += pricing['discount_amount']

                BulkOrderItem.objects.create(
                    bulk_order=bulk_order,
                    product=product,
                    custom_item_name=item_spec.get('custom_item_name', ''),
                    item_type=item_type,
                    base_unit_price=pricing['base_unit_price'],
                    discounted_unit_price=pricing['discounted_unit_price'],
                    target_quantity=quantity,
                    allocated_quantity=quantity if order_type == 'INDIVIDUAL_BULK' else 0,
                    printing_spec=printing_spec,
                    subtotal=pricing['subtotal']
                )

            # Apply delivery fee if delivery chosen
            delivery_fee = Decimal('0.00')
            if fulfillment_type == 'DELIVERY':
                delivery_fee = Decimal('25.00') if total_subtotal < Decimal('500.00') else Decimal('0.00')

            bulk_order.subtotal = total_subtotal
            bulk_order.discount_amount = total_discount
            bulk_order.delivery_fee = delivery_fee
            bulk_order.total_amount = max(Decimal('0.00'), total_subtotal - total_discount + delivery_fee)
            bulk_order.save()

            # Add creator as OWNER participant
            owner_participant = BulkOrderParticipant.objects.create(
                bulk_order=bulk_order,
                user=user,
                role=BulkOrderParticipant.Role.OWNER,
                status=BulkOrderParticipant.Status.ACTIVE,
                notes="Order Creator / Representative"
            )

            # Assign initial item allocations to creator
            for b_item in bulk_order.items.all():
                if b_item.target_quantity > 0:
                    BulkOrderParticipantItem.objects.create(
                        participant=owner_participant,
                        bulk_order_item=b_item,
                        quantity=b_item.target_quantity
                    )
                b_item.allocated_quantity = b_item.target_quantity
                b_item.save(update_fields=['allocated_quantity'])

            BulkOrderAudit.objects.create(
                bulk_order=bulk_order,
                user=user,
                action='CREATED',
                details={'title': title, 'order_type': order_type, 'items_count': len(items_data)}
            )

            return bulk_order

    @staticmethod
    def join_bulk_order(bulk_order: BulkOrder, user, item_allocations: List[Dict[str, Any]], notes: str = '') -> BulkOrderParticipant:
        """
        Allows a student to join an open bulk order and select item quantities.
        """
        if bulk_order.status != BulkOrder.Status.OPEN:
            raise ValidationError(f"Cannot join order in '{bulk_order.get_status_display()}' status.")

        if bulk_order.is_expired:
            raise ValidationError("Order deadline has passed. No new participants can join.")

        if bulk_order.participant_limit:
            current_active = bulk_order.participants.filter(status=BulkOrderParticipant.Status.ACTIVE).count()
            if current_active >= bulk_order.participant_limit:
                raise ValidationError(f"Participant limit of {bulk_order.participant_limit} has been reached.")

        with transaction.atomic():
            participant, created = BulkOrderParticipant.objects.get_or_create(
                bulk_order=bulk_order,
                user=user,
                defaults={'role': BulkOrderParticipant.Role.PARTICIPANT, 'status': BulkOrderParticipant.Status.ACTIVE, 'notes': notes}
            )

            if not created and participant.status != BulkOrderParticipant.Status.ACTIVE:
                participant.status = BulkOrderParticipant.Status.ACTIVE
                participant.notes = notes
                participant.save()

            # Record item allocations
            for alloc in item_allocations:
                item_id = alloc.get('bulk_order_item_id') or alloc.get('item_id')
                qty = max(1, int(alloc.get('quantity', 1)))

                b_item = None
                if item_id:
                    b_item = bulk_order.items.filter(id=item_id).first()
                if not b_item and alloc.get('product_id'):
                    b_item = bulk_order.items.filter(product_id=alloc.get('product_id')).first()

                if not b_item:
                    continue

                BulkOrderParticipantItem.objects.update_or_create(
                    participant=participant,
                    bulk_order_item=b_item,
                    defaults={'quantity': qty}
                )

            # Recalculate allocated quantities and aggregate discounts
            BulkOrderService.recalculate_bulk_order_totals(bulk_order)

            BulkOrderAudit.objects.create(
                bulk_order=bulk_order,
                user=user,
                action='JOINED',
                details={'notes': notes, 'allocations': item_allocations}
            )

            # Notify bulk order owner
            try:
                Notification.objects.create(
                    recipient=bulk_order.user,
                    title="New Member Joined Class Order",
                    message=f"{user.username} joined '{bulk_order.title}'. Total members: {bulk_order.active_participants_count}.",
                    notification_type=Notification.NotificationType.GENERAL,
                    reference_id=str(bulk_order.id)
                )
            except Exception:
                pass

            return participant

    @staticmethod
    def recalculate_bulk_order_totals(bulk_order: BulkOrder):
        """
        Recomputes total allocated quantities across active participants,
        applies updated volume pricing tiers, and updates bulk order financial fields.
        """
        total_subtotal = Decimal('0.00')
        total_discount = Decimal('0.00')

        for b_item in bulk_order.items.all():
            # Sum quantities from active participants
            sum_allocated = BulkOrderParticipantItem.objects.filter(
                bulk_order_item=b_item,
                participant__status=BulkOrderParticipant.Status.ACTIVE
            ).aggregate(total=models_sum('quantity'))['total'] or 0

            # Target quantity is either max of target or sum_allocated
            effective_qty = max(b_item.target_quantity, sum_allocated)
            b_item.target_quantity = effective_qty
            b_item.allocated_quantity = sum_allocated

            pricing = BulkOrderService.calculate_item_pricing(
                shop=bulk_order.shop,
                product=b_item.product,
                quantity=effective_qty,
                item_type=b_item.item_type,
                printing_spec=b_item.printing_spec
            )

            base_line_subtotal = pricing['base_unit_price'] * Decimal(effective_qty)
            total_subtotal += base_line_subtotal
            total_discount += pricing['discount_amount']

            b_item.base_unit_price = pricing['base_unit_price']
            b_item.discounted_unit_price = pricing['discounted_unit_price']
            b_item.subtotal = pricing['subtotal']
            b_item.save()

        delivery_fee = Decimal('0.00')
        if bulk_order.fulfillment_type == 'DELIVERY':
            delivery_fee = Decimal('25.00') if total_subtotal < Decimal('500.00') else Decimal('0.00')

        bulk_order.subtotal = total_subtotal
        bulk_order.discount_amount = total_discount
        bulk_order.delivery_fee = delivery_fee
        bulk_order.total_amount = max(Decimal('0.00'), total_subtotal - total_discount + delivery_fee)
        bulk_order.save()

    @staticmethod
    def confirm_bulk_order(bulk_order: BulkOrder, user) -> BulkOrder:
        """
        Atomic validation and stock reservation for a bulk order.
        Guarantees concurrency safety via SELECT FOR UPDATE on inventory rows.
        """
        if bulk_order.status not in [BulkOrder.Status.OPEN, BulkOrder.Status.DRAFT]:
            raise ValidationError(f"Cannot confirm order in '{bulk_order.get_status_display()}' status.")

        if user != bulk_order.user and not getattr(user, 'is_admin', False):
            raise ValidationError("Only the order creator or an administrator can confirm this bulk order.")

        with transaction.atomic():
            # 1. Lock and validate inventory for all stationery items
            items_to_reserve = []
            for b_item in bulk_order.items.select_for_update():
                if b_item.item_type == 'STATIONERY' and b_item.product:
                    inv = Inventory.objects.select_for_update().filter(
                        shop=bulk_order.shop,
                        product=b_item.product,
                        is_active=True
                    ).first()

                    qty_needed = max(b_item.target_quantity, b_item.allocated_quantity)
                    available = inv.available_stock if inv else 0

                    if not inv or available < qty_needed:
                        raise ValidationError(
                            f"Insufficient stock for '{b_item.name}'. Requested: {qty_needed}, Available: {available}."
                        )

                    items_to_reserve.append((inv, qty_needed))

            # 2. Increment reserved stock atomically
            for inv, qty in items_to_reserve:
                inv.reserved_stock += qty
                inv.save(update_fields=['reserved_stock'])

            bulk_order.stock_reserved = True
            bulk_order.status = BulkOrder.Status.CONFIRMED
            bulk_order.save(update_fields=['stock_reserved', 'status', 'updated_at'])

            BulkOrderAudit.objects.create(
                bulk_order=bulk_order,
                user=user,
                action='CONFIRMED',
                details={'items_reserved': len(items_to_reserve), 'total_amount': str(bulk_order.total_amount)}
            )

            # 3. Notify shop owner and participants
            try:
                Notification.objects.create(
                    recipient=bulk_order.shop.owner,
                    title="New Bulk Order Confirmed!",
                    message=f"Bulk order '{bulk_order.title}' ({bulk_order.order_type}) from {user.username} has been confirmed. Total: ₹{bulk_order.total_amount}.",
                    notification_type=Notification.NotificationType.GENERAL,
                    reference_id=str(bulk_order.id)
                )

                for p in bulk_order.participants.filter(status=BulkOrderParticipant.Status.ACTIVE).exclude(user=user):
                    Notification.objects.create(
                        recipient=p.user,
                        title="Class Order Confirmed!",
                        message=f"Class order '{bulk_order.title}' has been confirmed by the representative and sent to {bulk_order.shop.name}.",
                        notification_type=Notification.NotificationType.GENERAL,
                        reference_id=str(bulk_order.id)
                    )
            except Exception:
                pass

            return bulk_order

    @staticmethod
    def cancel_bulk_order(bulk_order: BulkOrder, user, reason: str = '') -> BulkOrder:
        """
        Cancels a bulk order and atomically releases any reserved stock.
        """
        if bulk_order.status in [BulkOrder.Status.COMPLETED, BulkOrder.Status.CANCELLED]:
            raise ValidationError(f"Cannot cancel order in '{bulk_order.get_status_display()}' status.")

        is_owner = (user == bulk_order.user)
        is_shop_owner = (user == bulk_order.shop.owner)
        is_admin = getattr(user, 'is_admin', False)

        if not (is_owner or is_shop_owner or is_admin):
            raise ValidationError("You do not have permission to cancel this bulk order.")

        with transaction.atomic():
            # Release reserved stock if reserved
            if bulk_order.stock_reserved:
                for b_item in bulk_order.items.all():
                    if b_item.item_type == 'STATIONERY' and b_item.product:
                        inv = Inventory.objects.select_for_update().filter(
                            shop=bulk_order.shop,
                            product=b_item.product
                        ).first()

                        if inv:
                            qty_reserved = max(b_item.target_quantity, b_item.allocated_quantity)
                            inv.reserved_stock = max(0, inv.reserved_stock - qty_reserved)
                            inv.save(update_fields=['reserved_stock'])

                bulk_order.stock_reserved = False

            bulk_order.status = BulkOrder.Status.CANCELLED
            bulk_order.save(update_fields=['status', 'stock_reserved', 'updated_at'])

            BulkOrderAudit.objects.create(
                bulk_order=bulk_order,
                user=user,
                action='CANCELLED',
                details={'reason': reason, 'released_by': user.username}
            )

            # Notify participants
            try:
                for p in bulk_order.participants.filter(status=BulkOrderParticipant.Status.ACTIVE):
                    Notification.objects.create(
                        recipient=p.user,
                        title="Bulk Order Cancelled",
                        message=f"Order '{bulk_order.title}' has been cancelled. Reason: {reason or 'Cancelled by organizer.'}",
                        notification_type=Notification.NotificationType.GENERAL,
                        reference_id=str(bulk_order.id)
                    )
            except Exception:
                pass

            return bulk_order


# Helper functions to avoid top-level Q import conflicts
def django_models_q(**kwargs):
    from django.db.models import Q
    return Q(**kwargs)

def models_sum(field_name):
    from django.db.models import Sum
    return Sum(field_name)
