import math
import logging
import urllib.request
import urllib.parse
import json
from decimal import Decimal
from django.conf import settings

logger = logging.getLogger(__name__)

# Standard campus coordinates (e.g. Campus Center / Reference Datum)
DEFAULT_CAMPUS_LAT = 28.5450
DEFAULT_CAMPUS_LNG = 77.1926

# Known campus landmark dictionary for deterministic offline geocoding
CAMPUS_LANDMARK_COORDINATES = {
    'academic block 1': (28.5458, 77.1920),
    'academic block 2': (28.5465, 77.1928),
    'academic block 3': (28.5472, 77.1935),
    'academic block 4': (28.5480, 77.1942),
    'central library': (28.5448, 77.1915),
    'student activity center': (28.5440, 77.1930),
    'hostel block a': (28.5425, 77.1900),
    'hostel block b': (28.5420, 77.1908),
    'hostel block c': (28.5415, 77.1918),
    'hostel block d': (28.5410, 77.1928),
    'girls hostel': (28.5430, 77.1895),
    'boys hostel': (28.5418, 77.1910),
    'main gate': (28.5490, 77.1950),
    'library gate': (28.5452, 77.1910),
    'sports complex': (28.5400, 77.1940),
    'cafeteria': (28.5445, 77.1925),
}


def haversine_distance(lat1, lon1, lat2, lon2):
    """
    Computes great-circle (straight-line) distance between two points in kilometers.
    Radius of Earth R = 6371.0 km.
    """
    try:
        lat1, lon1, lat2, lon2 = map(float, [lat1, lon1, lat2, lon2])
    except (ValueError, TypeError):
        return 0.0

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    a = min(1.0, max(0.0, a))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(6371.0 * c, 3)


class BaseMapProvider:
    """
    Abstract interface for map, geocoding, and distance calculations.
    Ensures zero vendor lock-in with seamless switching between OpenStreetMap,
    Google Maps, Mapbox, and 100% offline mathematical fallbacks.
    """
    def calculate_distance(self, origin, destination):
        """
        Calculates distance and travel duration between (lat, lng) tuples.
        Returns:
            {
                'distance_km': float,
                'duration_minutes': int,
                'is_road_distance': bool,
                'provider': str
            }
        """
        raise NotImplementedError

    def calculate_matrix(self, origins, destinations):
        """
        Calculates an NxM distance and duration matrix.
        """
        raise NotImplementedError

    def geocode(self, address_text):
        """
        Converts text address into (latitude, longitude) tuple.
        """
        raise NotImplementedError

    def get_route_polyline(self, waypoints):
        """
        Returns list of (lat, lng) tuples representing route geometry.
        """
        raise NotImplementedError


class DefaultHaversineProvider(BaseMapProvider):
    """
    Guaranteed zero-dependency, 100% offline provider.
    Applies campus road winding factor (1.3x) and average courier speed (20 km/h)
    plus standard 5-minute service/parking buffer.
    """
    ROAD_WINDING_FACTOR = 1.30
    AVERAGE_CAMPUS_SPEED_KMH = 20.0
    BASE_SERVICE_TIME_MINUTES = 5

    def calculate_distance(self, origin, destination):
        lat1, lon1 = origin
        lat2, lon2 = destination
        straight_km = haversine_distance(lat1, lon1, lat2, lon2)
        road_km = round(straight_km * self.ROAD_WINDING_FACTOR, 2)
        travel_hours = road_km / self.AVERAGE_CAMPUS_SPEED_KMH if self.AVERAGE_CAMPUS_SPEED_KMH > 0 else 0
        travel_minutes = int(round(travel_hours * 60))
        total_duration = max(2, travel_minutes + (self.BASE_SERVICE_TIME_MINUTES if road_km > 0.05 else 0))

        return {
            'distance_km': road_km,
            'straight_line_km': straight_km,
            'duration_minutes': total_duration,
            'is_road_distance': True,
            'provider': 'HAVERSINE_CAMPUS_FALLBACK',
        }

    def calculate_matrix(self, origins, destinations):
        matrix = []
        for orig in origins:
            row = []
            for dest in destinations:
                row.append(self.calculate_distance(orig, dest))
            matrix.append(row)
        return matrix

    def geocode(self, address_text):
        if not address_text:
            return DEFAULT_CAMPUS_LAT, DEFAULT_CAMPUS_LNG

        clean_text = str(address_text).lower()
        for landmark, (lat, lng) in CAMPUS_LANDMARK_COORDINATES.items():
            if landmark in clean_text:
                return lat, lng

        # Default to Campus Reference Datum
        return DEFAULT_CAMPUS_LAT, DEFAULT_CAMPUS_LNG

    def get_route_polyline(self, waypoints):
        # Straight-line interpolation for offline geometry
        if not waypoints:
            return []
        polyline = []
        for i in range(len(waypoints) - 1):
            start = waypoints[i]
            end = waypoints[i + 1]
            polyline.append(start)
            # Add midpoint for smoother rendering
            mid = ((float(start[0]) + float(end[0])) / 2.0, (float(start[1]) + float(end[1])) / 2.0)
            polyline.append(mid)
        polyline.append(waypoints[-1])
        return polyline


