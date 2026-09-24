from datetime import datetime
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from analytics.filters import parse_date_range


def extract_report_filters(query_params):
    """
    Extracts, validates, and normalizes query parameters for admin reports.
    Returns a clean dictionary containing validated date ranges and filter values.
    """
    # Parse date range using the existing battle-tested date parser
    date_info = parse_date_range(query_params, default_preset='30d')

    # Common relational and attribute filters
    shop_id = query_params.get('shop') or query_params.get('shop_id')
    category_id = query_params.get('category') or query_params.get('category_id')
    product_id = query_params.get('product') or query_params.get('product_id')
    order_status = query_params.get('order_status') or query_params.get('status')
    payment_method = query_params.get('payment_method')
    payment_status = query_params.get('payment_status')
    delivery_status = query_params.get('delivery_status')
    print_status = query_params.get('print_status')
    order_type = query_params.get('order_type')
    academic_event_id = query_params.get('academic_event')
    customer_id = query_params.get('customer')
    search = query_params.get('search', '').strip()
    sort = query_params.get('sort', '').strip()

    # Pagination
    try:
        page = max(1, int(query_params.get('page', 1)))
    except (ValueError, TypeError):
        page = 1

    try:
        page_size = min(100, max(1, int(query_params.get('page_size', 25))))
    except (ValueError, TypeError):
        page_size = 25

    return {
        'start_date': date_info['start_date'],
        'end_date': date_info['end_date'],
        'start_datetime': date_info['start_datetime'],
        'end_datetime': date_info['end_datetime'],
        'preset': date_info['preset'],
        'days': date_info['days'],
        'shop_id': int(shop_id) if shop_id and str(shop_id).isdigit() else None,
        'category_id': int(category_id) if category_id and str(category_id).isdigit() else None,
        'product_id': int(product_id) if product_id and str(product_id).isdigit() else None,
        'customer_id': int(customer_id) if customer_id and str(customer_id).isdigit() else None,
        'academic_event_id': int(academic_event_id) if academic_event_id and str(academic_event_id).isdigit() else None,
        'order_status': order_status.strip().upper() if order_status else None,
        'payment_method': payment_method.strip().upper() if payment_method else None,
        'payment_status': payment_status.strip().upper() if payment_status else None,
        'delivery_status': delivery_status.strip().upper() if delivery_status else None,
        'print_status': print_status.strip().upper() if print_status else None,
        'order_type': order_type.strip().upper() if order_type else None,
        'search': search,
        'sort': sort,
        'page': page,
        'page_size': page_size,
    }
