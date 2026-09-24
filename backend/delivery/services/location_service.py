from datetime import datetime, timedelta
from decimal import Decimal
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.conf import settings
from rest_framework.exceptions import ValidationError, PermissionDenied

from delivery.models import Delivery, DeliveryLocation
from notifications.models import Notification
from delivery.services.map_provider import get_map_provider, haversine_distance

# Configurable constants
MAX_OPERATIONAL_SPEED_KMH = getattr(settings, 'MAX_LOCATION_SPEED_KMH', 80.0)  # ~22.2 m/s
ACCURACY_REJECTION_THRESHOLD_METERS = 200.0
PROXIMITY_ARRIVING_RADIUS_METERS = 200.0
LOCATION_UPDATE_TIME_THRESHOLD_SECONDS = 5
LOCATION_UPDATE_DISTANCE_THRESHOLD_METERS = 20.0
STALE_LOCATION_THRESHOLD_MINUTES = 4


class DeliveryLocationService:
    """
    Central service for processing courier GPS location updates, anti-spoofing validation,
    proximity detection, dynamic ETA calculations, and location privacy enforcement.
    """

    @staticmethod
    def validate_and_record_location(courier, delivery_id, latitude, longitude, accuracy=10.0,
                                      heading=None, speed=None, timestamp=None, source='GPS'):
        """
        Validates incoming GPS payload from courier device, checks anti-spoofing velocity,
        records location, and triggers auto-arriving proximity detection.
        """
        # 1. Coordinate ranges validation
        try:
            lat = float(latitude)
            lng = float(longitude)
            acc = float(accuracy) if accuracy is not None else 10.0
        except (ValueError, TypeError):
            raise ValidationError({"location": "Invalid latitude, longitude, or accuracy format."})

        if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lng <= 180.0):
            raise ValidationError({"location": "Latitude must be within [-90, 90] and longitude within [-180, 180]."})

        if acc > ACCURACY_REJECTION_THRESHOLD_METERS:
            raise ValidationError({"accuracy": f"Location accuracy ({acc:.1f}m) exceeds acceptable noise threshold ({ACCURACY_REJECTION_THRESHOLD_METERS}m)."})

        # 2. Timestamp validation
        now = timezone.now()
        ts = timestamp or now
        if isinstance(ts, str):
            parsed = parse_datetime(ts)
            if parsed is None:
                try:
                    val = float(ts)
                    if val > 1e11:  # milliseconds
                        val = val / 1000.0
                    parsed = datetime.fromtimestamp(val, tz=timezone.utc if timezone.is_aware(now) else None)
                except (ValueError, TypeError, OverflowError):
                    raise ValidationError({"timestamp": "Invalid timestamp format. ISO-8601 string or numeric timestamp required."})
            ts = parsed
        elif isinstance(ts, (int, float)):
            try:
                val = float(ts)
                if val > 1e11:
                    val = val / 1000.0
                ts = datetime.fromtimestamp(val, tz=timezone.utc if timezone.is_aware(now) else None)
            except (ValueError, TypeError, OverflowError):
                raise ValidationError({"timestamp": "Invalid numeric timestamp format."})

        if timezone.is_naive(ts):
            ts = timezone.make_aware(ts)

        if ts > now + timedelta(minutes=5):
            raise ValidationError({"timestamp": "Location timestamp cannot be set in the future."})
        if ts < now - timedelta(hours=24):
            raise ValidationError({"timestamp": "Location update is too stale (> 24 hours old)."})

        # 3. Delivery assignment & authorization
        delivery = None
        if delivery_id:
            try:
                delivery = Delivery.objects.select_related('order__customer', 'order__shop').get(id=delivery_id)
            except Delivery.DoesNotExist:
                raise ValidationError({"delivery_id": "Delivery not found."})

            if delivery.delivery_agent != courier and not courier.is_admin:
                raise PermissionDenied("You are not the courier assigned to this delivery.")

            if delivery.delivery_status not in [
                Delivery.DeliveryStatus.PICKED_UP,
                Delivery.DeliveryStatus.OUT_FOR_DELIVERY,
                Delivery.DeliveryStatus.ARRIVING,
            ]:
                raise ValidationError({
                    "delivery_status": f"Cannot track delivery with status '{delivery.delivery_status}'. Active transit status required."
                })

        # 4. Anti-spoofing & Impossible Velocity Check
        last_loc = DeliveryLocation.objects.filter(
            delivery_person=courier,
            is_current=True
        ).first()

        is_suspicious = False
        if last_loc:
            time_diff_seconds = (ts - last_loc.timestamp).total_seconds()
            # If update arrived within minimal threshold, check throttling
            dist_km = haversine_distance(last_loc.latitude, last_loc.longitude, lat, lng)
            dist_meters = dist_km * 1000.0

            if time_diff_seconds > 1.0:
                speed_kmh = (dist_km / (time_diff_seconds / 3600.0))
                if speed_kmh > MAX_OPERATIONAL_SPEED_KMH:
                    is_suspicious = True

            # Write Throttling: If moved < 20m and elapsed < 5s, just update timestamp of current location
            if time_diff_seconds < LOCATION_UPDATE_TIME_THRESHOLD_SECONDS and dist_meters < LOCATION_UPDATE_DISTANCE_THRESHOLD_METERS:
                last_loc.timestamp = ts
                last_loc.accuracy = acc
                if heading is not None:
                    last_loc.heading = heading
                if speed is not None:
                    last_loc.speed = speed
                last_loc.save(update_fields=['timestamp', 'accuracy', 'heading', 'speed'])
                return last_loc, False

        # Mark previous locations as not current
        DeliveryLocation.objects.filter(
            delivery_person=courier,
            is_current=True
        ).update(is_current=False)

        # Create new authoritative current location record
        new_loc = DeliveryLocation.objects.create(
            delivery=delivery,
            delivery_person=courier,
            latitude=Decimal(f"{lat:.6f}"),
            longitude=Decimal(f"{lng:.6f}"),
            accuracy=acc,
            heading=heading,
            speed=speed,
            timestamp=ts,
            source=source,
            is_current=True,
            is_flagged_suspicious=is_suspicious,
        )

        # 5. Proximity & Auto-Arriving Detection
        if delivery and delivery.delivery_status == Delivery.DeliveryStatus.OUT_FOR_DELIVERY:
            dest_lat, dest_lng = DeliveryLocationService.get_delivery_destination_coords(delivery)
            if dest_lat and dest_lng:
                dist_to_dest_m = haversine_distance(lat, lng, dest_lat, dest_lng) * 1000.0
                if dist_to_dest_m <= PROXIMITY_ARRIVING_RADIUS_METERS:
                    delivery.delivery_status = Delivery.DeliveryStatus.ARRIVING
                    delivery.save(update_fields=['delivery_status', 'updated_at'])

                    # Notify student
                    try:
                        Notification.objects.create(
                            recipient=delivery.order.customer,
                            title="Courier Arriving Soon!",
                            message=f"Courier {courier.name or courier.username} has arrived within {int(dist_to_dest_m)}m of your drop location. Please keep your 6-digit delivery OTP ready!",
                            notification_type=Notification.NotificationType.DELIVERY_UPDATE,
                            reference_id=str(delivery.order.order_number)
                        )
                    except Exception:
                        pass

        return new_loc, True

    @staticmethod
    def get_delivery_destination_coords(delivery):
        """
        Resolves destination latitude and longitude for a delivery.
        Falls back to geocoding formatted delivery address if coordinates are missing.
        """
        if delivery.latitude and delivery.longitude:
            return float(delivery.latitude), float(delivery.longitude)

        # Check associated student address from order if available
        provider = get_map_provider()
        lat, lng = provider.geocode(delivery.delivery_address)
        if lat and lng:
            delivery.latitude = Decimal(f"{lat:.6f}")
            delivery.longitude = Decimal(f"{lng:.6f}")
            delivery.save(update_fields=['latitude', 'longitude'])
            return lat, lng

        return None, None

    @staticmethod
    def get_live_tracking_info(delivery, requester):
        """
        Computes privacy-enforced live tracking payload for a delivery.
        Only allowed for:
        - The ordering student (while OUT_FOR_DELIVERY or ARRIVING)
        - Assigned courier
        - Shop owner of the order's shop
        - System admin
        """
        # Privacy & Authorization Checks
        is_customer = delivery.order.customer == requester
        is_assigned_courier = delivery.delivery_agent == requester
        is_shop_owner = delivery.order.shop and delivery.order.shop.owner == requester
        is_admin = requester.is_admin

        if not (is_customer or is_assigned_courier or is_shop_owner or is_admin):
            raise PermissionDenied("You are not authorized to track this delivery.")

        # Students can only see live GPS when actively on campus transit
        if is_customer and delivery.delivery_status not in [
            Delivery.DeliveryStatus.OUT_FOR_DELIVERY,
            Delivery.DeliveryStatus.ARRIVING,
        ]:
            return {
                'tracking_active': False,
                'delivery_status': delivery.delivery_status,
                'status_display': delivery.get_delivery_status_display(),
                'message': f"Live GPS tracking is not active for status '{delivery.get_delivery_status_display()}'.",
                'current_location': None,
                'destination': None,
                'eta': None,
            }

        # Retrieve courier's current location
        courier = delivery.delivery_agent
        current_loc = None
        if courier:
            current_loc = DeliveryLocation.objects.filter(
                delivery_person=courier,
                is_current=True
            ).first()

        dest_lat, dest_lng = DeliveryLocationService.get_delivery_destination_coords(delivery)

        dest_payload = None
        if dest_lat and dest_lng:
            dest_payload = {
                'latitude': dest_lat,
                'longitude': dest_lng,
                'address': delivery.delivery_address,
            }

        if not current_loc:
            return {
                'tracking_active': True,
                'delivery_status': delivery.delivery_status,
                'status_display': delivery.get_delivery_status_display(),
                'message': "Courier location signal currently unavailable.",
                'current_location': None,
                'destination': dest_payload,
                'eta': None,
            }

        now = timezone.now()
        age_seconds = int((now - current_loc.timestamp).total_seconds())
        is_stale = age_seconds > (STALE_LOCATION_THRESHOLD_MINUTES * 60)

        # Calculate Distance and ETA via Map Provider
        provider = get_map_provider()
        distance_info = None
        eta_minutes = None
        confidence = 'LOW'

        if dest_lat and dest_lng:
            dist_res = provider.calculate_distance(
                (float(current_loc.latitude), float(current_loc.longitude)),
                (dest_lat, dest_lng)
            )
            distance_info = {
                'distance_km': dist_res['distance_km'],
                'straight_line_km': dist_res.get('straight_line_km', dist_res['distance_km']),
                'is_road_distance': dist_res['is_road_distance'],
                'provider': dist_res['provider'],
            }
            eta_minutes = dist_res['duration_minutes']

            # Classify ETA confidence
            if not is_stale and current_loc.accuracy <= 30.0:
                confidence = 'HIGH'
            elif not is_stale and current_loc.accuracy <= 100.0:
                confidence = 'MEDIUM'
            else:
                confidence = 'LOW'

        loc_payload = {
            'latitude': float(current_loc.latitude),
            'longitude': float(current_loc.longitude),
            'accuracy': current_loc.accuracy,
            'heading': current_loc.heading,
            'speed': current_loc.speed,
            'timestamp': current_loc.timestamp.isoformat(),
            'age_seconds': age_seconds,
            'is_stale': is_stale,
            'source': current_loc.source,
        }

        # Polyline points
        polyline = []
        if dest_lat and dest_lng:
            polyline = provider.get_route_polyline([
                (float(current_loc.latitude), float(current_loc.longitude)),
                (dest_lat, dest_lng)
            ])

        return {
            'tracking_active': True,
            'delivery_id': delivery.id,
            'order_number': str(delivery.order.order_number),
            'delivery_status': delivery.delivery_status,
            'status_display': delivery.get_delivery_status_display(),
            'courier_name': courier.name or courier.username if courier else "Assigned Courier",
            'current_location': loc_payload,
            'destination': dest_payload,
            'distance': distance_info,
            'eta_minutes': eta_minutes,
            'eta_confidence': confidence,
            'polyline': polyline,
            'has_active_otp': delivery.order.otps.filter(is_verified=False).exists(),
        }
