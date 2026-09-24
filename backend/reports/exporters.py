import csv
import io
from datetime import date, datetime
from decimal import Decimal
from django.http import HttpResponse


def format_csv_cell(value):
    """
    Normalizes python values into clean CSV cell strings:
    - Decimals formatted with 2 decimal places e.g. '123.45'
    - Datetimes formatted as 'YYYY-MM-DD HH:MM:SS'
    - Dates formatted as 'YYYY-MM-DD'
    - Booleans formatted as 'Yes'/'No'
    - None formatted as empty string ''
    - Lists/dicts formatted as readable JSON/comma string
    """
    if value is None:
        return ''
    if isinstance(value, Decimal):
        return f"{value:.2f}"
    if isinstance(value, datetime):
        return value.strftime('%Y-%m-%d %H:%M:%S')
    if isinstance(value, date):
        return value.strftime('%Y-%m-%d')
    if isinstance(value, bool):
        return 'Yes' if value else 'No'
    if isinstance(value, (list, tuple)):
        return '; '.join(str(item) for item in value)
    return str(value)


def generate_csv_response(filename_prefix, start_date, end_date, headers, rows):
    """
    Builds a secure, UTF-8 encoded HttpResponse containing CSV data.
    Includes UTF-8 BOM (\ufeff) for seamless Microsoft Excel & LibreOffice rendering.
    Safely handles commas, quotes, and newlines via the python csv.writer module.
    """
    start_str = start_date.strftime('%Y-%m-%d') if isinstance(start_date, (date, datetime)) else str(start_date)
    end_str = end_date.strftime('%Y-%m-%d') if isinstance(end_date, (date, datetime)) else str(end_date)
    filename = f"{filename_prefix}_{start_str}_to_{end_str}.csv"

    output = io.StringIO()
    # Write UTF-8 BOM so Excel automatically recognizes UTF-8 encoding
    output.write('\ufeff')

    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
    writer.writerow(headers)

    for row in rows:
        formatted_row = [format_csv_cell(cell) for cell in row]
        writer.writerow(formatted_row)

    csv_data = output.getvalue().encode('utf-8')
    output.close()

    response = HttpResponse(csv_data, content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    response['Access-Control-Expose-Headers'] = 'Content-Disposition'
    return response
