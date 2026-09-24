from django.contrib import admin
from .models import RecommendationInteraction, RecommendationFeedback, RecommendationConfig


@admin.register(RecommendationInteraction)
class RecommendationInteractionAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'product', 'shop', 'recommendation_type', 'action', 'timestamp']
    list_filter = ['action', 'recommendation_type', 'timestamp']
    search_fields = ['user__username', 'product__name', 'shop__name']
    readonly_fields = ['timestamp']


@admin.register(RecommendationFeedback)
class RecommendationFeedbackAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'product', 'feedback_type', 'created_at']
    list_filter = ['feedback_type', 'created_at']
    search_fields = ['user__username', 'product__name', 'comment']
    readonly_fields = ['created_at']


@admin.register(RecommendationConfig)
class RecommendationConfigAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'is_active', 'personal_history_weight', 'academic_context_weight',
        'product_similarity_weight', 'trending_velocity_weight', 'popularity_weight',
        'updated_at'
    ]
