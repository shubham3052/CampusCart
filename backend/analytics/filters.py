from datetime import datetime, timedelta, time
from django.utils import timezone
from rest_framework.exceptions import ValidationError


def parse_date_range(query_params, default_preset='30d'):
    """
    Parses date range filters from request query parameters.
    Supports preset keys and custom start_date/end_date in YYYY-MM-DD format.
    Returns (start_date, end_date, start_datetime, end_datetime, preset_name).
    """
    now = timezone.now()
    today = now.date()
    preset = query_params.get('preset') or query_params.get('range') or default_preset
    preset = preset.lower()

    start_date_str = query_params.get('start_date')
    end_date_str = query_params.get('end_date')

    if start_date_str and end_date_str:
        try:
            start_date = datetime.strptime(start_date_str.strip(), '%Y-%m-%d').date()
            end_date = datetime.strptime(end_date_str.strip(), '%Y-%m-%d').date()
            preset = 'custom'
        except ValueError:
            raise ValidationError("Invalid date format. Dates must be in YYYY-MM-DD format.")
    elif preset == 'today':
        start_date = today
        end_date = today
    elif preset == 'yesterday':
        start_date = today - timedelta(days=1)
        end_date = today - timedelta(days=1)
    elif preset in ('7d', 'last_7_days', 'last_7_day'):
        start_date = today - timedelta(days=6)
        end_date = today
    elif preset in ('30d', 'last_30_days', 'last_30_day'):
        start_date = today - timedelta(days=29)
        end_date = today
    elif preset in ('90d', 'last_90_days', 'last_90_day'):
        start_date = today - timedelta(days=89)
        end_date = today
    elif preset in ('month', 'this_month'):
        start_date = today.replace(day=1)
        end_date = today
    elif preset in ('prev_month', 'previous_month'):
        first_of_this_month = today.replace(day=1)
        last_of_prev_month = first_of_this_month - timedelta(days=1)
        start_date = last_of_prev_month.replace(day=1)
        end_date = last_of_prev_month
    elif preset in ('year', 'this_year'):
        start_date = today.replace(month=1, day=1)
        end_date = today
    else:
        # Default fallback to 30 days
        start_date = today - timedelta(days=29)
        end_date = today
        preset = '30d'

    if start_date > end_date:
        raise ValidationError("start_date cannot be after end_date.")

    if (end_date - start_date).days > 730:
        raise ValidationError("Date range cannot exceed 730 days (2 years).")

    # Timezone-aware datetimes covering full day boundaries
    start_datetime = timezone.make_aware(datetime.combine(start_date, time.min))
    end_datetime = timezone.make_aware(datetime.combine(end_date, time.max))

    return {
        'start_date': start_date,
        'end_date': end_date,
        'start_datetime': start_datetime,
        'end_datetime': end_datetime,
        'preset': preset,
        'days': (end_date - start_date).days + 1
    }
