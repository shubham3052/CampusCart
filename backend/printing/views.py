from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, NotFound, ValidationError
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.http import FileResponse, Http404
from django.utils import timezone
from decimal import Decimal
import pypdf
import os
import re

from .models import PrintingOrder, UploadedDocument, ShopPrintingConfig
from .serializers import (
    PrintingOrderSerializer,
    UploadedDocumentSerializer,
    ShopPrintingConfigSerializer,
    PrintPriceCalculationSerializer,
    PrintOrderCreateSerializer,
)
from orders.models import Order
from notifications.models import Notification
from users.models import AuditLog
from users.services.audit_service import AuditService

class PrintingOrderViewSet(viewsets.ModelViewSet):
    """
    Printing & Xerox Orders Management ViewSet.
    
    SECURITY (STEP 7 & STEP 12 RBAC):
    - Authenticated access required for all endpoints.
    - Students: Create print jobs, inspect files, calculate estimates, view own print orders, download own files.
    - Shop Owners: View queue for their OWN shop, update job status, download documents for their shop's orders.
    - Cross-user and cross-shop access is strictly prevented.
    """
    queryset = PrintingOrder.objects.all()
    serializer_class = PrintingOrderSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    lookup_field = 'id'

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return PrintingOrder.objects.none()

        base_qs = PrintingOrder.objects.select_related(
            'order__customer', 'order__pickup_slot', 'shop'
        ).prefetch_related('documents').order_by('-created_at')

        if user.is_admin:
            queryset = base_qs.all()
        elif user.is_shop_owner:
            queryset = base_qs.filter(shop__owner=user)
        elif user.is_student:
            queryset = base_qs.filter(order__customer=user)
        else:
            return PrintingOrder.objects.none()

        status_param = self.request.query_params.get('status')
        shop_id = self.request.query_params.get('shop')

        if status_param and status_param.upper() != 'ALL':
            queryset = queryset.filter(status=status_param.upper())
        if shop_id:
            queryset = queryset.filter(shop_id=shop_id)

        return queryset

    def get_serializer_class(self):
        if self.action == 'create':
            return PrintOrderCreateSerializer
        elif self.action == 'calculate_price':
            return PrintPriceCalculationSerializer
        elif self.action == 'shops':
            return ShopPrintingConfigSerializer
        return PrintingOrderSerializer

    def create(self, request, *args, **kwargs):
        """
        POST /api/printing/
        Places a real student print order with file upload, validation, and atomic transaction.
        """
        if not (request.user.is_student or request.user.is_admin):
            raise PermissionDenied("Only students or administrators can place document printing orders.")

        serializer = self.get_serializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        printing_order = serializer.save()

        output_serializer = PrintingOrderSerializer(printing_order, context={'request': request})
        return Response({
            "success": True,
            "message": f"Print job #{printing_order.id} submitted successfully! Estimated prep time: {printing_order.estimated_prep_time_mins} mins.",
            "order": output_serializer.data
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='shops')
    def shops(self, request):
        """
        GET /api/printing/shops/
        Lists all active campus shops that offer document printing and their rate cards.
        """
        configs = ShopPrintingConfig.objects.select_related('shop').filter(
            is_printing_enabled=True,
            shop__is_active=True
        ).order_by('-shop__rating')
        serializer = ShopPrintingConfigSerializer(configs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='inspect-file', parser_classes=[MultiPartParser, FormParser])
    def inspect_file(self, request):
        """
        POST /api/printing/inspect-file/
        Inspects an uploaded PDF document and returns server-verified page count and metadata.
        """
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({"success": False, "message": "No file uploaded."}, status=status.HTTP_400_BAD_REQUEST)

        # Max file size: 25 MB
        if file_obj.size > 25 * 1024 * 1024:
            return Response({
                "success": False,
                "message": f"File size exceeds 25 MB maximum limit ({file_obj.size / (1024 * 1024):.1f} MB uploaded)."
            }, status=status.HTTP_400_BAD_REQUEST)

        if file_obj.size == 0:
            return Response({"success": False, "message": "The uploaded file is empty (0 bytes)."}, status=status.HTTP_400_BAD_REQUEST)

        if not file_obj.name.lower().endswith('.pdf'):
            return Response({"success": False, "message": "Only PDF documents (.pdf) are supported."}, status=status.HTTP_400_BAD_REQUEST)

        # PDF Magic Bytes Verification
        file_obj.seek(0)
        magic_bytes = file_obj.read(4)
        file_obj.seek(0)
        if magic_bytes != b'%PDF':
            return Response({"success": False, "message": "Corrupted or invalid PDF file header. Magic bytes mismatch."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            reader = pypdf.PdfReader(file_obj)
            page_count = len(reader.pages)
            if page_count < 1:
                return Response({"success": False, "message": "Uploaded PDF contains 0 pages."}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"success": False, "message": f"Could not parse PDF file: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "success": True,
            "original_filename": file_obj.name,
            "file_size_bytes": file_obj.size,
            "file_size_formatted": f"{file_obj.size / (1024 * 1024):.2f} MB" if file_obj.size >= 1024 * 1024 else f"{file_obj.size / 1024:.1f} KB",
            "page_count": page_count,
        })

    @action(detail=False, methods=['post'], url_path='calculate-price')
    def calculate_price(self, request):
        """
        POST /api/printing/calculate-price/
        Calculates authoritative price breakdown based on shop configuration.
        """
        serializer = PrintPriceCalculationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            config = ShopPrintingConfig.objects.get(shop_id=data['shop'], is_printing_enabled=True)
        except ShopPrintingConfig.DoesNotExist:
            return Response({"success": False, "message": "Printing is not available for the specified shop."}, status=status.HTTP_400_BAD_REQUEST)

        pricing = config.calculate_pricing(
            total_pages=data['total_pages'],
            copies=data['copies'],
            color_mode=data['color_mode'],
            paper_size=data['paper_size'],
            print_sides=data['print_sides'],
            binding_type=data['binding_type']
        )

        delivery_fee = Decimal('15.00') if data['fulfillment_type'] == 'DELIVERY' else Decimal('0.00')
        final_total = pricing['subtotal'] + delivery_fee

        return Response({
            "success": True,
            "rate_per_page": pricing['rate_per_page'],
            "print_cost": pricing['print_cost'],
            "binding_charge": pricing['binding_charge'],
            "subtotal": pricing['subtotal'],
            "delivery_fee": delivery_fee,
            "total_amount": final_total,
            "estimated_prep_time_mins": pricing['prep_time_mins']
        })

    @action(detail=True, methods=['patch', 'post'], url_path='update-status')
    def update_status(self, request, id=None):
        """
        PATCH /api/printing/{id}/update-status/
        Updates print job status in the shop queue (WAITING -> PRINTING -> READY -> COMPLETED).
        Only the fulfilling shop owner or admin can update status.
        """
        printing_order = self.get_object()
        user = request.user

        # Security check: must be the shop owner of this order or admin
        if not user.is_admin:
            if not user.is_shop_owner or printing_order.shop.owner != user:
                raise PermissionDenied("You can only modify print jobs belonging to your own shop.")

        new_status = request.data.get('status')
        if not new_status:
            return Response({"success": False, "message": "Parameter 'status' is required."}, status=status.HTTP_400_BAD_REQUEST)

        new_status = new_status.upper()
        if not printing_order.can_transition_to(new_status):
            allowed = printing_order.VALID_TRANSITIONS.get(printing_order.status, [])
            return Response({
                "success": False,
                "message": f"Invalid status transition from '{printing_order.status}' to '{new_status}'. Allowed next states: {allowed}"
            }, status=status.HTTP_400_BAD_REQUEST)

        printing_order.status = new_status

        # Synchronize parent order status
        parent_order = printing_order.order
        if new_status == PrintingOrder.PrintingStatus.PRINTING:
            parent_order.status = Order.Status.PREPARING
        elif new_status == PrintingOrder.PrintingStatus.READY:
            parent_order.status = Order.Status.READY
            if parent_order.fulfillment_type == Order.FulfillmentType.PICKUP:
                parent_order.generate_pickup_otp()
            else:
                Notification.objects.create(
                    recipient=parent_order.customer,
                    title="Your Print Order is Ready!",
                    message=f"Print Job #{printing_order.id} is ready at {printing_order.shop.name}.",
                    notification_type=Notification.NotificationType.PRINT_READY,
                    reference_id=str(parent_order.order_number)
                )
        elif new_status == PrintingOrder.PrintingStatus.COMPLETED:
            printing_order.completed_at = timezone.now()
            if parent_order.fulfillment_type == Order.FulfillmentType.PICKUP:
                parent_order.status = Order.Status.COMPLETED
            else:
                parent_order.status = Order.Status.DELIVERED
        elif new_status == PrintingOrder.PrintingStatus.CANCELLED:
            parent_order.status = Order.Status.CANCELLED
            # If pickup slot was reserved, release count
            if parent_order.pickup_slot and parent_order.pickup_slot.booked_count > 0:
                parent_order.pickup_slot.booked_count -= 1
                parent_order.pickup_slot.save()

        parent_order.save()
        printing_order.save()

        return Response({
            "success": True,
            "message": f"Print job status updated to '{printing_order.get_status_display()}'.",
            "order": PrintingOrderSerializer(printing_order, context={'request': request}).data
        })

    @action(detail=True, methods=['post'], url_path='upload-document', parser_classes=[MultiPartParser, FormParser])
    def upload_document(self, request, id=None):
        """
        POST /api/printing/{id}/upload-document/
        Attaches a validated document to an existing printing order.
        """
        printing_order = self.get_object()
        user = request.user
        if not (user.is_admin or printing_order.order.customer == user or (user.is_shop_owner and printing_order.shop.owner == user)):
            raise PermissionDenied("You do not have permission to upload documents for this order.")

        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({"success": False, "message": "No file uploaded."}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Size Validation (Max 25 MB)
        MAX_FILE_SIZE = 25 * 1024 * 1024
        if file_obj.size > MAX_FILE_SIZE:
            return Response({
                "success": False,
                "message": f"File size exceeds 25 MB maximum limit ({file_obj.size / (1024 * 1024):.1f} MB uploaded)."
            }, status=status.HTTP_400_BAD_REQUEST)

        if file_obj.size == 0:
            return Response({"success": False, "message": "The uploaded file is empty (0 bytes)."}, status=status.HTTP_400_BAD_REQUEST)

        # 2. Extension Validation
        if not file_obj.name.lower().endswith('.pdf'):
            return Response({"success": False, "message": "Only PDF documents (.pdf) are supported."}, status=status.HTTP_400_BAD_REQUEST)

        # 3. Magic Bytes Verification
        file_obj.seek(0)
        magic_bytes = file_obj.read(4)
        file_obj.seek(0)
        if magic_bytes != b'%PDF':
            return Response({"success": False, "message": "Corrupted or invalid PDF file header. Magic bytes mismatch."}, status=status.HTTP_400_BAD_REQUEST)

        # 4. Filename Sanitization & Path Traversal Defense
        clean_filename = re.sub(r'[^a-zA-Z0-9_.-]', '_', os.path.basename(file_obj.name))

        page_count = request.data.get('page_count')
        if page_count is not None:
            try:
                page_count = int(page_count)
            except (ValueError, TypeError):
                page_count = None

        if not page_count:
            try:
                file_obj.seek(0)
                reader = pypdf.PdfReader(file_obj)
                page_count = len(reader.pages)
            except Exception:
                page_count = 1
            finally:
                file_obj.seek(0)

        doc = UploadedDocument.objects.create(
            printing_order=printing_order,
            file=file_obj,
            original_filename=clean_filename,
            file_size_bytes=file_obj.size,
            page_count=page_count
        )

        # Audit log document upload
        AuditService.log(
            action=AuditLog.Action.DOCUMENT_UPLOADED,
            actor=user,
            target_model='UploadedDocument',
            target_id=str(doc.id),
            metadata={
                "printing_order_id": printing_order.id,
                "filename": clean_filename,
                "file_size": file_obj.size,
                "page_count": page_count,
            },
            request=request
        )

        serializer = UploadedDocumentSerializer(doc)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path=r'documents/(?P<doc_id>\d+)/download')
    def download_document(self, request, id=None, doc_id=None):
        """
        GET /api/printing/{id}/documents/{doc_id}/download/
        Secure authenticated file download with strict security headers.
        Accessible ONLY by:
        1. The customer who uploaded the document for printing
        2. The shop owner whose shop received the order
        3. Platform administrators
        """
        printing_order = self.get_object()
        user = request.user

        # Access check
        is_customer = printing_order.order.customer == user
        is_shop_owner = printing_order.shop and printing_order.shop.owner == user
        is_admin = user.is_admin

        if not (is_customer or is_shop_owner or is_admin):
            raise PermissionDenied("You do not have permission to access or download this document.")

        try:
            doc = printing_order.documents.get(id=doc_id)
        except UploadedDocument.DoesNotExist:
            raise NotFound("Document not found in this printing order.")

        try:
            file_handle = doc.file.open('rb')
            safe_filename = re.sub(r'[^a-zA-Z0-9_.-]', '_', os.path.basename(doc.original_filename))

            # Audit log document access
            AuditService.log(
                action=AuditLog.Action.DOCUMENT_ACCESSED,
                actor=user,
                target_model='UploadedDocument',
                target_id=str(doc.id),
                metadata={
                    "printing_order_id": printing_order.id,
                    "filename": safe_filename,
                },
                request=request
            )

            response = FileResponse(file_handle, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="{safe_filename}"'
            response['X-Content-Type-Options'] = 'nosniff'
            response['Content-Security-Policy'] = "default-src 'none'"
            return response
        except Exception as e:
            raise NotFound(f"Could not read document file: {str(e)}")
