from django.utils import timezone
from typing import List, Dict, Any, Optional

from academics.models import AcademicCalendar, AcademicEventImpact, StudentAcademicProfile
from academics.event_intelligence import (
    get_relevant_events_for_student,
    calculate_event_proximity,
    calculate_event_intensity,
)
from products.models import Product, Category
from shops.models import Shop
from printing.models import ShopPrintingConfig
from inventory.models import Inventory
from recommendations.utils.filters import filter_available_products
from recommendations.services.explanation_service import ReasonCode, generate_recommendation_reason


def get_academic_recommendations(
    user,
    limit: int = 8,
    days_ahead: int = 30
) -> Dict[str, Any]:
    """
    Generates academic-event-driven recommendations tailored to the student's
    college, semester, and approaching exams/deadlines from Step 19.
    
    Returns:
    - upcoming_event: The primary imminent academic event
    - products: Stationery items linked by AcademicEventImpact (with direct product and category matches)
    - services: Printing & binding service recommendations with shop capabilities
    """
    events = get_relevant_events_for_student(user, days=days_ahead)
    if not events:
        return {
            'has_academic_events': False,
            'upcoming_event': None,
            'products': [],
            'services': []
        }

    # Primary event is the most imminent active or upcoming event
    primary_event = events[0]
    prox = calculate_event_proximity(primary_event)
    intensity = calculate_event_intensity(primary_event)

    # 1. Fetch configured impacts for this event or event type
    impacts = AcademicEventImpact.objects.filter(
        event=primary_event
    ).select_related('category', 'product')

    # Also check generic impacts matching event_type
    if not impacts.exists():
        impacts = AcademicEventImpact.objects.filter(
            event__isnull=True,
            event_type=primary_event.event_type
        ).select_related('category', 'product')

    impacted_category_ids = set()
    impacted_product_ids = set()
    service_types = set()

    for imp in impacts:
        if imp.product_id:
            impacted_product_ids.add(imp.product_id)
        if imp.category_id:
            impacted_category_ids.add(imp.category_id)
        if imp.service_type:
            service_types.add(imp.service_type)

    # Default heuristic mappings if admin hasn't configured specific impacts yet
    if not impacted_category_ids and not impacted_product_ids:
        if primary_event.event_type in [AcademicCalendar.EventType.FINAL_EXAM, AcademicCalendar.EventType.INTERNAL_EXAM]:
            exam_cats = Category.objects.filter(
                name__iregex=r'(exam|writing|pens|pencils|stationery|tools|paper)'
            ).values_list('id', flat=True)
            impacted_category_ids.update(exam_cats)
        elif primary_event.event_type == AcademicCalendar.EventType.PROJECT_SUBMISSION:
            proj_cats = Category.objects.filter(
                name__iregex=r'(file|paper|sheet|folder|bind|stationery)'
            ).values_list('id', flat=True)
            impacted_category_ids.update(proj_cats)
            service_types.add(AcademicEventImpact.ServiceType.PRINTING)
            service_types.add(AcademicEventImpact.ServiceType.BINDING)
        elif primary_event.event_type == AcademicCalendar.EventType.SEMESTER_START:
            sem_cats = Category.objects.filter(
                name__iregex=r'(notebook|register|pen|file)'
            ).values_list('id', flat=True)
            impacted_category_ids.update(sem_cats)

    # 2. Query matching products
    prods_qs = Product.objects.none()
    if impacted_product_ids or impacted_category_ids:
        prods_qs = Product.objects.filter(
            id__in=impacted_product_ids
        ) | Product.objects.filter(
            category_id__in=impacted_category_ids
        )

    # Student institution filtering: prioritize shops affiliated with student's college
    student_profile = None
    if user and user.is_authenticated:
        student_profile = StudentAcademicProfile.objects.filter(student=user).select_related('institution').first()

    if student_profile and student_profile.institution:
        # Check if any products exist from shops affiliated with this institution
        inst_prods = prods_qs.filter(shop__institution=student_profile.institution)
        if inst_prods.exists():
            prods_qs = inst_prods

    available_prods = list(filter_available_products(prods_qs).select_related('shop', 'category')[:limit])

    recommended_products = []
    for prod in available_prods:
        reason = generate_recommendation_reason(
            ReasonCode.ACADEMIC_EVENT,
            {
                'event_title': primary_event.title,
                'days_until': prox['days_until'],
                'event_type_display': primary_event.get_event_type_display()
            }
        )
        inv = Inventory.objects.filter(product=prod, shop=prod.shop, is_active=True).first()
        recommended_products.append({
            'id': prod.id,
            'product_id': prod.id,
            'name': prod.name,
            'price': float(prod.price),
            'brand': prod.brand,
            'category_id': prod.category.id,
            'category_name': prod.category.name,
            'shop_id': prod.shop.id,
            'shop_name': prod.shop.name,
            'image_url': prod.image.url if prod.image else None,
            'available_stock': inv.available_stock if inv else 0,
            'recommendation_type': 'ACADEMIC',
            'score': round(float(intensity), 4),
            'reason_code': ReasonCode.ACADEMIC_EVENT,
            'reason_text': reason,
            'academic_event': {
                'id': primary_event.id,
                'title': primary_event.title,
                'days_until': prox['days_until'],
                'event_type': primary_event.event_type
            }
        })

    # 3. Printing / Binding Services
    recommended_services = []
    if service_types or primary_event.event_type in [
        AcademicCalendar.EventType.PROJECT_SUBMISSION,
        AcademicCalendar.EventType.ASSIGNMENT,
        AcademicCalendar.EventType.PRACTICAL
    ]:
        print_shops = ShopPrintingConfig.objects.filter(
            is_printing_enabled=True,
            shop__is_active=True
        ).select_related('shop')

        if student_profile and student_profile.institution:
            inst_shops = print_shops.filter(shop__institution=student_profile.institution)
            if inst_shops.exists():
                print_shops = inst_shops

        for cfg in print_shops[:3]:
            recommended_services.append({
                'shop_id': cfg.shop.id,
                'shop_name': cfg.shop.name,
                'bw_rate_per_page': float(cfg.bw_rate_per_page),
                'color_rate_per_page': float(cfg.color_rate_per_page),
                'spiral_binding_price': float(cfg.spiral_binding_price),
                'soft_bind_price': float(cfg.soft_bind_price),
                'hardcover_price': float(cfg.hardcover_price),
                'supported_binding_types': cfg.supported_binding_types,
                'reason_code': ReasonCode.PRINTING_SERVICE,
                'reason_text': f"Fast document printing & binding at {cfg.shop.name} for your upcoming {primary_event.title}.",
                'target_route': f"/student/printing?shop={cfg.shop.id}"
            })

    return {
        'has_academic_events': True,
        'upcoming_event': {
            'id': primary_event.id,
            'title': primary_event.title,
            'event_type': primary_event.event_type,
            'event_type_display': primary_event.get_event_type_display(),
            'importance': primary_event.importance,
            'days_until': prox['days_until'],
            'days_remaining': prox['days_remaining'],
            'is_active': prox['is_active'],
            'intensity_score': intensity
        },
        'products': recommended_products,
        'services': recommended_services
    }


