from rest_framework import serializers
from .models import RecommendationInteraction, RecommendationFeedback, RecommendationConfig


class RecommendationItemSerializer(serializers.Serializer):
    """
    Standard schema for all customer-facing recommended stationery items.
    """
    id = serializers.IntegerField()
    product_id = serializers.IntegerField()
    name = serializers.CharField()
    price = serializers.FloatField()
    brand = serializers.CharField(allow_blank=True, required=False)
    category_id = serializers.IntegerField()
    category_name = serializers.CharField()
    shop_id = serializers.IntegerField()
    shop_name = serializers.CharField()
    image_url = serializers.CharField(allow_null=True, required=False)
    available_stock = serializers.IntegerField(default=0)
    is_available = serializers.BooleanField(default=True)
    alternatives = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    recommendation_type = serializers.CharField()
    score = serializers.FloatField()
    reason_code = serializers.CharField()
    reason_text = serializers.CharField()
    metrics = serializers.DictField(required=False, default=dict)
    academic_event = serializers.DictField(required=False, allow_null=True)


class RecommendationInteractionSerializer(serializers.ModelSerializer):
    """
    Serializer for logging student engagement events (Viewed, Clicked, Added to Cart, Purchased, Dismissed).
    """
    class Meta:
        model = RecommendationInteraction
        fields = [
            'id', 'user', 'product', 'shop', 'recommendation_type',
            'action', 'session_id', 'context_data', 'timestamp'
        ]
        read_only_fields = ['id', 'user', 'timestamp']


class RecommendationFeedbackSerializer(serializers.ModelSerializer):
    """
    Serializer for negative/positive student feedback on recommendations.
    """
    class Meta:
        model = RecommendationFeedback
        fields = ['id', 'user', 'product', 'feedback_type', 'comment', 'created_at']
        read_only_fields = ['id', 'user', 'created_at']


class RecommendationConfigSerializer(serializers.ModelSerializer):
    """
    Admin configuration for dynamic hybrid scoring weights.
    """
    class Meta:
        model = RecommendationConfig
        fields = [
            'id', 'personal_history_weight', 'academic_context_weight',
            'product_similarity_weight', 'trending_velocity_weight',
            'popularity_weight', 'recency_decay_halflife_days',
            'min_inventory_required', 'co_occurrence_min_orders',
            'is_active', 'updated_at'
        ]
        read_only_fields = ['id', 'updated_at']
