from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

def custom_exception_handler(exc, context):
    """
    Standardized JSON error formatting across all REST API endpoints.
    Format:
    {
        "success": false,
        "message": "<human-readable summary>",
        "errors": <detailed field-level dict or list>
    }
    """
    response = exception_handler(exc, context)

    if response is not None:
        error_payload = {
            "success": False,
            "message": "An error occurred while processing your request.",
            "errors": response.data
        }

        # Extract cleaner message if available
        if isinstance(response.data, dict):
            if 'detail' in response.data:
                error_payload["message"] = str(response.data['detail'])
            elif 'non_field_errors' in response.data:
                error_payload["message"] = str(response.data['non_field_errors'][0])
            else:
                first_key = next(iter(response.data))
                first_val = response.data[first_key]
                if isinstance(first_val, list):
                    error_payload["message"] = f"{first_key}: {first_val[0]}"
                else:
                    error_payload["message"] = f"{first_key}: {first_val}"
        elif isinstance(response.data, list) and len(response.data) > 0:
            error_payload["message"] = str(response.data[0])

        response.data = error_payload

    if response is None:
        import logging
        from django.conf import settings
        logger = logging.getLogger('django.request')
        view_name = getattr(context.get('view'), '__class__', {}).__name__ if context and context.get('view') else 'UnknownView'
        logger.error(f"Unhandled exception in API view {view_name}: {exc}", exc_info=True)

        return Response({
            "success": False,
            "message": "An internal server error occurred. Please contact system support.",
            "errors": str(exc) if getattr(settings, 'DEBUG', False) else None
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return response
