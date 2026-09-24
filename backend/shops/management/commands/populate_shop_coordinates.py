import random
from decimal import Decimal
from django.core.management.base import BaseCommand
from shops.models import Shop

CAMPUS_COORDINATE_PRESETS = [
    (Decimal('28.545800'), Decimal('77.193200'), "Student Activity Center (SAC) Block B"),
    (Decimal('28.544200'), Decimal('77.191500'), "Main Academic Complex Gate 1"),
    (Decimal('28.546500'), Decimal('77.194500'), "North Campus Hostel Market Core"),
    (Decimal('28.543500'), Decimal('77.190500'), "Central Library & Tech Hub"),
    (Decimal('28.547100'), Decimal('77.192100'), "Faculty & Student Co-op Plaza"),
    (Decimal('28.544800'), Decimal('77.195000'), "East Gate Commercial Complex"),
    (Decimal('28.542900'), Decimal('77.191800'), "South Hostel Cluster Quad"),
    (Decimal('28.546000'), Decimal('77.189500'), "West Campus Science Quad"),
]

class Command(BaseCommand):
    help = "Populate realistic university campus coordinates for shops with null or missing location coordinates."

    def handle(self, *args, **options):
        shops = Shop.objects.all()
        updated_count = 0

        for idx, shop in enumerate(shops):
            if shop.latitude is None or shop.longitude is None:
                preset = CAMPUS_COORDINATE_PRESETS[idx % len(CAMPUS_COORDINATE_PRESETS)]
                shop.latitude = preset[0]
                shop.longitude = preset[1]
                if not shop.campus_location:
                    shop.campus_location = preset[2]
                shop.save(update_fields=['latitude', 'longitude', 'campus_location'])
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Updated Shop #{shop.id} '{shop.name}' -> ({shop.latitude}, {shop.longitude}) [{shop.campus_location}]"
                    )
                )
                updated_count += 1
            else:
                self.stdout.write(f"Shop #{shop.id} '{shop.name}' already has coordinates ({shop.latitude}, {shop.longitude})")

        self.stdout.write(self.style.SUCCESS(f"Successfully populated coordinates for {updated_count} shop(s)."))
