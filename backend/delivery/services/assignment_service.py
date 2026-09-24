from django.db.models import Count, Q
from django.utils import timezone
from users.models import User
from delivery.models import Delivery, DeliveryLocation
from delivery.services.map_provider import get_map_provider, haversine_distance, DEFAULT_CAMPUS_LAT, DEFAULT_CAMPUS_LNG


class DeliveryAssignmentService:
    """
    Intelligent Courier Assignment Engine.
    Evaluates active couriers based on distance to shop, active workload,
    delivery zone compatibility, and time-window feasibility.
    """

    WEIGHT_DISTANCE = 0.35
    WEIGHT_WORKLOAD = 0.30
    WEIGHT_ZONE = 0.20
    WEIGHT_TIME_WINDOW = 0.15

    @classmethod
    def rank_candidate_agents(cls, delivery):
        """
        Ranks all active and available delivery agents for an unassigned or reassignable delivery.
        Returns sorted list of candidate dicts with score breakdown and explanation string.
        """
        shop = delivery.order.shop
        shop_lat = float(shop.latitude) if shop and shop.latitude else DEFAULT_CAMPUS_LAT
        shop_lng = float(shop.longitude) if shop and shop.longitude else DEFAULT_CAMPUS_LNG

        # Find eligible active couriers
        couriers = User.objects.filter(
            role=User.Role.DELIVERY_AGENT,
            is_active=True,
        ).exclude(
            availability_status=User.AvailabilityStatus.OFFLINE
        ).annotate(
            active_load=Count(
                'assigned_deliveries',
                filter=Q(assigned_deliveries__delivery_status__in=[
                    Delivery.DeliveryStatus.ASSIGNED,
                    Delivery.DeliveryStatus.PICKED_UP,
                    Delivery.DeliveryStatus.OUT_FOR_DELIVERY,
                    Delivery.DeliveryStatus.ARRIVING,
                ])
            )
        )

        candidates = []
        for agent in couriers:
            # 1. Distance Score
            latest_loc = DeliveryLocation.objects.filter(
                delivery_person=agent,
                is_current=True
            ).first()

            if latest_loc:
                dist_km = haversine_distance(shop_lat, shop_lng, latest_loc.latitude, latest_loc.longitude)
            else:
                # Neutral default if no GPS reported yet today
                dist_km = 1.5

            # Distance scoring: 0km -> 1.0, 5km -> 0.0
            dist_score = max(0.0, 1.0 - (dist_km / 5.0))

            # 2. Workload Score
            load = agent.active_load
            workload_score = max(0.0, 1.0 - (load * 0.25))

            # 3. Zone Match Score
            zone_score = 0.5
            if delivery.delivery_zone:
                agent_same_zone = Delivery.objects.filter(
                    delivery_agent=agent,
                    delivery_zone=delivery.delivery_zone,
                    delivery_status__in=[
                        Delivery.DeliveryStatus.ASSIGNED,
                        Delivery.DeliveryStatus.PICKED_UP,
                        Delivery.DeliveryStatus.OUT_FOR_DELIVERY,
                    ]
                ).exists()
                if agent_same_zone:
                    zone_score = 1.0

            # 4. Time Window Fit Score
            # If agent has < 3 active deliveries, high time-window compatibility
            time_score = 1.0 if load <= 2 else (0.7 if load <= 4 else 0.3)

            composite_score = (
                (cls.WEIGHT_DISTANCE * dist_score) +
                (cls.WEIGHT_WORKLOAD * workload_score) +
                (cls.WEIGHT_ZONE * zone_score) +
                (cls.WEIGHT_TIME_WINDOW * time_score)
            )

            # Build human-readable explanation
            reason_parts = []
            if dist_km <= 1.0:
                reason_parts.append(f"close to shop ({dist_km:.1f} km)")
            else:
                reason_parts.append(f"{dist_km:.1f} km from shop")

            if load == 0:
                reason_parts.append("currently idle with 0 active orders")
            else:
                reason_parts.append(f"{load} active order(s)")

            if zone_score == 1.0:
                reason_parts.append("already serving the same delivery zone")

            explanation = f"Recommended: {', '.join(reason_parts)}."

            candidates.append({
                'agent_id': agent.id,
                'agent_name': agent.name or agent.username,
                'phone_number': agent.phone_number,
                'availability_status': agent.availability_status,
                'active_load': load,
                'distance_km': round(dist_km, 2),
                'scores': {
                    'composite': round(composite_score, 3),
                    'distance': round(dist_score, 3),
                    'workload': round(workload_score, 3),
                    'zone': round(zone_score, 3),
                    'time_window': round(time_score, 3),
                },
                'explanation': explanation,
            })

        # Sort descending by composite score
        candidates.sort(key=lambda x: x['scores']['composite'], reverse=True)
        return candidates

    @classmethod
    def auto_assign(cls, delivery):
        """
        Picks top-ranked courier and assigns delivery atomically.
        """
        candidates = cls.rank_candidate_agents(delivery)
        if not candidates:
            return None, "No available delivery couriers on shift."

        best = candidates[0]
        agent = User.objects.get(id=best['agent_id'])

        delivery.delivery_agent = agent
        delivery.delivery_status = Delivery.DeliveryStatus.ASSIGNED
        delivery.assigned_at = timezone.now()
        delivery.save(update_fields=['delivery_agent', 'delivery_status', 'assigned_at', 'updated_at'])

        return agent, best['explanation']
