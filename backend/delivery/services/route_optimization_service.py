from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from delivery.models import Delivery, DeliveryRoute, DeliveryRouteStop, DeliveryLocation
from delivery.services.map_provider import get_map_provider, haversine_distance, DEFAULT_CAMPUS_LAT, DEFAULT_CAMPUS_LNG


class RouteOptimizationService:
    """
    Intelligent Multi-Stop Route Optimization Engine.
    Implements Nearest-Neighbor heuristic combined with 2-Opt local search,
    strictly honoring promised delivery time windows and urgency priorities.
    """

    AVERAGE_SPEED_KMH = 20.0
    HANDOVER_TIME_MINS = 5

    @classmethod
    def create_route_for_courier(cls, courier, deliveries, start_location="Central Campus Hub", start_coords=None):
        """
        Creates a new DeliveryRoute and associated DeliveryRouteStops for a batch of deliveries.
        Optimizes stop sequences automatically.
        """
        now = timezone.now()
        start_lat, start_lng = start_coords or (DEFAULT_CAMPUS_LAT, DEFAULT_CAMPUS_LNG)

        # Check if courier has reported recent GPS location
        latest_loc = DeliveryLocation.objects.filter(delivery_person=courier, is_current=True).first()
        if latest_loc:
            start_lat = float(latest_loc.latitude)
            start_lng = float(latest_loc.longitude)
            start_location = f"Courier Location ({start_lat:.4f}, {start_lng:.4f})"

        route = DeliveryRoute.objects.create(
            delivery_person=courier,
            date=now.date(),
            status=DeliveryRoute.RouteStatus.PLANNED,
            start_location=start_location,
            start_latitude=Decimal(f"{start_lat:.6f}"),
            start_longitude=Decimal(f"{start_lng:.6f}"),
            optimization_algorithm='NEAREST_NEIGHBOR_2OPT'
        )

        provider = get_map_provider()
        for idx, deliv in enumerate(deliveries, start=1):
            dest_lat = float(deliv.latitude) if deliv.latitude else None
            dest_lng = float(deliv.longitude) if deliv.longitude else None

            if not dest_lat or not dest_lng:
                dest_lat, dest_lng = provider.geocode(deliv.delivery_address)
                deliv.latitude = Decimal(f"{dest_lat:.6f}")
                deliv.longitude = Decimal(f"{dest_lng:.6f}")
                deliv.save(update_fields=['latitude', 'longitude'])

            slot_start = None
            slot_end = None
            if deliv.delivery_slot:
                slot_start = timezone.make_aware(
                    timezone.datetime.combine(deliv.delivery_slot.date, deliv.delivery_slot.start_time)
                )
                slot_end = timezone.make_aware(
                    timezone.datetime.combine(deliv.delivery_slot.date, deliv.delivery_slot.end_time)
                )

            DeliveryRouteStop.objects.create(
                route=route,
                delivery=deliv,
                sequence=idx,
                address=deliv.delivery_address,
                latitude=Decimal(f"{dest_lat:.6f}"),
                longitude=Decimal(f"{dest_lng:.6f}"),
                priority=deliv.priority,
                time_window_start=slot_start,
                time_window_end=slot_end,
                completed=(deliv.delivery_status == Delivery.DeliveryStatus.DELIVERED)
            )

        cls.optimize_route(route)
        return route

    @classmethod
    def optimize_route(cls, route):
        """
        Executes Nearest Neighbor + 2-Opt on uncompleted stops of a route.
        Updates sequences, estimated arrivals, total distance, and duration.
        """
        stops = list(route.stops.select_related('delivery').filter(completed=False).order_by('sequence'))
        completed_stops = list(route.stops.select_related('delivery').filter(completed=True).order_by('sequence'))

        if not stops:
            return route

        start_lat = float(route.start_latitude or DEFAULT_CAMPUS_LAT)
        start_lng = float(route.start_longitude or DEFAULT_CAMPUS_LNG)

        # 1. Nearest Neighbor Initialization with Priority Pre-Sorting
        # Urgent stops get higher initial weighting
        remaining = list(stops)
        current_pt = (start_lat, start_lng)
        ordered = []

        # Separate URGENT stops first if any
        urgent_stops = [s for s in remaining if s.priority == Delivery.DeliveryPriority.URGENT]
        regular_stops = [s for s in remaining if s.priority != Delivery.DeliveryPriority.URGENT]

        for pool in [urgent_stops, regular_stops]:
            while pool:
                best_stop = None
                best_dist = float('inf')
                for s in pool:
                    s_lat = float(s.latitude or DEFAULT_CAMPUS_LAT)
                    s_lng = float(s.longitude or DEFAULT_CAMPUS_LNG)
                    d = haversine_distance(current_pt[0], current_pt[1], s_lat, s_lng)
                    if d < best_dist:
                        best_dist = d
                        best_stop = s
                ordered.append(best_stop)
                pool.remove(best_stop)
                current_pt = (float(best_stop.latitude or DEFAULT_CAMPUS_LAT), float(best_stop.longitude or DEFAULT_CAMPUS_LNG))

        # 2. 2-Opt Local Search Improvement
        if len(ordered) >= 3:
            ordered = cls._run_2opt(ordered, (start_lat, start_lng))

        # 3. Apply New Sequences & Calculate Cumulative ETAs
        provider = get_map_provider()
        cumulative_time = timezone.now()
        current_coord = (start_lat, start_lng)
        total_dist_km = Decimal('0.00')

        # Keep completed stops as first sequences
        seq_counter = 1
        for comp in completed_stops:
            comp.sequence = seq_counter
            comp.save(update_fields=['sequence'])
            seq_counter += 1

        for stop in ordered:
            stop_coord = (float(stop.latitude or DEFAULT_CAMPUS_LAT), float(stop.longitude or DEFAULT_CAMPUS_LNG))
            leg_info = provider.calculate_distance(current_coord, stop_coord)
            leg_dist = Decimal(str(leg_info['distance_km']))
            leg_mins = leg_info['duration_minutes']

            total_dist_km += leg_dist
            cumulative_time += timedelta(minutes=leg_mins)
            stop.estimated_arrival = cumulative_time
            stop.sequence = seq_counter
            stop.save(update_fields=['sequence', 'estimated_arrival'])

            # Update parent delivery estimated_delivery_time
            stop.delivery.estimated_delivery_time = cumulative_time
            stop.delivery.save(update_fields=['estimated_delivery_time'])

            # Buffer for next leg
            cumulative_time += timedelta(minutes=cls.HANDOVER_TIME_MINS)
            current_coord = stop_coord
            seq_counter += 1

        total_duration_mins = int((cumulative_time - timezone.now()).total_seconds() / 60)
        route.total_distance = total_dist_km
        route.estimated_duration = max(5, total_duration_mins)
        route.save(update_fields=['total_distance', 'estimated_duration', 'updated_at'])

        return route

    @classmethod
    def _run_2opt(cls, stops, start_coord, max_iterations=20):
        """
        2-Opt heuristic swaps pairs of edges to eliminate overlapping paths.
        Enforces time-window penalty to prevent reversing stops that have tight deadlines.
        """
        def calculate_total_path(route_stops):
            total = 0.0
            prev = start_coord
            now_dt = timezone.now()
            time_penalty = 0.0

            for s in route_stops:
                cur = (float(s.latitude or DEFAULT_CAMPUS_LAT), float(s.longitude or DEFAULT_CAMPUS_LNG))
                dist = haversine_distance(prev[0], prev[1], cur[0], cur[1])
                total += dist

                # Time window penalty
                travel_mins = (dist / cls.AVERAGE_SPEED_KMH) * 60 + cls.HANDOVER_TIME_MINS
                now_dt += timedelta(minutes=travel_mins)
                if s.time_window_end and now_dt > s.time_window_end:
                    # Violates promised window -> heavy penalty
                    time_penalty += 25.0

                prev = cur

            return total + time_penalty

        best_stops = list(stops)
        best_cost = calculate_total_path(best_stops)

        improved = True
        iterations = 0
        n = len(stops)

        while improved and iterations < max_iterations:
            improved = False
            iterations += 1
            for i in range(n - 1):
                for j in range(i + 1, n):
                    # 2-opt swap: reverse segment between i and j
                    candidate = best_stops[:i] + best_stops[i:j + 1][::-1] + best_stops[j + 1:]
                    cost = calculate_total_path(candidate)
                    if cost < best_cost - 0.01:
                        best_stops = candidate
                        best_cost = cost
                        improved = True
                        break
                if improved:
                    break

        return best_stops

    @classmethod
    def recalculate_route_on_event(cls, route, trigger_reason="EVENT"):
        """
        Triggered when an order is cancelled, a stop is completed, or significant delay is reported.
        Re-evaluates remaining stops from courier's current location.
        """
        latest_loc = DeliveryLocation.objects.filter(
            delivery_person=route.delivery_person,
            is_current=True
        ).first()

        if latest_loc:
            route.start_latitude = latest_loc.latitude
            route.start_longitude = latest_loc.longitude
            route.start_location = f"Live Courier Position ({latest_loc.latitude:.4f}, {latest_loc.longitude:.4f})"
            route.save(update_fields=['start_latitude', 'start_longitude', 'start_location', 'updated_at'])

        cls.optimize_route(route)
        return route
