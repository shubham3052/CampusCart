from rest_framework import serializers


class ShopKPISummarySerializer(serializers.Serializer):
    today_sales = serializers.DecimalField(max_digits=12, decimal_places=2)
    today_orders = serializers.IntegerField()
    this_week_sales = serializers.DecimalField(max_digits=12, decimal_places=2)
    this_month_sales = serializers.DecimalField(max_digits=12, decimal_places=2)
    pending_orders = serializers.IntegerField()
    completed_orders = serializers.IntegerField()
    cancelled_orders = serializers.IntegerField()
    total_orders = serializers.IntegerField()
    average_order_value = serializers.DecimalField(max_digits=10, decimal_places=2)
    returning_customers = serializers.IntegerField()
    unique_customers = serializers.IntegerField()
    gross_sales = serializers.DecimalField(max_digits=12, decimal_places=2)
    discount_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    refund_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    net_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    printing_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    delivery_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    bulk_order_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)


class SalesSeriesItemSerializer(serializers.Serializer):
    date = serializers.CharField()
    orders = serializers.IntegerField()
    gross_sales = serializers.FloatField()
    discounts = serializers.FloatField()
    refunds = serializers.FloatField()
    net_sales = serializers.FloatField()


class ShopOverviewResponseSerializer(serializers.Serializer):
    shop_id = serializers.IntegerField()
    shop_name = serializers.CharField()
    filters = serializers.DictField()
    kpis = ShopKPISummarySerializer()
    sales_series = serializers.ListField(child=SalesSeriesItemSerializer())
    order_analytics = serializers.DictField()
    top_products = serializers.ListField()
    inventory_health = serializers.DictField()


class StudentAnalyticsSummarySerializer(serializers.Serializer):
    total_orders = serializers.IntegerField()
    active_orders = serializers.IntegerField()
    total_spent = serializers.FloatField()
    total_print_orders = serializers.IntegerField()
    pages_printed = serializers.IntegerField()
    top_categories = serializers.ListField()
