from rest_framework.routers import DefaultRouter
from users.views import UserViewSet
from products.views import (
    CategoryViewSet,
    ProductViewSet,
    ShoppingListViewSet,
    BulkPricingTierViewSet,
    PriceAlertViewSet,
    ReviewViewSet,
    WishlistViewSet,
)
from shops.views import ShopViewSet, ShopFavoriteViewSet, OfferViewSet
from inventory.views import (
    InventoryViewSet,
    SupplierViewSet,
    PurchaseOrderViewSet,
    InventoryTransactionViewSet,
    InventoryReturnViewSet,
)
from orders.views import OrderViewSet, BulkOrderViewSet, CouponViewSet, ComplaintViewSet, PaymentViewSet, RefundViewSet
from printing.views import PrintingOrderViewSet
from delivery.views import (
    PickupSlotViewSet,
    DeliveryViewSet,
    StudentAddressViewSet,
    DeliverySlotViewSet,
    DeliveryZoneViewSet,
    DeliveryRouteViewSet,
)
from notifications.views import NotificationViewSet, NotificationPreferenceViewSet
from academics.views import (
    InstitutionViewSet,
    AcademicYearViewSet,
    SemesterViewSet,
    AcademicCalendarViewSet,
    AcademicEventImpactViewSet,
    StudentAcademicProfileViewSet,
    StudentNoteViewSet,
    StudentTaskViewSet,
    StudentChecklistViewSet,
    PlannerViewSet,
)
from predictions.views import DemandPredictionViewSet, PurchaseRecommendationViewSet
from recommendations.views import RecommendationViewSet

router = DefaultRouter()

# Register all modular app ViewSets to exact requested URL paths
router.register(r'users', UserViewSet, basename='users')
router.register(r'shops', ShopViewSet, basename='shops')
router.register(r'categories', CategoryViewSet, basename='categories')
router.register(r'products', ProductViewSet, basename='products')
router.register(r'shopping-lists', ShoppingListViewSet, basename='shopping-lists')
router.register(r'inventory', InventoryViewSet, basename='inventory')
router.register(r'suppliers', SupplierViewSet, basename='suppliers')
router.register(r'purchase-orders', PurchaseOrderViewSet, basename='purchase-orders')
router.register(r'inventory-transactions', InventoryTransactionViewSet, basename='inventory-transactions')
router.register(r'inventory-returns', InventoryReturnViewSet, basename='inventory-returns')
router.register(r'orders', OrderViewSet, basename='orders')
router.register(r'bulk-orders', BulkOrderViewSet, basename='bulk-orders')
router.register(r'bulk-pricing-tiers', BulkPricingTierViewSet, basename='bulk-pricing-tiers')
router.register(r'price-alerts', PriceAlertViewSet, basename='price-alerts')
router.register(r'printing', PrintingOrderViewSet, basename='printing')
router.register(r'pickup-slots', PickupSlotViewSet, basename='pickup-slots')
router.register(r'delivery-slots', DeliverySlotViewSet, basename='delivery-slots')
router.register(r'delivery-zones', DeliveryZoneViewSet, basename='delivery-zones')
router.register(r'deliveries', DeliveryViewSet, basename='deliveries')
router.register(r'delivery-routes', DeliveryRouteViewSet, basename='delivery-routes')
router.register(r'addresses', StudentAddressViewSet, basename='addresses')
router.register(r'notifications', NotificationViewSet, basename='notifications')
router.register(r'notes', StudentNoteViewSet, basename='notes')
router.register(r'tasks', StudentTaskViewSet, basename='tasks')
router.register(r'checklists', StudentChecklistViewSet, basename='checklists')
router.register(r'planner', PlannerViewSet, basename='planner')
router.register(r'academic', AcademicCalendarViewSet, basename='academic')
router.register(r'academic-events', AcademicCalendarViewSet, basename='academic-events')
router.register(r'institutions', InstitutionViewSet, basename='institutions')
router.register(r'academic-years', AcademicYearViewSet, basename='academic-years')
router.register(r'semesters', SemesterViewSet, basename='semesters')
router.register(r'academic-impacts', AcademicEventImpactViewSet, basename='academic-impacts')
router.register(r'academic-event-impacts', AcademicEventImpactViewSet, basename='academic-event-impacts')
router.register(r'student-academic-profile', StudentAcademicProfileViewSet, basename='student-academic-profile')
router.register(r'demand-predictions', DemandPredictionViewSet, basename='demand-predictions')
router.register(r'recommendations', RecommendationViewSet, basename='recommendations')
router.register(r'purchase-recommendations', PurchaseRecommendationViewSet, basename='purchase-recommendations')

# Step 24: Engagement, Trust, Wishlist, Offers & Support
router.register(r'reviews', ReviewViewSet, basename='reviews')
router.register(r'wishlist', WishlistViewSet, basename='wishlist')
router.register(r'favorites/shops', ShopFavoriteViewSet, basename='shop-favorites')
router.register(r'offers', OfferViewSet, basename='offers')
router.register(r'coupons', CouponViewSet, basename='coupons')
router.register(r'complaints', ComplaintViewSet, basename='complaints')
router.register(r'notification-preferences', NotificationPreferenceViewSet, basename='notification-preferences')

# Step 25: Authoritative Payment & Refund Management
router.register(r'payments', PaymentViewSet, basename='payments')
router.register(r'refunds', RefundViewSet, basename='refunds')

urlpatterns = router.urls

