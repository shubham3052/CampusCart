from django.core.management.base import BaseCommand
from django.utils import timezone

from recommendations.services.popularity_recommender import get_popular_products, get_trending_products
from recommendations.services.academic_recommender import get_academic_recommendations
from recommendations.models import RecommendationConfig


class Command(BaseCommand):
    help = 'Pre-computes and caches campus recommendation metrics, popularity scores, and trending products.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Simulate refresh process without mutating any state'
        )

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        self.stdout.write(self.style.NOTICE("=" * 64))
        self.stdout.write(self.style.NOTICE("[*] CAMPUS RECOMMENDATION ENGINE: REFRESH WORKER"))
        self.stdout.write(f"Timestamp: {timezone.now().isoformat()} | Dry Run: {dry_run}")
        self.stdout.write(self.style.NOTICE("=" * 64))

        # 1. Verify Configuration
        cfg = RecommendationConfig.get_active()
        self.stdout.write(f"Active Weights: History={cfg.personal_history_weight}, Academic={cfg.academic_context_weight}, Similarity={cfg.product_similarity_weight}")

        # 2. Refresh Popular Products
        popular = get_popular_products(limit=20)
        self.stdout.write(self.style.SUCCESS(f"[-] Evaluated {len(popular)} popular stationery items."))

        # 3. Refresh Trending Products
        trending = get_trending_products(limit=20)
        self.stdout.write(self.style.SUCCESS(f"[-] Evaluated {len(trending)} trending stationery items."))

        # 4. Refresh General Academic Recommendations
        acad = get_academic_recommendations(user=None, limit=10)
        has_events = acad.get('has_academic_events', False)
        event_title = acad.get('upcoming_event', {}).get('title', 'None') if has_events else 'None'
        self.stdout.write(self.style.SUCCESS(f"[-] Academic context evaluated: Primary Event = '{event_title}'"))

        self.stdout.write(self.style.NOTICE("=" * 64))
        self.stdout.write(self.style.SUCCESS("[OK] Recommendation cache and metrics successfully refreshed."))
        self.stdout.write(self.style.NOTICE("=" * 64))
