from django.contrib import admin
from .models import Shop, ShopFavorite, Offer

@admin.register(Shop)
class ShopAdmin(admin.ModelAdmin):
    list_display = ['name', 'owner', 'shop_type', 'campus_location', 'is_active', 'rating', 'created_at']
    list_filter = ['shop_type', 'is_active', 'created_at']
    search_fields = ['name', 'owner__username', 'campus_location']

@admin.register(ShopFavorite)
class ShopFavoriteAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'shop', 'created_at']
    list_filter = ['created_at']
    search_fields = ['user__username', 'shop__name']

@admin.register(Offer)
class OfferAdmin(admin.ModelAdmin):
    list_display = ['title', 'shop', 'discount_type', 'discount_value', 'start_date', 'end_date', 'is_active', 'times_used']
    list_filter = ['discount_type', 'is_active', 'start_date', 'end_date']
    search_fields = ['title', 'shop__name', 'description']
    readonly_fields = ['times_used', 'created_at', 'updated_at']
