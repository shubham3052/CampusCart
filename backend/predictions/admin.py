from django.contrib import admin
from .models import DemandPrediction, DemandModelMetadata, PurchaseRecommendation, ProductRecommendation


@admin.register(DemandModelMetadata)
class DemandModelMetadataAdmin(admin.ModelAdmin):
    list_display = ['model_name', 'model_version', 'mae', 'rmse', 'r2_score', 'training_samples', 'is_active', 'training_date']
    list_filter = ['is_active', 'model_name', 'training_date']
    search_fields = ['model_name', 'model_version']
    readonly_fields = ['training_date']


@admin.register(DemandPrediction)
class DemandPredictionAdmin(admin.ModelAdmin):
    list_display = ['product', 'shop', 'target_date', 'forecast_horizon', 'predicted_units', 'confidence_score', 'model_version']
    list_filter = ['forecast_horizon', 'shop', 'target_date', 'model_version']
    search_fields = ['product__name', 'shop__name']
    readonly_fields = ['created_at']


@admin.register(PurchaseRecommendation)
class PurchaseRecommendationAdmin(admin.ModelAdmin):
    list_display = ['product', 'shop', 'current_stock', 'predicted_demand', 'recommended_reorder_qty', 'urgency_level', 'action_taken']
    list_filter = ['urgency_level', 'action_taken', 'shop']
    search_fields = ['product__name', 'shop__name']


@admin.register(ProductRecommendation)
class ProductRecommendationAdmin(admin.ModelAdmin):
    list_display = ['product', 'shop', 'user', 'recommendation_type', 'score']
    list_filter = ['recommendation_type', 'shop']
    search_fields = ['product__name', 'shop__name']