def get_recommended_shops(user, limit: int = 4) -> List[Dict[str, Any]]:
    """
    Ranks campus shops for students based on:
    - Student's affiliated college
    - Product stock availability
    - Printing and binding services enablement
    """
    student_profile = None
    if user and user.is_authenticated:
        student_profile = StudentAcademicProfile.objects.filter(student=user).select_related('institution').first()

    shops_qs = Shop.objects.filter(is_active=True)
    if student_profile and student_profile.institution:
        # Affiliated shops first
        inst_shops = list(shops_qs.filter(institution=student_profile.institution)[:limit])
        other_shops = list(shops_qs.exclude(institution=student_profile.institution)[:max(0, limit - len(inst_shops))])
        shops_list = inst_shops + other_shops
    else:
        shops_list = list(shops_qs[:limit])

    results = []
    for s in shops_list:
        has_printing = hasattr(s, 'printing_config') and s.printing_config.is_printing_enabled
        results.append({
            'id': s.id,
            'name': s.name,
            'campus_location': s.campus_location,
            'contact_phone': s.contact_phone,
            'has_printing': has_printing,
            'institution_name': s.institution.name if s.institution else "General Store",
            'reason': f"Serving {s.institution.name}" if s.institution else "Campus Stationery & Print Partner"
        })

    return results
