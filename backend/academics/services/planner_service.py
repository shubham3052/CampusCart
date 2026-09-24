from datetime import date, timedelta, time
from typing import List, Dict, Any, Optional
from decimal import Decimal
import re

from django.db.models import Q, Count, Sum
from django.utils import timezone
from django.contrib.auth import get_user_model

from academics.models import (
    AcademicCalendar,
    AcademicEventImpact,
    StudentAcademicProfile,
    StudentNote,
    StudentTask,
    StudentChecklist,
    StudentChecklistItem,
)
from academics.event_intelligence import (
    get_relevant_events_for_student,
    calculate_event_proximity,
    calculate_event_intensity,
)
from products.models import Product, Category, ShoppingList, ShoppingListItem
from shops.models import Shop
from inventory.models import Inventory
from notifications.models import Notification
from recommendations.services.general_recommender import get_buy_again_recommendations
from recommendations.services.academic_recommender import get_academic_recommendations
from recommendations.utils.filters import filter_available_products

User = get_user_model()


class SmartPlannerService:
    """
    Central orchestration service for the Student Smart Planner.
    Connects personal notes, to-do tasks, authoritative deadlines, academic calendars,
    Step 20 recommendation engine, Step 19 event impacts, shopping lists, and print jobs.
    """

    @classmethod
    def get_planner_summary(cls, user) -> Dict[str, Any]:
        """
        Assembles comprehensive student planner overview metrics, active tasks,
        approaching deadlines, smart recommendations, buy-again supplies, and real progress rates.
        """
        if not user or not user.is_authenticated:
            return {
                "success": False,
                "message": "User not authenticated"
            }

        today = timezone.now().date()

        # 1. Tasks breakdown
        user_tasks = StudentTask.objects.filter(student=user)
        total_tasks = user_tasks.count()
        completed_tasks = user_tasks.filter(status=StudentTask.Status.COMPLETED).count()
        
        # Categorize by authoritative date status
        tasks_list = list(user_tasks.select_related('academic_event').order_by('completed', 'due_date', 'deadline', 'priority'))
        
        today_tasks = []
        upcoming_tasks = []
        overdue_tasks = []
        
        for task in tasks_list:
            if task.status in [StudentTask.Status.COMPLETED, StudentTask.Status.CANCELLED]:
                continue
            due_st = task.due_status
            task_dict = {
                "id": task.id,
                "title": task.title,
                "description": task.description,
                "category": task.category,
                "priority": task.priority,
                "status": task.status,
                "due_date": str(task.due_date) if task.due_date else None,
                "due_time": task.due_time.strftime("%H:%M") if task.due_time else None,
                "deadline": task.deadline.isoformat() if task.deadline else None,
                "days_remaining": task.days_remaining,
                "hours_remaining": task.hours_remaining,
                "is_overdue": task.is_overdue,
                "due_status": due_st,
                "academic_event": {
                    "id": task.academic_event.id,
                    "title": task.academic_event.title,
                    "event_type": task.academic_event.event_type
                } if task.academic_event else None,
                "created_at": task.created_at.isoformat(),
            }
            if due_st == 'DUE_TODAY':
                today_tasks.append(task_dict)
            elif due_st == 'OVERDUE':
                overdue_tasks.append(task_dict)
            else:
                upcoming_tasks.append(task_dict)

        # 2. Progress Tracking Calculations
        task_progress = round((completed_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0

        # Shopping lists progress
        user_lists = ShoppingList.objects.filter(user=user).prefetch_related('items')
        total_shopping_items = sum(s_list.items.count() for s_list in user_lists)
        checked_shopping_items = sum(s_list.items.filter(is_checked=True).count() for s_list in user_lists)
        shopping_progress = round((checked_shopping_items / total_shopping_items * 100), 1) if total_shopping_items > 0 else 0

        # Checklists progress
        user_checklists = StudentChecklist.objects.filter(student=user).prefetch_related('items')
        total_check_items = sum(c.total_items for c in user_checklists)
        completed_check_items = sum(c.completed_items for c in user_checklists)
        checklist_progress = round((completed_check_items / total_check_items * 100), 1) if total_check_items > 0 else 0

        # Overall academic preparation metric (unbiased real calculation)
        active_weights = []
        if total_tasks > 0:
            active_weights.append(task_progress)
        if total_check_items > 0:
            active_weights.append(checklist_progress)
        if total_shopping_items > 0:
            active_weights.append(shopping_progress)
        
        overall_readiness = round(sum(active_weights) / len(active_weights), 1) if active_weights else 100.0 if completed_tasks > 0 else 0.0

        # 3. Relevant Academic Events
        events_raw = get_relevant_events_for_student(user, days=30)
        academic_events = []
        for ev in events_raw[:4]:
            prox = calculate_event_proximity(ev)
            academic_events.append({
                "id": ev.id,
                "title": ev.title,
                "event_type": ev.event_type,
                "event_type_display": ev.get_event_type_display(),
                "importance": ev.importance,
                "start_date": str(ev.start_date),
                "end_date": str(ev.end_date),
                "days_until": prox["days_until"],
                "days_remaining": prox["days_remaining"],
                "is_active": prox["is_active"],
            })

        # 4. Smart Stationery & Printing Suggestions ("What You May Need")
        smart_suggestions = cls.get_task_shopping_suggestions(user)

        # 5. Buy Again (Step 20 repeat purchase supplies)
        buy_again_items = get_buy_again_recommendations(user, limit=4)

        # 6. Automatic Academic Task Suggestions
        suggested_tasks = cls.get_academic_task_suggestions(user)

        return {
            "success": True,
            "counts": {
                "today": len(today_tasks),
                "upcoming": len(upcoming_tasks),
                "overdue": len(overdue_tasks),
                "completed": completed_tasks,
                "total": total_tasks,
            },
            "progress": {
                "tasks_completed": completed_tasks,
                "tasks_total": total_tasks,
                "task_progress_pct": task_progress,
                "shopping_checked": checked_shopping_items,
                "shopping_total": total_shopping_items,
                "shopping_progress_pct": shopping_progress,
                "checklist_completed": completed_check_items,
                "checklist_total": total_check_items,
                "checklist_progress_pct": checklist_progress,
                "overall_academic_readiness_pct": overall_readiness,
            },
            "tasks": {
                "today": today_tasks,
                "upcoming": upcoming_tasks,
                "overdue": overdue_tasks,
            },
            "academic_events": academic_events,
            "smart_suggestions": smart_suggestions,
            "buy_again": buy_again_items,
            "suggested_tasks": suggested_tasks,
        }

    @classmethod
    def get_academic_task_suggestions(cls, user) -> List[Dict[str, Any]]:
        """
        Generates optional, non-intrusive suggested tasks derived from upcoming academic events.
        Requires explicit user confirmation before creation.
        """
        if not user or not user.is_authenticated:
            return []

        events = get_relevant_events_for_student(user, days=21)
        if not events:
            return []

        # Existing task titles for deduplication
        existing_task_titles = set(
            StudentTask.objects.filter(student=user).values_list('title', flat=True)
        )

        template_rules = {
            AcademicCalendar.EventType.PROJECT_SUBMISSION: [
                ("Complete project report draft", "PROJECT", StudentTask.Priority.HIGH, 3),
                ("Print project documentation", "PROJECT", StudentTask.Priority.HIGH, 2),
                ("Purchase project file & index sheets", "SHOPPING", StudentTask.Priority.MEDIUM, 2),
                ("Get spiral or hardcover binding", "PROJECT", StudentTask.Priority.URGENT, 1),
            ],
            AcademicCalendar.EventType.PROJECT_PRESENTATION: [
                ("Prepare presentation slides", "PROJECT", StudentTask.Priority.HIGH, 2),
                ("Print presentation handouts", "PROJECT", StudentTask.Priority.MEDIUM, 1),
                ("Rehearse project demo & viva answers", "STUDY", StudentTask.Priority.HIGH, 1),
            ],
            AcademicCalendar.EventType.FINAL_EXAM: [
                ("Prepare revision summary notes", "STUDY", StudentTask.Priority.HIGH, 5),
                ("Stock up on exam blue/black pens & pencils", "SHOPPING", StudentTask.Priority.MEDIUM, 4),
                ("Collect rough calculation sheets", "SHOPPING", StudentTask.Priority.LOW, 3),
                ("Print exam admit card & syllabus", "STUDY", StudentTask.Priority.HIGH, 2),
            ],
            AcademicCalendar.EventType.INTERNAL_EXAM: [
                ("Review internal assessment chapters", "STUDY", StudentTask.Priority.HIGH, 3),
                ("Restock pens & highlighters", "SHOPPING", StudentTask.Priority.LOW, 2),
                ("Solve previous test questions", "STUDY", StudentTask.Priority.MEDIUM, 1),
            ],
            AcademicCalendar.EventType.ASSIGNMENT: [
                ("Complete assignment questions", "ASSIGNMENT", StudentTask.Priority.HIGH, 2),
                ("Print assignment response sheets", "ASSIGNMENT", StudentTask.Priority.MEDIUM, 1),
                ("Submit assignment in folder", "ASSIGNMENT", StudentTask.Priority.HIGH, 0),
            ],
            AcademicCalendar.EventType.LAB_SUBMISSION: [
                ("Complete lab record calculations & diagrams", "LAB", StudentTask.Priority.HIGH, 2),
                ("Purchase lab record book / graph sheets", "SHOPPING", StudentTask.Priority.MEDIUM, 2),
                ("Get faculty verification signature", "LAB", StudentTask.Priority.URGENT, 1),
            ],
            AcademicCalendar.EventType.PRACTICAL: [
                ("Review experiment procedures & formulas", "PRACTICAL", StudentTask.Priority.HIGH, 2),
                ("Carry approved lab coat & practical kit", "PRACTICAL", StudentTask.Priority.HIGH, 1),
            ],
            AcademicCalendar.EventType.SEMESTER_START: [
                ("Procure semester notebooks & registers", "SHOPPING", StudentTask.Priority.MEDIUM, 3),
                ("Download semester course outline & timetable", "STUDY", StudentTask.Priority.LOW, 2),
                ("Organize study desk & stationery essentials", "STUDY", StudentTask.Priority.LOW, 1),
            ],
        }

        suggestions = []
        for ev in events:
            rules = template_rules.get(ev.event_type, [])
            for title_template, cat, prio, days_offset in rules:
                full_title = f"{title_template} ({ev.title})"
                # Skip if already exists
                if full_title in existing_task_titles:
                    continue

                suggested_due = max(timezone.now().date(), ev.start_date - timedelta(days=days_offset))
                suggestions.append({
                    "id": f"sug_ev_{ev.id}_{prio}_{days_offset}",
                    "title": full_title,
                    "category": cat,
                    "priority": prio,
                    "due_date": str(suggested_due),
                    "academic_event_id": ev.id,
                    "academic_event_title": ev.title,
                    "reason": f"Suggested for {ev.title} ({ev.get_event_type_display()}) starting {ev.start_date}",
                })

        return suggestions[:8]

    @classmethod
    def get_task_shopping_suggestions(cls, user, task_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Generates smart shopping and printing suggestions based on student tasks and academic milestones.
        Employs Step 19 impacts, Step 20 recommendation scoring, real catalogue products, and shop stock.
        """
        if not user or not user.is_authenticated:
            return []

        # 1. Identify target tasks
        target_tasks = []
        if task_id:
            specific_task = StudentTask.objects.filter(student=user, id=task_id).select_related('academic_event').first()
            if specific_task:
                target_tasks = [specific_task]
        else:
            # Active and upcoming incomplete tasks
            target_tasks = list(
                StudentTask.objects.filter(
                    student=user,
                    status__in=[StudentTask.Status.TODO, StudentTask.Status.IN_PROGRESS]
                ).select_related('academic_event').order_by('due_date', 'priority')[:5]
            )

        # 2. Determine student collegiate context
        student_profile = StudentAcademicProfile.objects.filter(student=user).select_related('institution').first()
        inst = student_profile.institution if student_profile else None

        needed_category_names = set()
        needed_product_ids = set()
        needed_services = set()
        context_reasons = {}

        # Heuristic keywords for semantic task matching
        project_pattern = re.compile(r'(project|report|synopsis|thesis|documentation|presentation|submission)', re.IGNORECASE)
        exam_pattern = re.compile(r'(exam|midterm|internal|final|quiz|test|assessment)', re.IGNORECASE)
        lab_pattern = re.compile(r'(lab|record|journal|practical|experiment|graph)', re.IGNORECASE)
        assignment_pattern = re.compile(r'(assignment|homework|tutorial|sheet)', re.IGNORECASE)
        notes_pattern = re.compile(r'(notes|revision|semester|study|book)', re.IGNORECASE)

        # Scan tasks
        for task in target_tasks:
            task_text = f"{task.title} {task.description or ''}"
            reason_suffix = f"for '{task.title}'"
            if task.days_remaining is not None and task.days_remaining >= 0:
                reason_suffix += f" in {task.days_remaining} day{'s' if task.days_remaining != 1 else ''}"

            # Step 19 Event Impacts if event linked
            if task.academic_event:
                ev = task.academic_event
                impacts = AcademicEventImpact.objects.filter(
                    Q(event=ev) | Q(event__isnull=True, event_type=ev.event_type),
                    is_active=True
                ).select_related('category', 'product')
                
                for imp in impacts:
                    if imp.product_id:
                        needed_product_ids.add(imp.product_id)
                        context_reasons[f"prod_{imp.product_id}"] = f"Recommended by academic schedule for {ev.title}"
                    if imp.category_id:
                        needed_category_names.add(imp.category.name.lower())
                        context_reasons[f"cat_{imp.category.name.lower()}"] = f"Common requirement for {ev.title}"
                    if imp.service_type:
                        needed_services.add(imp.service_type)
                        context_reasons[f"srv_{imp.service_type}"] = f"Essential service for {ev.title}"

            # Keyword matching
            if project_pattern.search(task_text) or task.category == 'PROJECT':
                needed_category_names.update(['files', 'folders', 'paper', 'a4', 'sheet'])
                needed_services.add('PRINTING')
                needed_services.add('BINDING')
                context_reasons['cat_files'] = f"Commonly required {reason_suffix}"
                context_reasons['srv_PRINTING'] = f"Required for documentation {reason_suffix}"
                context_reasons['srv_BINDING'] = f"Report binding required {reason_suffix}"

            if exam_pattern.search(task_text) or task.category == 'EXAM':
                needed_category_names.update(['pens', 'pencils', 'erasers', 'exam', 'paper'])
                context_reasons['cat_pens'] = f"Essential writing supplies {reason_suffix}"

            if lab_pattern.search(task_text) or task.category in ['LAB', 'PRACTICAL']:
                needed_category_names.update(['record', 'journal', 'notebooks', 'pens'])
                needed_services.add('PRINTING')
                context_reasons['cat_record'] = f"Required {reason_suffix}"

            if assignment_pattern.search(task_text) or task.category == 'ASSIGNMENT':
                needed_category_names.update(['files', 'paper', 'pens'])
                needed_services.add('PRINTING')
                context_reasons['cat_files'] = f"Assignment submission {reason_suffix}"

            if notes_pattern.search(task_text) or task.category == 'STUDY':
                needed_category_names.update(['notebooks', 'registers', 'pens', 'highlighters'])
                context_reasons['cat_notebooks'] = f"Recommended {reason_suffix}"

        # If no tasks match, fallback to Step 20 academic recommendations
        if not needed_category_names and not needed_services and not needed_product_ids:
            academic_rec = get_academic_recommendations(user, limit=4)
            for prod in academic_rec.get('products', []):
                needed_product_ids.add(prod['id'])
                context_reasons[f"prod_{prod['id']}"] = prod.get('recommendation_reason', 'Academic seasonal recommendation')
            for srv in academic_rec.get('services', []):
                needed_services.add(srv.get('service_type', 'PRINTING'))
                context_reasons[f"srv_{srv.get('service_type', 'PRINTING')}"] = srv.get('reason', 'Campus printing service')

        # 3. Query Real Catalog Products
        matching_products_qs = Product.objects.none()
        
        if needed_product_ids:
            matching_products_qs |= Product.objects.filter(id__in=needed_product_ids, is_active=True)
        
        if needed_category_names:
            regex_str = '|'.join(needed_category_names)
            matching_products_qs |= Product.objects.filter(
                Q(name__iregex=regex_str) | Q(category__name__iregex=regex_str) | Q(description__iregex=regex_str),
                is_active=True
            )

        # Filter by student institution affiliated shop if applicable
        if inst:
            inst_products = matching_products_qs.filter(shop__institution=inst)
            if inst_products.exists():
                matching_products_qs = inst_products

        available_products = list(
            filter_available_products(matching_products_qs)
            .select_related('shop', 'category')
            .order_by('price')[:6]
        )

        suggestions = []
        seen_items = set()

        # Build product suggestions
        for prod in available_products:
            if prod.id in seen_items:
                continue
            seen_items.add(prod.id)

            reason = context_reasons.get(f"prod_{prod.id}") or context_reasons.get(f"cat_{prod.category.name.lower() if prod.category else ''}") or f"Recommended supply for your upcoming academic tasks"
            
            inv = Inventory.objects.filter(product=prod, shop=prod.shop, is_active=True).first()
            prod_stock = (inv.current_stock - inv.reserved_stock) if inv else 50

            suggestions.append({
                "id": f"prod_{prod.id}",
                "product_id": prod.id,
                "name": prod.name,
                "type": "PRODUCT",
                "category_name": prod.category.name if prod.category else "Stationery",
                "shop_id": prod.shop_id,
                "shop_name": prod.shop.name if prod.shop else "Campus Merchant",
                "price": float(prod.price),
                "stock": prod_stock,
                "reason": reason,
                "recommendation_score": 0.92,
                "source": "TASK",
                "action_type": "ADD_TO_CART",
            })

        # Build service suggestions (Printing & Binding)
        for srv in needed_services:
            srv_key = f"srv_{srv}"
            reason = context_reasons.get(srv_key, f"Recommended campus service for project submission")
            display_title = "Document Printing Service" if srv == 'PRINTING' else ("Spiral / Hard Binding" if srv == 'BINDING' else "Campus Xerox Service")
            
            suggestions.append({
                "id": f"service_{srv.lower()}",
                "product_id": None,
                "name": display_title,
                "type": "SERVICE",
                "service_type": srv,
                "category_name": "Printing & Finishing",
                "shop_id": None,
                "shop_name": "Campus Print Center",
                "price": 2.00 if srv == 'PRINTING' else (40.00 if srv == 'BINDING' else 1.00),
                "stock": 999,
                "reason": reason,
                "recommendation_score": 0.95,
                "source": "TASK",
                "action_type": "START_PRINTING",
            })

        return suggestions

    @classmethod
    def validate_and_add_to_cart(cls, user, items_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Authoritatively validates shopping items against database stock, price, and shop affiliation.
        Never trusts frontend price or stock.
        Gracefully handles out-of-stock items and multi-shop groupings.
        """
        if not items_data:
            return {
                "success": False,
                "message": "No items provided to add to cart.",
                "valid_items": [],
                "unavailable_items": [],
            }

        valid_items = []
        unavailable_items = []
        shops_involved = {}

        for raw_item in items_data:
            prod_id = raw_item.get('product_id') or raw_item.get('id')
            desired_qty = int(raw_item.get('quantity', 1))

            if not prod_id:
                # Custom/service item not directly purchasable through stationery cart
                unavailable_items.append({
                    "item_name": raw_item.get('name') or raw_item.get('custom_item_name') or 'Service Item',
                    "reason": "Generic service tasks or custom entries cannot be automatically placed in product cart. Please select catalog product or use Printing portal."
                })
                continue

            product = Product.objects.filter(id=prod_id, is_active=True).select_related('shop').first()
            if not product:
                unavailable_items.append({
                    "product_id": prod_id,
                    "item_name": raw_item.get('name', 'Product'),
                    "reason": "Item no longer exists or is discontinued."
                })
                continue

            if not product.shop or not product.shop.is_active:
                unavailable_items.append({
                    "product_id": prod_id,
                    "item_name": product.name,
                    "reason": f"Shop '{product.shop.name if product.shop else 'Unknown'}' is currently inactive."
                })
                continue

            inv = Inventory.objects.filter(product=product, shop=product.shop, is_active=True).first()
            prod_stock = (inv.current_stock - inv.reserved_stock) if inv else 0

            if prod_stock <= 0:
                unavailable_items.append({
                    "product_id": prod_id,
                    "item_name": product.name,
                    "reason": "Currently out of stock."
                })
                continue

            # Cap requested quantity to available stock
            final_qty = min(desired_qty, prod_stock)
            if desired_qty > prod_stock:
                warning = f"Quantity adjusted from {desired_qty} to {final_qty} due to limited stock."
            else:
                warning = None

            shop_id = product.shop.id
            if shop_id not in shops_involved:
                shops_involved[shop_id] = {
                    "shop_id": shop_id,
                    "shop_name": product.shop.name,
                    "items": []
                }

            item_payload = {
                "productId": product.id,
                "productName": product.name,
                "shopId": product.shop.id,
                "shopName": product.shop.name,
                "price": float(product.price),
                "quantity": final_qty,
                "current_stock": prod_stock,
                "unit": getattr(product, 'unit', 'Piece'),
                "image": product.image.url if getattr(product, 'image', None) else None,
                "warning": warning
            }
            valid_items.append(item_payload)
            shops_involved[shop_id]["items"].append(item_payload)

        # Multi-shop check
        is_multi_shop = len(shops_involved) > 1

        message_parts = []
        if valid_items:
            message_parts.append(f"{len(valid_items)} item(s) validated successfully.")
        if unavailable_items:
            message_parts.append(f"{len(unavailable_items)} item(s) could not be added because they are unavailable or out of stock.")

        return {
            "success": len(valid_items) > 0,
            "message": " ".join(message_parts),
            "is_multi_shop": is_multi_shop,
            "shops_involved_count": len(shops_involved),
            "shop_batches": list(shops_involved.values()),
            "valid_items": valid_items,
            "unavailable_items": unavailable_items,
        }

    @classmethod
    def get_semester_checklist_templates(cls, user) -> List[Dict[str, Any]]:
        """
        Returns structured, customizable semester preparation templates.
        """
        return [
            {
                "id": "template_semester_start",
                "title": "Semester Start Checklist",
                "category": "SEMESTER",
                "description": "Essential academic setup and stationery procurement for the new semester.",
                "items": [
                    {"title": "Collect and review semester syllabus & timetable", "item_type": "ACADEMIC", "order": 1},
                    {"title": "Purchase subject notebooks & registers (5 pcs)", "item_type": "SHOPPING", "order": 2},
                    {"title": "Stock blue & black ball/gel pens (1 box)", "item_type": "SHOPPING", "order": 3},
                    {"title": "Procure practical lab manual & record book", "item_type": "SHOPPING", "order": 4},
                    {"title": "Print academic calendar & course schedules", "item_type": "PRINTING", "order": 5},
                    {"title": "Organize study desk, sticky notes & highlighters", "item_type": "ACADEMIC", "order": 6},
                ]
            },
            {
                "id": "template_project_submission",
                "title": "Project Submission Checklist",
                "category": "PROJECT",
                "description": "Step-by-step milestone checklist for mini/major project submission.",
                "items": [
                    {"title": "Finalize code implementation and unit test cases", "item_type": "ACADEMIC", "order": 1},
                    {"title": "Prepare ER diagrams, architecture & system screenshots", "item_type": "ACADEMIC", "order": 2},
                    {"title": "Draft project documentation & bibliography", "item_type": "ACADEMIC", "order": 3},
                    {"title": "Print project report (B&W double-sided, color charts)", "item_type": "PRINTING", "order": 4},
                    {"title": "Procure hard-binding or spiral binding with project title", "item_type": "PRINTING", "order": 5},
                    {"title": "Purchase project submission file & CD cover if required", "item_type": "SHOPPING", "order": 6},
                    {"title": "Obtain guide & department signature on certificate page", "item_type": "ACADEMIC", "order": 7},
                ]
            },
            {
                "id": "template_exam_prep",
                "title": "Exam Preparation Checklist",
                "category": "EXAM",
                "description": "Final revision checklist and essential exam stationery kit.",
                "items": [
                    {"title": "Complete summary flashcards for high-weightage chapters", "item_type": "ACADEMIC", "order": 1},
                    {"title": "Print examination hall ticket & verify seat number", "item_type": "PRINTING", "order": 2},
                    {"title": "Check geometry box, compass, eraser & 30cm ruler", "item_type": "SHOPPING", "order": 3},
                    {"title": "Pack approved non-programmable scientific calculator", "item_type": "SHOPPING", "order": 4},
                    {"title": "Keep 4 fresh blue ball pens and spare refills", "item_type": "SHOPPING", "order": 5},
                    {"title": "Solve at least 2 previous years' question papers", "item_type": "ACADEMIC", "order": 6},
                ]
            }
        ]

    @classmethod
    def dispatch_task_deadline_reminders(cls, dry_run: bool = False) -> Dict[str, Any]:
        """
        Dispatches idempotent deadline notifications for tasks due today, tomorrow, or overdue.
        Uses reference key deduplication to prevent spamming students multiple times in the same window.
        """
        today = timezone.now().date()
        incomplete_tasks = StudentTask.objects.filter(
            status__in=[StudentTask.Status.TODO, StudentTask.Status.IN_PROGRESS]
        ).select_related('student', 'academic_event')

        stats = {
            "processed": 0,
            "reminders_sent": 0,
            "skipped_duplicates": 0,
        }

        for task in incomplete_tasks:
            stats["processed"] += 1
            due_st = task.due_status

            if due_st not in ['DUE_TODAY', 'DUE_TOMORROW', 'OVERDUE']:
                # Also check tasks due in exactly 3 days
                if task.days_remaining != 3:
                    continue
                due_st = 'DUE_IN_3_DAYS'

            # Deduplication key: e.g. TASK_REM_102_DUE_TODAY_2026-09-05
            ref_id = f"TASK_REM_{task.id}_{due_st}_{today.isoformat()}"
            if Notification.objects.filter(recipient=task.student, reference_id=ref_id).exists():
                stats["skipped_duplicates"] += 1
                continue

            # Construct message
            if due_st == 'OVERDUE':
                days_over = abs(task.days_remaining)
                title = f"Task Overdue: {task.title}"
                message = f"'{task.title}' was due {days_over} day{'s' if days_over > 1 else ''} ago ({task.due_date}). Please complete or reschedule your task."
            elif due_st == 'DUE_TODAY':
                title = f"Task Due Today: {task.title}"
                message = f"'{task.title}' is due today! Review necessary stationery supplies and printing files in your Planner."
            elif due_st == 'DUE_TOMORROW':
                title = f"Task Due Tomorrow: {task.title}"
                message = f"'{task.title}' is due tomorrow. Ensure your report or materials are ready."
            else:
                title = f"Upcoming Deadline: {task.title}"
                message = f"'{task.title}' is due in 3 days ({task.due_date}). Check required stationery in your Smart Planner."

            if not dry_run:
                Notification.objects.create(
                    recipient=task.student,
                    title=title,
                    message=message,
                    notification_type=Notification.NotificationType.TASK_REMINDER,
                    reference_id=ref_id
                )

            stats["reminders_sent"] += 1

        return stats

    @classmethod
    def get_admin_planner_stats(cls) -> Dict[str, Any]:
        """
        Aggregate anonymized platform-level planner intelligence for administrators.
        Strictly preserves student privacy (zero private note text or task contents leaked).
        """
        total_tasks = StudentTask.objects.count()
        completed_tasks = StudentTask.objects.filter(status=StudentTask.Status.COMPLETED).count()
        overdue_tasks = StudentTask.objects.filter(
            status__in=[StudentTask.Status.TODO, StudentTask.Status.IN_PROGRESS],
            due_date__lt=timezone.now().date()
        ).count()

        active_planners = StudentTask.objects.values('student').distinct().count()
        total_notes = StudentNote.objects.count()
        total_shopping_lists = ShoppingList.objects.count()
        total_shopping_items = ShoppingListItem.objects.count()
        purchased_items = ShoppingListItem.objects.filter(is_checked=True).count()

        # Aggregate task categories
        category_distribution = list(
            StudentTask.objects.values('category').annotate(count=Count('id')).order_by('-count')
        )

        # Aggregate priority breakdown
        priority_distribution = list(
            StudentTask.objects.values('priority').annotate(count=Count('id')).order_by('-count')
        )

        return {
            "success": True,
            "active_student_planners": active_planners,
            "total_notes_created": total_notes,
            "tasks": {
                "total": total_tasks,
                "completed": completed_tasks,
                "overdue": overdue_tasks,
                "completion_rate_pct": round((completed_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0,
            },
            "shopping_lists": {
                "total_lists": total_shopping_lists,
                "total_items": total_shopping_items,
                "purchased_items": purchased_items,
                "conversion_rate_pct": round((purchased_items / total_shopping_items * 100), 1) if total_shopping_items > 0 else 0,
            },
            "category_distribution": category_distribution,
            "priority_distribution": priority_distribution,
            "privacy_safeguard": "All student note contents and personal task descriptions are strictly excluded.",
        }

    @classmethod
    def get_shopkeeper_demand_insights(cls, shop=None) -> Dict[str, Any]:
        """
        Aggregate demand indicators for shopkeepers based on student academic tasks and checklists.
        Exposes zero individual student data.
        """
        today = timezone.now().date()
        # Count approaching project submission and exam tasks in next 14 days
        upcoming_tasks_qs = StudentTask.objects.filter(
            status__in=[StudentTask.Status.TODO, StudentTask.Status.IN_PROGRESS],
            due_date__gte=today,
            due_date__lte=today + timedelta(days=14)
        )

        project_tasks_count = upcoming_tasks_qs.filter(category='PROJECT').count()
        exam_tasks_count = upcoming_tasks_qs.filter(category='EXAM').count()
        assignment_tasks_count = upcoming_tasks_qs.filter(category='ASSIGNMENT').count()

        # Top stationery categories added to shopping lists across the campus
        top_wanted_categories = list(
            ShoppingListItem.objects.filter(is_checked=False, product__isnull=False)
            .values('product__category__name')
            .annotate(demand_count=Sum('quantity'))
            .order_by('-demand_count')[:5]
        )

        insights = [
            f"Upcoming project submissions: {project_tasks_count} active student project tasks due in the next 14 days. Ensure adequate stock of project files, A4 reams, and spiral binding coils.",
            f"Examinations approaching: {exam_tasks_count} active exam preparation milestones tracked. Prepare writing kits, ball pens, and rough pads.",
            f"Assignment deadlines: {assignment_tasks_count} assignment tasks registered this fortnight.",
        ]

        return {
            "success": True,
            "upcoming_demand_indicators": {
                "project_tasks_fortnight": project_tasks_count,
                "exam_tasks_fortnight": exam_tasks_count,
                "assignment_tasks_fortnight": assignment_tasks_count,
            },
            "top_stationery_demands": [
                {"category": item['product__category__name'] or 'Stationery', "units_requested": item['demand_count']}
                for item in top_wanted_categories
            ],
            "insights_summary": insights,
            "privacy_safeguard": "Fully anonymized aggregate metrics. No student identities or notes exposed.",
        }
