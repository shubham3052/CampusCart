from django.contrib import admin
from .models import Category, Product, Review, Wishlist, ShoppingList, ShoppingListItem, BulkPricingTier, PriceAlert

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'is_active', 'created_at']
    search_fields = ['name', 'slug']

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['name', 'shop', 'category', 'price', 'is_active', 'created_at']
    list_filter = ['shop', 'category', 'is_active']
    search_fields = ['name', 'brand', 'sku']

@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'product', 'shop', 'rating', 'status', 'is_reported', 'created_at']
    list_filter = ['status', 'rating', 'is_reported', 'created_at']
    search_fields = ['user__username', 'product__name', 'shop__name', 'comment', 'report_reason']
    readonly_fields = ['created_at', 'updated_at']

@admin.register(Wishlist)
class WishlistAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'product', 'created_at']
    list_filter = ['created_at']
    search_fields = ['user__username', 'product__name']
