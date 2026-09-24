from rest_framework import serializers
from django.db import transaction
from django.utils import timezone
from decimal import Decimal
from django.conf import settings
import pypdf
import random
import secrets
import re
import os

from .models import PrintingOrder, UploadedDocument, ShopPrintingConfig
from orders.models import Order, OTPVerification
from shops.models import Shop
from delivery.models import PickupSlot, Delivery
from notifications.models import Notification

def parse_custom_page_range(range_str, max_pages):
    """
    Parses and validates a user-specified page range string (e.g. '1-5, 8, 10-12').
    Returns a sorted list of unique 1-indexed page numbers.
    Raises serializers.ValidationError on invalid syntax or out-of-bounds page numbers.
    """
    if not range_str or not range_str.strip():
        raise serializers.ValidationError("Custom page range cannot be empty when custom pages are selected.")

    cleaned = range_str.strip()
    parts = [p.strip() for p in cleaned.split(',') if p.strip()]
    if not parts:
        raise serializers.ValidationError("Invalid page range format.")

    selected_pages = set()

    for part in parts:
        if '-' in part:
            subparts = part.split('-')
            if len(subparts) != 2:
                raise serializers.ValidationError(f"Invalid range segment '{part}'. Format must be 'start-end' (e.g. 1-5).")
            try:
                start = int(subparts[0].strip())
                end = int(subparts[1].strip())
            except ValueError:
                raise serializers.ValidationError(f"Page numbers in '{part}' must be valid integers.")

            if start <= 0 or end <= 0:
                raise serializers.ValidationError(f"Page numbers must be positive integers greater than 0. Got '{part}'.")
            if start > end:
                raise serializers.ValidationError(f"Invalid range '{part}': start page ({start}) cannot be greater than end page ({end}).")
            if end > max_pages:
                raise serializers.ValidationError(f"Page range '{part}' exceeds document length ({max_pages} pages).")

            for page_num in range(start, end + 1):
                selected_pages.add(page_num)
        else:
            try:
                page_num = int(part)
            except ValueError:
                raise serializers.ValidationError(f"Invalid page number '{part}'. Must be an integer.")

            if page_num <= 0:
                raise serializers.ValidationError(f"Page number {page_num} must be greater than 0.")
            if page_num > max_pages:
                raise serializers.ValidationError(f"Page {page_num} exceeds document length ({max_pages} pages).")

            selected_pages.add(page_num)

    if not selected_pages:
        raise serializers.ValidationError("No valid pages were selected.")

    return sorted(list(selected_pages))


class ShopPrintingConfigSerializer(serializers.ModelSerializer):
    shop_name = serializers.CharField(source='shop.name', read_only=True)
    shop_type_display = serializers.CharField(source='shop.get_shop_type_display', read_only=True)
    shop_location = serializers.CharField(source='shop.campus_location', read_only=True)
    shop_address = serializers.CharField(source='shop.address', read_only=True)
    shop_rating = serializers.DecimalField(source='shop.rating', max_digits=3, decimal_places=2, read_only=True)

    class Meta:
        model = ShopPrintingConfig
        fields = [
            'id',
            'shop',
            'shop_name',
            'shop_type_display',
            'shop_location',
            'shop_address',
            'shop_rating',
            'is_printing_enabled',
            'bw_rate_per_page',
            'color_rate_per_page',
            'a3_multiplier',
            'duplex_discount_per_sheet',
            'corner_staple_price',
            'spiral_binding_price',
            'soft_bind_price',
            'hardcover_price',
            'supported_paper_sizes',
            'supported_binding_types',
            'base_prep_time_mins',
            'mins_per_100_pages',
        ]


class UploadedDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = UploadedDocument
        fields = [
            'id',
            'printing_order',
            'file',
            'original_filename',
            'file_size_bytes',
            'page_count',
            'retention_expiry_date',
            'uploaded_at',
        ]
        read_only_fields = ['id', 'uploaded_at', 'retention_expiry_date']


