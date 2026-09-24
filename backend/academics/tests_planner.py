import json
from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from academics.models import (
    Institution,
    AcademicCalendar,
    StudentAcademicProfile,
    StudentNote,
    StudentTask,
    StudentChecklist,
    StudentChecklistItem,
)
from academics.services.planner_service import SmartPlannerService
from products.models import Category, Product, ShoppingList, ShoppingListItem
from shops.models import Shop
from inventory.models import Inventory
from notifications.models import Notification

User = get_user_model()


class SmartPlannerComprehensiveTests(TestCase):
    """
    Exhaustive test suite for Step 21: Smart Notes, To-Do & Shopping Planner.
    Verifies privacy, authoritative deadline calculations, smart suggestions,
    shopping list management, cart validation, checklists, and notifications.
    """

    def setUp(self):
        self.client = APIClient()

        # Users
        self.student1 = User.objects.create_user(
            username='student_alice',
            email='alice@campus.edu',
            password='Password123!',
            role='STUDENT'
        )
        self.student2 = User.objects.create_user(
            username='student_bob',
            email='bob@campus.edu',
            password='Password123!',
            role='STUDENT'
        )
        self.admin = User.objects.create_user(
            username='admin_staff',
            email='admin@campus.edu',
            password='Password123!',
            role='ADMIN'
        )
        self.shopkeeper = User.objects.create_user(
            username='merchant_dave',
            email='dave@campus.edu',
            password='Password123!',
            role='SHOP_OWNER'
        )

        # Institution & Profiles
        self.institution = Institution.objects.create(
            name="Apex Institute of Technology",
            code="APEX-01",
            city="Pune"
        )
        self.other_inst = Institution.objects.create(
            name="Metro University",
            code="METRO-02",
            city="Mumbai"
        )

        self.profile1 = StudentAcademicProfile.objects.create(
            student=self.student1,
            institution=self.institution,
            course="BCA",
            semester_number=6
        )

        # Shop & Products
        self.shop = Shop.objects.create(
            name="Apex Campus Store",
            owner=self.shopkeeper,
            institution=self.institution,
            is_active=True
        )

        self.cat_files = Category.objects.create(name="Project Files & Folders", slug="project-files")
        self.cat_paper = Category.objects.create(name="Paper & Reams", slug="paper-reams")
        self.cat_pens = Category.objects.create(name="Writing Instruments", slug="writing-instruments")

        self.prod_file = Product.objects.create(
            shop=self.shop,
            category=self.cat_files,
            name="Deluxe Project File",
            sku="SKU-DELUXE-FILE",
            price=Decimal("45.00"),
            is_active=True
        )
        Inventory.objects.create(
            shop=self.shop,
            product=self.prod_file,
            current_stock=50,
            reserved_stock=0,
            is_active=True
        )

        self.prod_a4 = Product.objects.create(
            shop=self.shop,
            category=self.cat_paper,
            name="A4 75GSM Copier Paper 100 Sheets",
            sku="SKU-A4-PAPER",
            price=Decimal("80.00"),
            is_active=True
        )
        Inventory.objects.create(
            shop=self.shop,
            product=self.prod_a4,
            current_stock=25,
            reserved_stock=0,
            is_active=True
        )

        self.prod_pen = Product.objects.create(
            shop=self.shop,
            category=self.cat_pens,
            name="Blue Ballpoint Pen Pack of 5",
            sku="SKU-BALL-PEN",
            price=Decimal("50.00"),
            is_active=True
        )
        Inventory.objects.create(
            shop=self.shop,
            product=self.prod_pen,
            current_stock=100,
            reserved_stock=0,
            is_active=True
        )

        self.prod_out_of_stock = Product.objects.create(
            shop=self.shop,
            category=self.cat_pens,
            name="Engineering Drawing Compass",
            sku="SKU-DRAW-COMPASS",
            price=Decimal("120.00"),
            is_active=True
        )
        Inventory.objects.create(
            shop=self.shop,
            product=self.prod_out_of_stock,
            current_stock=0,
            reserved_stock=0,
            is_active=True
        )

        # Academic Calendar Event: Project Submission in 5 days
        self.today = timezone.now().date()
        self.event_project = AcademicCalendar.objects.create(
            institution=self.institution,
            title="Final DBMS Project Submission",
            event_type=AcademicCalendar.EventType.PROJECT_SUBMISSION,
            importance=AcademicCalendar.Importance.CRITICAL,
            start_date=self.today + timedelta(days=5),
            end_date=self.today + timedelta(days=5),
            course="BCA"
        )

    # =========================================================================
    # 1. NOTES: CRUD, Pin, Archive, and Isolation
    # =========================================================================
    def test_note_crud_and_privacy_isolation(self):
        self.client.force_authenticate(user=self.student1)

        # 1. Create Note
        res = self.client.post('/api/notes/', {
            "title": "DBMS Normalization Cheat Sheet",
            "subject": "DBMS",
            "content": "1NF: Atomic, 2NF: No partial dependency, 3NF: No transitive dependency",
            "category": "STUDY",
            "color": "#fef3c7"
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        note_id = res.data['id']
        self.assertEqual(res.data['category'], "STUDY")
        self.assertEqual(res.data['color'], "#fef3c7")
        self.assertFalse(res.data['is_pinned'])

        # 2. Pin Note
        pin_res = self.client.post(f'/api/notes/{note_id}/pin/')
        self.assertEqual(pin_res.status_code, status.HTTP_200_OK)
        self.assertTrue(pin_res.data['note']['is_pinned'])

        # 3. Archive Note
        arch_res = self.client.post(f'/api/notes/{note_id}/archive/')
        self.assertEqual(arch_res.status_code, status.HTTP_200_OK)
        self.assertTrue(arch_res.data['note']['is_archived'])

        # List notes: default excludes archived notes
        list_res = self.client.get('/api/notes/')
        self.assertEqual(len(list_res.data), 0)

        # List with archived flag
        list_arch_res = self.client.get('/api/notes/?is_archived=true')
        self.assertEqual(len(list_arch_res.data), 1)

        # Unarchive note
        unarch_res = self.client.post(f'/api/notes/{note_id}/unarchive/')
        self.assertEqual(unarch_res.status_code, status.HTTP_200_OK)
        self.assertFalse(unarch_res.data['note']['is_archived'])

        # 4. Security Check: student2 cannot access or edit student1's note
        self.client.force_authenticate(user=self.student2)
        hacked_res = self.client.get(f'/api/notes/{note_id}/')
        self.assertEqual(hacked_res.status_code, status.HTTP_404_NOT_FOUND)

        edit_hacked = self.client.patch(f'/api/notes/{note_id}/', {"title": "Hacked Title"})
        self.assertEqual(edit_hacked.status_code, status.HTTP_404_NOT_FOUND)

    # =========================================================================
    # 2. TASKS: CRUD, Priority URGENT, Due Status, Authoritative Deadlines
    # =========================================================================
    def test_task_crud_and_authoritative_deadlines(self):
        self.client.force_authenticate(user=self.student1)

        # 1. Create task with URGENT priority and due date 5 days away
        due_5d = self.today + timedelta(days=5)
        res = self.client.post('/api/tasks/', {
            "title": "Submit DBMS Project",
            "description": "Complete ER diagram, normalization report and code documentation.",
            "category": "PROJECT",
            "priority": "URGENT",
            "due_date": str(due_5d),
            "academic_event": self.event_project.id
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        task_id = res.data['id']
        self.assertEqual(res.data['priority'], "URGENT")
        self.assertEqual(res.data['due_status'], "UPCOMING")
        self.assertEqual(res.data['days_remaining'], 5)
        self.assertFalse(res.data['is_overdue'])
        self.assertEqual(res.data['academic_event_title'], "Final DBMS Project Submission")

        # 2. Task due today
        task_today = StudentTask.objects.create(
            student=self.student1,
            title="Print lab assignment",
            due_date=self.today,
            priority="HIGH"
        )
        self.assertEqual(task_today.due_status, "DUE_TODAY")
        self.assertEqual(task_today.days_remaining, 0)
        self.assertFalse(task_today.is_overdue)

        # 3. Overdue task
        task_overdue = StudentTask.objects.create(
            student=self.student1,
            title="Submit tutorial 2",
            due_date=self.today - timedelta(days=2),
            priority="MEDIUM"
        )
        self.assertEqual(task_overdue.due_status, "OVERDUE")
        self.assertEqual(task_overdue.days_remaining, -2)
        self.assertTrue(task_overdue.is_overdue)

        # 4. Filter tasks by due_status='OVERDUE'
        overdue_filter = self.client.get('/api/tasks/?due_status=OVERDUE')
        self.assertEqual(len(overdue_filter.data), 1)
        self.assertEqual(overdue_filter.data[0]['id'], task_overdue.id)

        # 5. Toggle Complete action
        toggle_res = self.client.post(f'/api/tasks/{task_id}/toggle-complete/')
        self.assertEqual(toggle_res.status_code, status.HTTP_200_OK)
        self.assertTrue(toggle_res.data['task']['completed'])
        self.assertEqual(toggle_res.data['task']['status'], "COMPLETED")
        self.assertEqual(toggle_res.data['task']['due_status'], "COMPLETED")
        self.assertIsNotNone(toggle_res.data['task']['completed_at'])

        # Toggle back to incomplete
        toggle_back = self.client.post(f'/api/tasks/{task_id}/toggle-complete/')
        self.assertFalse(toggle_back.data['task']['completed'])
        self.assertEqual(toggle_back.data['task']['status'], "TODO")
        self.assertIsNone(toggle_back.data['task']['completed_at'])

        # 6. Cross-user isolation: student2 cannot toggle student1's task
        self.client.force_authenticate(user=self.student2)
        cross_res = self.client.post(f'/api/tasks/{task_id}/toggle-complete/')
        self.assertEqual(cross_res.status_code, status.HTTP_404_NOT_FOUND)

    # =========================================================================
    # 3. TASK VALIDATION & INSTITUTION CONSTRAINTS
    # =========================================================================
    def test_task_institution_validation(self):
        self.client.force_authenticate(user=self.student1)

        # Create private event for other institution
        other_event = AcademicCalendar.objects.create(
            institution=self.other_inst,
            title="Metro Law Fest",
            event_type="COLLEGE_EVENT",
            start_date=self.today + timedelta(days=10),
            end_date=self.today + timedelta(days=12)
        )

        # Student1 belongs to APEX-01; attempting to attach METRO-02 private event
        res = self.client.post('/api/tasks/', {
            "title": "Participate in foreign fest",
            "academic_event": other_event.id
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("academic_event", str(res.data))

    # =========================================================================
    # 4. SMART SUGGESTIONS: TASK TO SHOPPING & PRINTING
    # =========================================================================
    def test_task_to_shopping_and_printing_suggestions(self):
        self.client.force_authenticate(user=self.student1)

        # Create Task "Submit DBMS Project"
        task = StudentTask.objects.create(
            student=self.student1,
            title="Submit DBMS Project Report",
            category="PROJECT",
            priority="URGENT",
            due_date=self.today + timedelta(days=5),
            academic_event=self.event_project
        )

        # Request suggestions for this task
        res = self.client.get(f'/api/planner/suggestions/?task_id={task.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        suggestions = res.data['suggestions']
        self.assertGreater(len(suggestions), 0)

        # Verify both products (Project File, A4) and services (Printing, Binding) appear
        types = [s['type'] for s in suggestions]
        self.assertIn('PRODUCT', types)
        self.assertIn('SERVICE', types)

        prod_names = [s['name'] for s in suggestions]
        self.assertTrue(any("Project File" in name for name in prod_names))
        self.assertTrue(any("Printing" in name for name in prod_names))

        # Check action types
        actions = [s['action_type'] for s in suggestions]
        self.assertIn('ADD_TO_CART', actions)
        self.assertIn('START_PRINTING', actions)

    # =========================================================================
    # 5. AUTOMATIC ACADEMIC TASK SUGGESTIONS
    # =========================================================================
    def test_academic_task_suggestions_generation(self):
        self.client.force_authenticate(user=self.student1)

        res = self.client.get('/api/planner/academic-task-suggestions/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        suggs = res.data['suggested_tasks']
        self.assertGreater(len(suggs), 0)

        # Project submission event in 5 days should suggest report & printing tasks
        titles = [s['title'] for s in suggs]
        self.assertTrue(any("project report draft" in t.lower() for t in titles))
        self.assertTrue(any("spiral or hardcover binding" in t.lower() for t in titles))

        # Test batch creation endpoint [Add Suggested Tasks]
        create_res = self.client.post('/api/planner/create-suggested-tasks/', {
            "tasks": [suggs[0], suggs[1]]
        }, format='json')
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(create_res.data['created_tasks']), 2)

    # =========================================================================
    # 6. SHOPPING LIST: CUSTOM ITEMS, ACTIONS & CART INTEGRATION
    # =========================================================================
    def test_shopping_list_and_add_to_cart_validation(self):
        self.client.force_authenticate(user=self.student1)

        # Create shopping list
        s_list = ShoppingList.objects.create(user=self.student1, name="DBMS Project Shopping List")

        # 1. Add catalog product
        res1 = self.client.post(f'/api/shopping-lists/{s_list.id}/add-item/', {
            "product_id": self.prod_file.id,
            "quantity": 2,
            "priority": "HIGH"
        })
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res1.data['data']['item_name'], "Deluxe Project File")

        # 2. Add generic/custom item without product (e.g. Spiral Binding service)
        res2 = self.client.post(f'/api/shopping-lists/{s_list.id}/add-item/', {
            "custom_item_name": "Hardcover Black & Gold Embossed Binding",
            "quantity": 1,
            "priority": "URGENT",
            "service_type": "BINDING",
            "estimated_price": "150.00"
        })
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res2.data['data']['item_name'], "Hardcover Black & Gold Embossed Binding")
        self.assertIsNone(res2.data['data']['product'])

        # 3. Add out-of-stock product
        self.client.post(f'/api/shopping-lists/{s_list.id}/add-item/', {
            "product_id": self.prod_out_of_stock.id,
            "quantity": 1
        })

        # 4. Add All Available to Cart via backend validation
        cart_res = self.client.post(f'/api/shopping-lists/{s_list.id}/add-to-cart/')
        self.assertEqual(cart_res.status_code, status.HTTP_200_OK)
        cart_data = cart_res.data

        # Available product validated
        self.assertEqual(len(cart_data['valid_items']), 1)
        self.assertEqual(cart_data['valid_items'][0]['productName'], "Deluxe Project File")
        self.assertEqual(cart_data['valid_items'][0]['price'], 45.0)

        # Out-of-stock product and generic service correctly reported in unavailable list
        self.assertEqual(len(cart_data['unavailable_items']), 2)
        unavail_reasons = [u['reason'] for u in cart_data['unavailable_items']]
        self.assertTrue(any("out of stock" in r.lower() for r in unavail_reasons))

    # =========================================================================
    # 7. CHECKLISTS: SEMESTER TEMPLATES & CUSTOM CHECKLISTS
    # =========================================================================
    def test_semester_and_custom_checklists(self):
        self.client.force_authenticate(user=self.student1)

        # 1. Fetch templates
        tpl_res = self.client.get('/api/checklists/templates/')
        self.assertEqual(tpl_res.status_code, status.HTTP_200_OK)
        self.assertGreater(len(tpl_res.data['templates']), 0)
        sem_tpl = tpl_res.data['templates'][0]

        # 2. Instantiate template
        inst_res = self.client.post('/api/checklists/create-from-template/', {
            "template_id": sem_tpl['id']
        })
        self.assertEqual(inst_res.status_code, status.HTTP_201_CREATED)
        checklist_id = inst_res.data['checklist']['id']
        self.assertEqual(inst_res.data['checklist']['total_items'], len(sem_tpl['items']))
        self.assertEqual(inst_res.data['checklist']['progress_percentage'], 0.0)

        first_item_id = inst_res.data['checklist']['items'][0]['id']

        # 3. Check off an item
        toggle_res = self.client.post(f'/api/checklists/{checklist_id}/toggle-item/', {
            "item_id": first_item_id,
            "is_completed": True
        })
        self.assertEqual(toggle_res.status_code, status.HTTP_200_OK)
        self.assertTrue(toggle_res.data['item']['is_completed'])
        self.assertGreater(toggle_res.data['checklist_progress'], 0)

    # =========================================================================
    # 8. NOTIFICATIONS & DUPLICATE PREVENTION
    # =========================================================================
    def test_deadline_reminders_and_deduplication(self):
        # Create incomplete task due today
        StudentTask.objects.create(
            student=self.student1,
            title="Submit DBMS Mini Project Code",
            due_date=self.today,
            priority="URGENT"
        )

        # First run: should dispatch 1 notification
        stats1 = SmartPlannerService.dispatch_task_deadline_reminders(dry_run=False)
        self.assertGreaterEqual(stats1['reminders_sent'], 1)
        self.assertEqual(stats1['skipped_duplicates'], 0)

        # Verify notification created in DB
        notif = Notification.objects.filter(recipient=self.student1, notification_type=Notification.NotificationType.TASK_REMINDER).first()
        self.assertIsNotNone(notif)
        self.assertIn("Due Today", notif.title)

        # Second run on same day: MUST skip as duplicate!
        stats2 = SmartPlannerService.dispatch_task_deadline_reminders(dry_run=False)
        self.assertEqual(stats2['reminders_sent'], 0)
        self.assertGreaterEqual(stats2['skipped_duplicates'], 1)

    # =========================================================================
    # 9. ADMIN & SHOPKEEPER AGGREGATE ANALYTICS
    # =========================================================================
    def test_admin_and_shopkeeper_aggregate_analytics(self):
        # Admin analytics
        self.client.force_authenticate(user=self.admin)
        admin_res = self.client.get('/api/planner/admin-stats/')
        self.assertEqual(admin_res.status_code, status.HTTP_200_OK)
        self.assertTrue(admin_res.data['success'])
        self.assertIn('tasks', admin_res.data)
        self.assertIn('shopping_lists', admin_res.data)
        self.assertIn('privacy_safeguard', admin_res.data)

        # Student cannot access admin stats
        self.client.force_authenticate(user=self.student1)
        denied_res = self.client.get('/api/planner/admin-stats/')
        self.assertEqual(denied_res.status_code, status.HTTP_403_FORBIDDEN)

        # Shopkeeper demand insights
        self.client.force_authenticate(user=self.shopkeeper)
        shop_res = self.client.get('/api/planner/shopkeeper-insights/')
        self.assertEqual(shop_res.status_code, status.HTTP_200_OK)
        self.assertTrue(shop_res.data['success'])
        self.assertIn('upcoming_demand_indicators', shop_res.data)
