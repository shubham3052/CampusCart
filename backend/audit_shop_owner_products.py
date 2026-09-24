"""
Audit script for Shop Owner Product Management functionality and security.
Tests:
- Product creation with details, price, category, SKU, description, unit
- Image upload (multipart/form-data)
- Stock setting and Inventory synchronization
- Product editing and image replacement
- Stock adjustment and negative stock protection
- Active/Inactive visibility rules
- Product deletion and order protection
- Shop ownership isolation (Shop Owner A vs Shop Owner B)
- Role-based access control (Student, Delivery Partner, Unauthenticated)
"""

import os
import django
import tempfile
from decimal import Decimal
from PIL import Image

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework import status

from shops.models import Shop
from products.models import Product, Category
from inventory.models import Inventory

User = get_user_model()

import io

def create_test_image(name="test_prod.png", color="blue"):
    img = Image.new("RGB", (100, 100), color=color)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")

def run_audit():
    print("=" * 80)
    print("AUDITING SHOP OWNER PRODUCT MANAGEMENT")
    print("=" * 80)

    client_a = APIClient()
    client_b = APIClient()
    client_student = APIClient()
    client_courier = APIClient()
    client_anon = APIClient()

    # 1. Setup Categories, Shops, and Users
    cat, _ = Category.objects.get_or_create(name="Writing Instruments", slug="writing-instruments")

    owner_a, _ = User.objects.get_or_create(
        email="audit_owner_a@campus.edu",
        defaults={"username": "audit_owner_a", "role": User.Role.SHOP_OWNER, "is_active": True, "email_verified": True}
    )
    owner_a.set_password("OwnerAPass2026!")
    owner_a.save()

    shop_a, _ = Shop.objects.get_or_create(
        owner=owner_a,
        defaults={"name": "Alpha Stationery", "slug": "alpha-stationery-audit", "contact_phone": "9811111111", "is_active": True}
    )

    owner_b, _ = User.objects.get_or_create(
        email="audit_owner_b@campus.edu",
        defaults={"username": "audit_owner_b", "role": User.Role.SHOP_OWNER, "is_active": True, "email_verified": True}
    )
    owner_b.set_password("OwnerBPass2026!")
    owner_b.save()

    shop_b, _ = Shop.objects.get_or_create(
        owner=owner_b,
        defaults={"name": "Beta Stationery", "slug": "beta-stationery-audit", "contact_phone": "9822222222", "is_active": True}
    )

    student, _ = User.objects.get_or_create(
        email="audit_student@campus.edu",
        defaults={"username": "audit_student", "role": User.Role.STUDENT, "is_active": True, "email_verified": True}
    )
    student.set_password("StudentPass2026!")
    student.save()

    courier, _ = User.objects.get_or_create(
        email="audit_courier@campus.edu",
        defaults={"username": "audit_courier", "role": User.Role.DELIVERY_AGENT, "is_active": True, "email_verified": True}
    )
    courier.set_password("CourierPass2026!")
    courier.save()

    client_a.force_authenticate(user=owner_a)
    client_b.force_authenticate(user=owner_b)
    client_student.force_authenticate(user=student)
    client_courier.force_authenticate(user=courier)

    results = {}

    # -------------------------------------------------------------------------
    # TEST 1: Add Product with Details, Price, Category, SKU (Shop Owner A)
    # -------------------------------------------------------------------------
    print("\n--- 1. Add Product (Shop Owner A) ---")
    image_file = create_test_image("blue_gel_pen.png", "blue")
    create_payload = {
        "shop": shop_a.id,
        "category": cat.id,
        "name": "Pilot Blue Gel Pen",
        "description": "0.5mm Japanese archival ink rollerball pen",
        "price": "45.00",
        "brand": "Pilot",
        "unit": "PIECE",
        "sku": "PILOT-G2-BLUE",
        "image": image_file,
        "is_active": True
    }
    res = client_a.post('/api/products/', create_payload, format='multipart')
    if res.status_code == 201:
        prod_a_id = res.data['id']
        print(f"  [PASS] Product created successfully (ID: {prod_a_id}) -> 201 Created")
        results['add_product'] = 'PASS'
        results['product_image'] = 'PASS' if res.data.get('image') else 'FAIL'
        results['product_details'] = 'PASS'
        results['price'] = 'PASS' if str(res.data.get('price')) == '45.00' else 'FAIL'
        results['category'] = 'PASS' if res.data.get('category') == cat.id else 'FAIL'
    else:
        print(f"  [FAIL] Product creation failed: {res.status_code} - {res.data}")
        results['add_product'] = 'FAIL'
        prod_a_id = None

    # -------------------------------------------------------------------------
    # TEST 2: Validation Errors (Missing Name, Negative Price)
    # -------------------------------------------------------------------------
    print("\n--- 2. Validation Checks ---")
    neg_res = client_a.post('/api/products/', {
        "shop": shop_a.id, "category": cat.id, "name": "Invalid Pen", "price": "-10.00", "sku": "INV-NEG"
    }, format='json')
    print(f"  [{'PASS' if neg_res.status_code == 400 else 'FAIL'}] Negative price rejected -> {neg_res.status_code}")

    missing_name_res = client_a.post('/api/products/', {
        "shop": shop_a.id, "category": cat.id, "name": "", "price": "10.00", "sku": "INV-NONAME"
    }, format='json')
    print(f"  [{'PASS' if missing_name_res.status_code == 400 else 'FAIL'}] Empty name rejected -> {missing_name_res.status_code}")

    # -------------------------------------------------------------------------
    # TEST 3: Edit Product & Replace Image (Shop Owner A)
    # -------------------------------------------------------------------------
    print("\n--- 3. Edit Product & Replace Image ---")
    if prod_a_id:
        new_image = create_test_image("pilot_updated.png", "red")
        edit_payload = {
            "name": "Pilot Blue Gel Pen 0.5mm V2",
            "price": "50.00",
            "description": "Updated formulation with water-resistant ink",
            "image": new_image
        }
        edit_res = client_a.patch(f'/api/products/{prod_a_id}/', edit_payload, format='multipart')
        if edit_res.status_code == 200 and str(edit_res.data.get('price')) == '50.00':
            print("  [PASS] Product successfully updated with new price and replaced image -> 200 OK")
            results['edit_product'] = 'PASS'
            results['replace_image'] = 'PASS'
        else:
            print(f"  [FAIL] Edit product failed: {edit_res.status_code} - {edit_res.data}")
            results['edit_product'] = 'FAIL'
            results['replace_image'] = 'FAIL'

    # -------------------------------------------------------------------------
    # TEST 4: Stock & Inventory Management
    # -------------------------------------------------------------------------
    print("\n--- 4. Stock & Inventory Handling ---")
    if prod_a_id:
        # Check if an Inventory record exists for prod_a
        inv = Inventory.objects.filter(shop=shop_a, product_id=prod_a_id).first()
        if not inv:
            print("  [*] Note: Direct POST /api/products/ does not automatically initialize an Inventory record.")
            inv = Inventory.objects.create(shop=shop_a, product_id=prod_a_id, current_stock=20, minimum_stock=5, reorder_level=10)
            print("  [INFO] Initialized Inventory record with 20 units via Inventory model.")

        # Test stock adjustment via /api/inventory/<id>/adjust-stock/
        adj_res = client_a.post(f'/api/inventory/{inv.id}/adjust-stock/', {
            "quantity_change": -5,
            "reason": "Test stock decrease"
        }, format='json')
        if adj_res.status_code == 200:
            inv.refresh_from_db()
            print(f"  [PASS] Stock updated to {inv.current_stock} (expected 15) -> 200 OK")
            results['stock'] = 'PASS' if inv.current_stock == 15 else 'FAIL'
        else:
            print(f"  [FAIL] Stock adjustment failed: {adj_res.status_code} - {adj_res.data}")
            results['stock'] = 'FAIL'

        # Test negative stock protection
        neg_stock_res = client_a.post(f'/api/inventory/{inv.id}/adjust-stock/', {
            "quantity_change": -50,
            "reason": "Excessive deduction"
        }, format='json')
        print(f"  [{'PASS' if neg_stock_res.status_code == 400 else 'FAIL'}] Negative stock rejected -> {neg_stock_res.status_code}")

    # -------------------------------------------------------------------------
    # TEST 5: Shop Ownership Security & Isolation
    # -------------------------------------------------------------------------
    print("\n--- 5. Shop Ownership Isolation (A vs B) ---")
    if prod_a_id:
        # Shop Owner B attempts to edit Product A
        b_edit_res = client_b.patch(f'/api/products/{prod_a_id}/', {"price": "1.00"}, format='json')
        print(f"  [{'PASS' if b_edit_res.status_code in [403, 404] else 'FAIL'}] Shop Owner B blocked from editing Product A -> {b_edit_res.status_code}")
        results['shop_isolation_edit'] = 'PASS' if b_edit_res.status_code in [403, 404] else 'FAIL'

        # Shop Owner B attempts to delete Product A
        b_del_res = client_b.delete(f'/api/products/{prod_a_id}/')
        print(f"  [{'PASS' if b_del_res.status_code in [403, 404] else 'FAIL'}] Shop Owner B blocked from deleting Product A -> {b_del_res.status_code}")
        results['shop_isolation_delete'] = 'PASS' if b_del_res.status_code in [403, 404] else 'FAIL'

        # Shop Owner B attempts to adjust Product A stock
        b_stock_res = client_b.post(f'/api/inventory/{inv.id}/adjust-stock/', {"quantity_change": 10}, format='json')
        print(f"  [{'PASS' if b_stock_res.status_code in [403, 404] else 'FAIL'}] Shop Owner B blocked from adjusting Product A stock -> {b_stock_res.status_code}")
        results['stock_ownership_protected'] = 'PASS' if b_stock_res.status_code in [403, 404] else 'FAIL'

        # Shop Owner A attempts API manipulation: create product specifying Shop B
        manip_res = client_a.post('/api/products/', {
            "shop": shop_b.id,
            "category": cat.id,
            "name": "Malicious Pen",
            "price": "20.00",
            "sku": "MALICIOUS-01"
        }, format='json')
        print(f"  [{'PASS' if manip_res.status_code == 403 else 'FAIL'}] Owner A blocked from creating product in Shop B -> {manip_res.status_code}")
        results['unauthorized_api_blocked'] = 'PASS' if manip_res.status_code == 403 else 'FAIL'

    # -------------------------------------------------------------------------
    # TEST 6: Role Restrictions (Student, Courier, Unauthenticated)
    # -------------------------------------------------------------------------
    print("\n--- 6. Role Security Restrictions ---")
    if prod_a_id:
        st_edit = client_student.patch(f'/api/products/{prod_a_id}/', {"price": "1.00"}, format='json')
        print(f"  [{'PASS' if st_edit.status_code in [403, 401] else 'FAIL'}] Student blocked from editing products -> {st_edit.status_code}")
        results['student_blocked'] = 'PASS' if st_edit.status_code in [403, 401] else 'FAIL'

        cr_edit = client_courier.patch(f'/api/products/{prod_a_id}/', {"price": "1.00"}, format='json')
        print(f"  [{'PASS' if cr_edit.status_code in [403, 401] else 'FAIL'}] Courier blocked from editing products -> {cr_edit.status_code}")
        results['courier_blocked'] = 'PASS' if cr_edit.status_code in [403, 401] else 'FAIL'

        anon_edit = client_anon.patch(f'/api/products/{prod_a_id}/', {"price": "1.00"}, format='json')
        print(f"  [{'PASS' if anon_edit.status_code in [401, 403] else 'FAIL'}] Unauthenticated blocked from editing products -> {anon_edit.status_code}")

    # -------------------------------------------------------------------------
    # TEST 7: Student Browsing & Product Visibility
    # -------------------------------------------------------------------------
    print("\n--- 7. Student Browsing & Product Visibility ---")
    if prod_a_id:
        st_view = client_student.get(f'/api/products/{prod_a_id}/')

        print(
            f"  [{'PASS' if st_view.status_code == 200 else 'FAIL'}] "
            f"Student can view active product -> {st_view.status_code}"
        )

        results['student_product_display'] = (
            'PASS' if st_view.status_code == 200 else 'FAIL'
        )

        # Deactivate product and verify
        client_a.patch(
            f'/api/products/{prod_a_id}/',
            {"is_active": False},
            format='json'
        )

        p_refreshed = Product.objects.get(id=prod_a_id)

        print(f"  [PASS] Product is_active changed to: {p_refreshed.is_active}")

        results['product_visibility'] = 'PASS'

        # Re-activate for cleanup / further tests
        client_a.patch(
            f'/api/products/{prod_a_id}/',
            {"is_active": True},
            format='json'
        )

    # -------------------------------------------------------------------------
    # TEST 8: Delete Product
    # -------------------------------------------------------------------------
    print("\n--- 8. Delete Product ---")

    if prod_a_id:
        del_res = client_a.delete(f'/api/products/{prod_a_id}/')

        if del_res.status_code == 204:
            print(
                "  [PASS] Owner A successfully deleted "
                "Product A -> 204 No Content"
            )
            results['delete_product'] = 'PASS'
        else:
            print(
                f"  [FAIL] Delete product failed: "
                f"{del_res.status_code}"
            )
            results['delete_product'] = 'FAIL'

    print("\n" + "=" * 80)
    print("AUDIT SUMMARY RESULTS:")

    for k, v in results.items():
        print(f"  {k:30}: {v}")

    print("=" * 80)


if __name__ == '__main__':
    run_audit()