class PrintingOrderSerializer(serializers.ModelSerializer):
    documents = UploadedDocumentSerializer(many=True, read_only=True)
    color_mode_display = serializers.CharField(source='get_color_mode_display', read_only=True)
    binding_type_display = serializers.CharField(source='get_binding_type_display', read_only=True)
    paper_size_display = serializers.CharField(source='get_paper_size_display', read_only=True)
    print_sides_display = serializers.CharField(source='get_print_sides_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    shop_name = serializers.CharField(source='shop.name', read_only=True)
    order_number = serializers.CharField(source='order.order_number', read_only=True)
    customer_name = serializers.CharField(source='order.customer.get_full_name', read_only=True)
    customer_email = serializers.CharField(source='order.customer.email', read_only=True)
    customer_phone = serializers.CharField(source='order.customer.phone_number', read_only=True)
    fulfillment_type = serializers.CharField(source='order.fulfillment_type', read_only=True)
    fulfillment_type_display = serializers.CharField(source='order.get_fulfillment_type_display', read_only=True)
    delivery_address = serializers.CharField(source='order.delivery_address', read_only=True)
    pickup_slot_id = serializers.IntegerField(source='order.pickup_slot.id', read_only=True, allow_null=True)
    pickup_slot_display = serializers.SerializerMethodField()
    delivery_fee = serializers.DecimalField(source='order.delivery_fee', max_digits=10, decimal_places=2, read_only=True)
    total_amount = serializers.DecimalField(source='order.total_amount', max_digits=10, decimal_places=2, read_only=True)
    payment_method = serializers.CharField(source='order.payment_method', read_only=True)
    payment_status = serializers.CharField(source='order.payment_status', read_only=True)

    class Meta:
        model = PrintingOrder
        fields = [
            'id',
            'order',
            'order_number',
            'customer_name',
            'customer_email',
            'customer_phone',
            'shop',
            'shop_name',
            'color_mode',
            'color_mode_display',
            'paper_size',
            'paper_size_display',
            'paper_gsm',
            'print_sides',
            'print_sides_display',
            'binding_type',
            'binding_type_display',
            'page_selection_type',
            'custom_page_range',
            'total_pages',
            'copies',
            'price',
            'estimated_prep_time_mins',
            'status',
            'status_display',
            'special_instructions',
            'fulfillment_type',
            'fulfillment_type_display',
            'pickup_slot_id',
            'pickup_slot_display',
            'delivery_address',
            'delivery_fee',
            'total_amount',
            'payment_method',
            'payment_status',
            'completed_at',
            'documents',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'completed_at']

    def get_pickup_slot_display(self, obj):
        slot = obj.order.pickup_slot if obj.order else None
        if not slot:
            return None
        return f"{slot.date} ({slot.start_time.strftime('%H:%M')} - {slot.end_time.strftime('%H:%M')})"


class PrintPriceCalculationSerializer(serializers.Serializer):
    """
    Validates input parameters for live debounced price estimation.
    Authoritative backend pricing only.
    """
    shop = serializers.IntegerField()
    total_pages = serializers.IntegerField(min_value=1)
    copies = serializers.IntegerField(min_value=1, default=1)
    color_mode = serializers.ChoiceField(choices=PrintingOrder.ColorMode.choices, default=PrintingOrder.ColorMode.BW)
    paper_size = serializers.ChoiceField(choices=PrintingOrder.PaperSize.choices, default=PrintingOrder.PaperSize.A4)
    print_sides = serializers.ChoiceField(choices=PrintingOrder.PrintSides.choices, default=PrintingOrder.PrintSides.DOUBLE_SIDED)
    binding_type = serializers.ChoiceField(choices=PrintingOrder.BindingType.choices, default=PrintingOrder.BindingType.NONE)
    fulfillment_type = serializers.ChoiceField(choices=['PICKUP', 'DELIVERY'], default='PICKUP')


class PrintOrderCreateSerializer(serializers.Serializer):
    """
    Atomic print order creation serializer.
    Handles file upload, pypdf page count extraction, range calculation,
    shop capability checks, pickup slot / delivery validation, and price computation.
    """
    file = serializers.FileField(required=True, help_text="Uploaded PDF document")
    shop = serializers.IntegerField(required=True, help_text="Target print shop ID")
    fulfillment_type = serializers.ChoiceField(choices=['PICKUP', 'DELIVERY'], default='PICKUP')
    pickup_slot = serializers.IntegerField(required=False, allow_null=True)
    delivery_address = serializers.CharField(required=False, allow_blank=True, default='')
    delivery_latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    delivery_longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    payment_method = serializers.ChoiceField(choices=Order.PaymentMethod.choices, default=Order.PaymentMethod.COD)
    color_mode = serializers.ChoiceField(choices=PrintingOrder.ColorMode.choices, default=PrintingOrder.ColorMode.BW)
    paper_size = serializers.ChoiceField(choices=PrintingOrder.PaperSize.choices, default=PrintingOrder.PaperSize.A4)
    paper_gsm = serializers.IntegerField(default=75, required=False)
    print_sides = serializers.ChoiceField(choices=PrintingOrder.PrintSides.choices, default=PrintingOrder.PrintSides.DOUBLE_SIDED)
    binding_type = serializers.ChoiceField(choices=PrintingOrder.BindingType.choices, default=PrintingOrder.BindingType.NONE)
    page_selection_type = serializers.ChoiceField(choices=PrintingOrder.PageSelectionType.choices, default=PrintingOrder.PageSelectionType.ALL)
    custom_page_range = serializers.CharField(required=False, allow_blank=True, default='')
    copies = serializers.IntegerField(min_value=1, default=1)
    special_instructions = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, attrs):
        file_obj = attrs.get('file')

        # 1. Validate File Existence & Basic Properties
        if not file_obj:
            raise serializers.ValidationError({"file": "Document file is required."})

        # Max file size: 25 MB
        MAX_FILE_SIZE = 25 * 1024 * 1024
        if file_obj.size > MAX_FILE_SIZE:
            raise serializers.ValidationError({"file": f"File size exceeds 25 MB maximum limit ({file_obj.size / (1024 * 1024):.1f} MB uploaded)."})

        if file_obj.size == 0:
            raise serializers.ValidationError({"file": "The uploaded file is empty (0 bytes)."})

        # Validate MIME or extension
        filename_lower = file_obj.name.lower()
        if not filename_lower.endswith('.pdf'):
            raise serializers.ValidationError({"file": "Unsupported file format. Only PDF documents (.pdf) are currently accepted for printing."})

        # Validate magic bytes
        file_obj.seek(0)
        magic_bytes = file_obj.read(4)
        file_obj.seek(0)
        if magic_bytes != b'%PDF':
            raise serializers.ValidationError({"file": "Corrupted or invalid PDF file header. Magic bytes mismatch."})

        # 2. Server-side PDF Inspection using pypdf
        try:
            file_obj.seek(0)
            reader = pypdf.PdfReader(file_obj)
            actual_pages = len(reader.pages)
            if actual_pages < 1:
                raise serializers.ValidationError({"file": "Uploaded PDF contains no printable pages."})
            attrs['actual_page_count'] = actual_pages
        except pypdf.errors.PdfReadError as e:
            raise serializers.ValidationError({"file": f"Corrupted or invalid PDF file. Could not parse document structure: {str(e)}"})
        except Exception as e:
            raise serializers.ValidationError({"file": f"Failed to inspect PDF: {str(e)}"})
        finally:
            file_obj.seek(0)

        # 3. Validate Page Range
        selection_type = attrs.get('page_selection_type')
        if selection_type == PrintingOrder.PageSelectionType.CUSTOM:
            range_str = attrs.get('custom_page_range', '').strip()
            pages_list = parse_custom_page_range(range_str, actual_pages)
            printable_pages_count = len(pages_list)
        else:
            printable_pages_count = actual_pages

        attrs['printable_pages_count'] = printable_pages_count

        # 4. Validate Shop & Printing Capabilities
        shop_id = attrs['shop']
        try:
            shop = Shop.objects.get(id=shop_id)
            if not shop.is_active:
                raise serializers.ValidationError({"shop": f"Shop '{shop.name}' is currently inactive."})
        except Shop.DoesNotExist:
            raise serializers.ValidationError({"shop": "Specified shop does not exist."})

        try:
            printing_config = shop.printing_config
            if not printing_config.is_printing_enabled:
                raise serializers.ValidationError({"shop": f"Shop '{shop.name}' does not currently accept document printing orders."})
        except ShopPrintingConfig.DoesNotExist:
            raise serializers.ValidationError({"shop": f"Shop '{shop.name}' does not offer printing services."})

        attrs['shop_instance'] = shop
        attrs['printing_config'] = printing_config

        # Validate requested paper size and binding against shop capabilities
        paper_size = attrs.get('paper_size')
        if paper_size not in printing_config.supported_paper_sizes:
            raise serializers.ValidationError({"paper_size": f"Paper size '{paper_size}' is not supported by {shop.name}. Supported sizes: {printing_config.supported_paper_sizes}"})

        binding = attrs.get('binding_type')
        if binding not in printing_config.supported_binding_types:
            raise serializers.ValidationError({"binding_type": f"Binding type '{binding}' is not offered by {shop.name}. Supported: {printing_config.supported_binding_types}"})

        # 5. Fulfillment Validation
        fulfillment = attrs.get('fulfillment_type')
        if fulfillment == 'PICKUP':
            slot_id = attrs.get('pickup_slot')
            if not slot_id:
                raise serializers.ValidationError({"pickup_slot": "Please select a pickup time slot for counter collection."})
            try:
                slot = PickupSlot.objects.get(id=slot_id, shop=shop)
                if not slot.is_available:
                    raise serializers.ValidationError({"pickup_slot": "Selected pickup slot is at full capacity or inactive."})
                attrs['pickup_slot_instance'] = slot
            except PickupSlot.DoesNotExist:
                raise serializers.ValidationError({"pickup_slot": "Specified pickup slot does not belong to this shop."})
        elif fulfillment == 'DELIVERY':
            address = attrs.get('delivery_address', '').strip()
            if not address:
                raise serializers.ValidationError({"delivery_address": "Delivery address is required for campus hostel delivery."})

        return attrs

    def create(self, validated_data):
        shop = validated_data['shop_instance']
        printing_config = validated_data['printing_config']
        fulfillment = validated_data['fulfillment_type']
        printable_pages = validated_data['printable_pages_count']
        copies = validated_data['copies']
        file_obj = validated_data['file']
        actual_pages = validated_data['actual_page_count']

        request = self.context.get('request')
        customer = request.user

        # Authoritative Backend Pricing
        pricing = printing_config.calculate_pricing(
            total_pages=printable_pages,
            copies=copies,
            color_mode=validated_data['color_mode'],
            paper_size=validated_data['paper_size'],
            print_sides=validated_data['print_sides'],
            binding_type=validated_data['binding_type']
        )

        subtotal = pricing['subtotal']
        delivery_fee = Decimal('15.00') if fulfillment == 'DELIVERY' else Decimal('0.00')
        total_amount = subtotal + delivery_fee
        prep_time = pricing['prep_time_mins']

        with transaction.atomic():
            # 1. If pickup slot chosen, acquire row lock and verify capacity
            slot = validated_data.get('pickup_slot_instance')
            if slot:
                locked_slot = PickupSlot.objects.select_for_update().get(id=slot.id)
                if locked_slot.booked_count >= locked_slot.capacity:
                    raise serializers.ValidationError({"pickup_slot": f"Pickup slot is full ({locked_slot.booked_count}/{locked_slot.capacity}). Please select another slot."})
                locked_slot.booked_count += 1
                locked_slot.save()

            # 2. Create Core Order
            order = Order.objects.create(
                customer=customer,
                shop=shop,
                order_type=Order.OrderType.PRINTING,
                fulfillment_type=Order.FulfillmentType.DELIVERY if fulfillment == 'DELIVERY' else Order.FulfillmentType.PICKUP,
                pickup_slot=slot,
                delivery_address=validated_data.get('delivery_address', ''),
                delivery_latitude=validated_data.get('delivery_latitude'),
                delivery_longitude=validated_data.get('delivery_longitude'),
                shop_latitude=shop.latitude,
                shop_longitude=shop.longitude,
                payment_method=validated_data.get('payment_method', Order.PaymentMethod.COD),
                subtotal=subtotal,
                delivery_fee=delivery_fee,
                total_amount=total_amount,
                order_notes=validated_data.get('special_instructions', '')
            )

            # 3. Create PrintingOrder record
            printing_order = PrintingOrder.objects.create(
                order=order,
                shop=shop,
                color_mode=validated_data['color_mode'],
                paper_size=validated_data['paper_size'],
                paper_gsm=validated_data.get('paper_gsm', 75),
                print_sides=validated_data['print_sides'],
                binding_type=validated_data['binding_type'],
                page_selection_type=validated_data['page_selection_type'],
                custom_page_range=validated_data.get('custom_page_range', ''),
                total_pages=printable_pages,
                copies=copies,
                price=subtotal,
                estimated_prep_time_mins=prep_time,
                status=PrintingOrder.PrintingStatus.WAITING,
                special_instructions=validated_data.get('special_instructions', '')
            )

            # 4. Save UploadedDocument record with retention policy and sanitized filename
            clean_filename = re.sub(r'[^a-zA-Z0-9_.-]', '_', os.path.basename(file_obj.name))
            retention_days = getattr(settings, 'PRINT_DOCUMENT_RETENTION_DAYS', 30)
            UploadedDocument.objects.create(
                printing_order=printing_order,
                file=file_obj,
                original_filename=clean_filename,
                file_size_bytes=file_obj.size,
                page_count=actual_pages,
                retention_expiry_date=timezone.now() + timezone.timedelta(days=retention_days)
            )

            # 5. Generate secure 6-digit OTP using secrets module
            plain_otp = f"{secrets.randbelow(900000) + 100000}"
            purpose = OTPVerification.Purpose.DELIVERY if fulfillment == 'DELIVERY' else OTPVerification.Purpose.PICKUP
            otp_rec = OTPVerification(
                order=order,
                purpose=purpose,
                expires_at=timezone.now() + timezone.timedelta(hours=24),
                max_attempts=5,
                attempt_count=0,
            )
            otp_rec.set_otp(plain_otp)
            otp_rec.save()

            # 6. If delivery, create tracking record
            if fulfillment == 'DELIVERY':
                Delivery.objects.create(
                    order=order,
                    delivery_address=validated_data.get('delivery_address', ''),
                    latitude=order.delivery_latitude,
                    longitude=order.delivery_longitude,
                    shop_latitude=order.shop_latitude,
                    shop_longitude=order.shop_longitude,
                    delivery_charge=delivery_fee,
                    delivery_status=Delivery.DeliveryStatus.PENDING
                )

            # 7. Notify Shop Owner of new printing job
            if shop.owner:
                Notification.objects.create(
                    recipient=shop.owner,
                    title="New Printing Order Received",
                    message=f"New print job #{printing_order.id} ({printable_pages} pgs × {copies} copies) submitted by {customer.get_full_name() or customer.username}.",
                    notification_type=Notification.NotificationType.ORDER_STATUS,
                    reference_id=str(order.order_number)
                )

        return printing_order