class OpenStreetMapProvider(BaseMapProvider):
    """
    OpenStreetMap Provider using public OSRM and Nominatim services with
    instant fallback to DefaultHaversineProvider on timeout or network error.
    """
    def __init__(self):
        self.fallback = DefaultHaversineProvider()

    def calculate_distance(self, origin, destination):
        lat1, lon1 = origin
        lat2, lon2 = destination

        # Try OSRM public route service
        try:
            url = f"https://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=false"
            req = urllib.request.Request(
                url,
                headers={'User-Agent': 'SmartStationeryCampusDelivery/1.0'}
            )
            with urllib.request.urlopen(req, timeout=2.5) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode())
                    if data.get('code') == 'Ok' and data.get('routes'):
                        route = data['routes'][0]
                        dist_km = round(route['distance'] / 1000.0, 2)
                        dur_mins = max(2, int(round(route['duration'] / 60.0)) + 3)
                        return {
                            'distance_km': dist_km,
                            'straight_line_km': haversine_distance(lat1, lon1, lat2, lon2),
                            'duration_minutes': dur_mins,
                            'is_road_distance': True,
                            'provider': 'OSRM_OPENSTREETMAP',
                        }
        except Exception as e:
            logger.debug("OSRM routing request failed (%s), using Haversine fallback", e)

        return self.fallback.calculate_distance(origin, destination)

    def calculate_matrix(self, origins, destinations):
        # For batch calculations on campus, use fallback to avoid external rate-limiting
        return self.fallback.calculate_matrix(origins, destinations)

    def geocode(self, address_text):
        if not address_text:
            return DEFAULT_CAMPUS_LAT, DEFAULT_CAMPUS_LNG

        clean_text = str(address_text).lower()
        # Fast local campus dictionary check first
        for landmark, (lat, lng) in CAMPUS_LANDMARK_COORDINATES.items():
            if landmark in clean_text:
                return lat, lng

        # Optionally query Nominatim for off-campus or city addresses
        try:
            query = urllib.parse.quote(address_text)
            url = f"https://nominatim.openstreetmap.org/search?q={query}&format=json&limit=1"
            req = urllib.request.Request(
                url,
                headers={'User-Agent': 'SmartStationeryCampusDelivery/1.0'}
            )
            with urllib.request.urlopen(req, timeout=2.0) as response:
                if response.status == 200:
                    results = json.loads(response.read().decode())
                    if results and len(results) > 0:
                        return float(results[0]['lat']), float(results[0]['lon'])
        except Exception as e:
            logger.debug("Nominatim geocode failed (%s), using local fallback", e)

        return self.fallback.geocode(address_text)

    def get_route_polyline(self, waypoints):
        return self.fallback.get_route_polyline(waypoints)


def get_map_provider():
    """
    Factory creating configured map provider based on settings.MAP_PROVIDER.
    Defaults to OpenStreetMap with automatic offline fallback.
    """
    provider_name = getattr(settings, 'MAP_PROVIDER', 'OSM').upper()
    if provider_name == 'HAVERSINE' or provider_name == 'LOCAL':
        return DefaultHaversineProvider()
    return OpenStreetMapProvider()
