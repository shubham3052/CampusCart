from rest_framework import serializers
from .models import DemandPrediction, DemandModelMetadata, PurchaseRecommendation, ProductRecommendation
from products.serializers import ProductSummarySerializer
from inventory.models import Inventory


class DemandModelMetadataSerializer(serializers.ModelSerializer):
    """
    Serializer for ML model metadata and evaluation audit trail.
    """
    class Meta:
        model = DemandModelMetadata
        fields = [
            'id',
            'model_name',
            'model_version',
            'model_type',
            'training_date',
            'training_samples',
            'features_used',
            'mae',
            'rmse',
            'r2_score',
            'baseline_mae',
            'data_start_date',
            'data_end_date',
            'is_active',
            'notes',
        ]
        read_only_fields = ['id', 'training_date']


class DemandPredictionSerializer(serializers.ModelSerializer):
    """
    Serializer for stationery demand forecasts (consumed by Shop Owner dashboards).
    Enriched with product details, category, and current inventory levels.
    """
    shop_name = serializers.CharField(source='shop.name', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    category_name = serializers.CharField(source='product.category.name', default='General', read_only=True)
    prediction_date = serializers.DateField(source='target_date', read_only=True)
    predicted_demand = serializers.IntegerField(source='predicted_units', read_only=True)
    current_stock = serializers.SerializerMethodField()

    class Meta:
        model = DemandPrediction
        fields = [
            'id',
            'shop',
            'shop_name',
            'product',
            'product_name',
            'category_name',
            'current_stock',
            'target_date',
            'prediction_date',
            'forecast_horizon',
            'predicted_units',
            'predicted_demand',
            'confidence_score',
            'confidence_interval_low',
            'confidence_interval_high',
            'associated_event',
            'model_name',
            'model_version',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def get_current_stock(self, obj):
        inv = Inventory.objects.filter(shop=obj.shop, product=obj.product).first()
        return inv.current_stock if inv else 0


class PurchaseRecommendationSerializer(serializers.ModelSerializer):
    """
    Comprehensive serializer for Smart Purchase Advisor restocking advice.
    Contains statistical metrics, safety stock, reorder point, supplier intelligence, and viva audit data.
    """
    shop_name = serializers.CharField(source='shop.name', read_only=True)
    product_details = ProductSummarySerializer(source='product', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', default='Unassigned', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    urgency_display = serializers.CharField(source='get_urgency_level_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    reorder_status_display = serializers.CharField(source='get_reorder_status_display', read_only=True)
    stock_movement_display = serializers.CharField(source='get_stock_movement_type_display', read_only=True)
    stockout_risk_display = serializers.CharField(source='get_stockout_risk_display', read_only=True)
    replenishment_timing_display = serializers.CharField(source='get_replenishment_timing_display', read_only=True)
    effective_quantity = serializers.IntegerField(read_only=True)
    po_number = serializers.CharField(source='purchase_order.po_number', default=None, read_only=True)
    overridden_by_name = serializers.CharField(source='overridden_by.username', default=None, read_only=True)

    class Meta:
        model = PurchaseRecommendation
        fields = [
            'id',
            'shop',
            'shop_name',
            'product',
            'product_details',
            'supplier',
            'supplier_name',
            'current_stock',
            'reserved_stock',
            'available_stock',
            'predicted_demand_7d',
            'predicted_demand_30d',
            'planning_horizon',
            'predicted_demand',
            'average_daily_demand',
            'demand_std_dev',
            'lead_time_days',
            'service_level',
            'service_level_z',
            'safety_stock',
            'reorder_point',
            'target_stock',
            'recommended_quantity',
            'recommended_reorder_qty',
            'manual_quantity',
            'override_reason',
            'overridden_by',
            'overridden_by_name',
            'overridden_at',
            'effective_quantity',
            'unit_cost',
            'estimated_purchase_cost',
            'priority',
            'priority_display',
            'urgency_level',
            'urgency_display',
            'status',
            'status_display',
            'reorder_status',
            'reorder_status_display',
            'stock_movement_type',
            'stock_movement_display',
            'stockout_risk',
            'stockout_risk_display',
            'days_of_cover',
            'estimated_stockout_date',
            'replenishment_timing',
            'replenishment_timing_display',
            'demand_spike_alert',
            'demand_spike_info',
            'reason',
            'rationale',
            'action_taken',
            'calculation_breakdown',
            'purchase_order',
            'po_number',
            'is_stale_prediction',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class PurchaseRecommendationOverrideSerializer(serializers.Serializer):
    """
    Validates manual quantity override and reason submitted by shopkeeper.
    """
    manual_quantity = serializers.IntegerField(min_value=0, required=True)
    override_reason = serializers.CharField(max_length=500, required=False, allow_blank=True)


class BulkAcceptRecommendationsSerializer(serializers.Serializer):
    """
    Validates list of recommendation IDs for batch conversion into supplier purchase orders.
    """
    recommendation_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
        required=True
    )


class ProductRecommendationSerializer(serializers.ModelSerializer):
    """
    Smart product recommendations shown to students.
    """
    product_details = ProductSummarySerializer(source='product', read_only=True)
    shop_name = serializers.CharField(source='shop.name', read_only=True)
    recommendation_type_display = serializers.CharField(source='get_recommendation_type_display', read_only=True)

    class Meta:
        model = ProductRecommendation
        fields = [
            'id',
            'user',
            'shop',
            'shop_name',
            'product',
            'product_details',
            'recommendation_type',
            'recommendation_type_display',
            'score',
            'reason',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']
