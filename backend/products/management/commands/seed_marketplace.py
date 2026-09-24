from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify
from decimal import Decimal
from datetime import date, time, timedelta
from users.models import User
from shops.models import Shop
from products.models import Category, Product
from inventory.models import Inventory
from delivery.models import PickupSlot, DeliveryZone, DeliverySlot
from printing.models import ShopPrintingConfig

class Command(BaseCommand):
    help = "Seeds the database with realistic campus stationery categories, diverse shops, products, and inventory stock."

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Seeding marketplace categories..."))

        categories_data = [
            ("Writing Essentials", "writing-essentials", "Gel pens, ball pens, highlighters, pencils, and permanent markers."),
            ("Notebooks & Registers", "notebooks-registers", "Long registers, spiral notebooks, graph pads, and practical lab records."),
            ("Office & Study Supplies", "office-study", "Staplers, tape, glue sticks, scissors, binders, and paper clips."),
            ("Paper & Printing Sheets", "paper-sheets", "A4 copier paper reams, bond paper, glossy sheets, and drawing charts."),
            ("Engineering & Drafting Tools", "engineering-tools", "Scientific calculators, mini drafters, geometric instruments, and scales."),
            ("Art & Craft Supplies", "art-craft", "Sketchbooks, fine liners, acrylic sets, watercolours, and brush pens."),
        ]

        categories = {}
        for name, slug, desc in categories_data:
            cat, created = Category.objects.update_or_create(
                slug=slug,
                defaults={
                    "name": name,
                    "description": desc,
                    "is_active": True,
                }
            )
            categories[slug] = cat
            status_text = "Created" if created else "Updated"
            self.stdout.write(f"  - Category [{name}]: {status_text}")

        self.stdout.write(self.style.NOTICE("\nSeeding campus merchants & shop owners..."))

        # 1. Shop Owner for Xerox Center
        xerox_owner, _ = User.objects.get_or_create(
            email="owner@campus.edu",
            defaults={
                "username": "owner@campus.edu",
                "first_name": "Ramesh",
                "last_name": "Gupta",
                "role": User.Role.SHOP_OWNER,
                "phone_number": "+919876543210",
                "is_active": True,
            }
        )
        xerox_owner.set_password("OwnerPass123!")
        xerox_owner.role = User.Role.SHOP_OWNER
        xerox_owner.is_active = True
        xerox_owner.save()

        # 2. Shop Owner for Bookstore
        bookstore_owner, _ = User.objects.get_or_create(
            email="sharma@stationery.com",
            defaults={
                "username": "sharma@stationery.com",
                "first_name": "Sharma",
                "last_name": "Books",
                "role": User.Role.SHOP_OWNER,
                "phone_number": "+919876543211",
                "is_active": True,
            }
        )
        bookstore_owner.set_password("ShopOwnerPass123!")
        bookstore_owner.role = User.Role.SHOP_OWNER
        bookstore_owner.is_active = True
        bookstore_owner.save()

        # 3. Shop Owner for Tech Store
        tech_owner, _ = User.objects.get_or_create(
            email="tech_owner@campus.edu",
            defaults={
                "username": "tech_owner@campus.edu",
                "first_name": "Vikram",
                "last_name": "Singhania",
                "role": User.Role.SHOP_OWNER,
                "phone_number": "+919876543212",
                "is_active": True,
            }
        )
        tech_owner.set_password("TechOwnerPass123!")
        tech_owner.role = User.Role.SHOP_OWNER
        tech_owner.is_active = True
        tech_owner.save()

        # 4. Shop Owner for Law Depository
        law_owner, _ = User.objects.get_or_create(
            email="law_depot@campus.edu",
            defaults={
                "username": "law_depot@campus.edu",
                "first_name": "Kailash",
                "last_name": "Mishra",
                "role": User.Role.SHOP_OWNER,
                "phone_number": "+919876543213",
                "is_active": True,
            }
        )
        law_owner.set_password("LawOwnerPass123!")
        law_owner.role = User.Role.SHOP_OWNER
        law_owner.is_active = True
        law_owner.save()

        # 5. Campus Delivery Courier
        delivery_agent, _ = User.objects.get_or_create(
            email="delivery@campus.edu",
            defaults={
                "username": "delivery@campus.edu",
                "first_name": "Vikram",
                "last_name": "Singh",
                "role": User.Role.DELIVERY_AGENT,
                "phone_number": "+919811223344",
                "is_active": True,
            }
        )
        delivery_agent.set_password("DeliveryPass123!")
        delivery_agent.role = User.Role.DELIVERY_AGENT
        delivery_agent.phone_number = "+919811223344"
        delivery_agent.is_active = True
        delivery_agent.save()

        shops_data = [
            {
                "owner": bookstore_owner,
                "name": "Central Campus Bookstore & Stationery",
                "slug": "central-campus-bookstore",
                "shop_type": Shop.ShopType.COLLEGE_STATIONERY,
                "description": "The primary campus bookstore providing all official university registers, reference texts, and daily study essentials.",
                "address": "Ground Floor, Student Activity Center (SAC) Block B",
                "campus_location": "SAC Block B, Near Campus Gate 2",
                "contact_phone": "+91 98765 43211",
                "contact_email": "sac.stationery@campus.edu",
                "opening_time": "08:30:00",
                "closing_time": "20:30:00",
                "rating": Decimal("4.80"),
                "is_active": True,
            },
            {
                "owner": xerox_owner,
                "name": "Student Xerox & Digital Printing Center",
                "slug": "student-xerox-printing",
                "shop_type": Shop.ShopType.PRINTING_XEROX,
                "description": "High-speed laser printing, spiral binding, thesis hardbound binding, colour charts, and bulk document copy services.",
                "address": "Academic Plaza, Opposite Central Library",
                "campus_location": "Central Library Complex, Room 102",
                "contact_phone": "+91 98765 43210",
                "contact_email": "print.center@campus.edu",
                "opening_time": "08:00:00",
                "closing_time": "22:00:00",
                "rating": Decimal("4.90"),
                "is_active": True,
            },
            {
                "owner": tech_owner,
                "name": "Engineering Tech & Drafting Supplies",
                "slug": "engineering-tech-supplies",
                "shop_type": Shop.ShopType.LOCAL_STATIONERY,
                "description": "Specialized laboratory apparatus, Casio calculators, drafters, circuit components, and engineering drawing charts.",
                "address": "North Campus Gate 4, Engineering Arcade",
                "campus_location": "Gate 4, Tech Arcade Shop 5",
                "contact_phone": "+91 98765 43212",
                "contact_email": "engg.tech@campus.edu",
                "opening_time": "09:00:00",
                "closing_time": "21:00:00",
                "rating": Decimal("4.75"),
                "is_active": True,
            },
            {
                "owner": law_owner,
                "name": "Campus Books & Law Depository",
                "slug": "campus-books-depository",
                "shop_type": Shop.ShopType.BOOK_STATIONERY,
                "description": "Official Bare Acts, legal registers, university syllabus kits, fountain pens, and hardbound planners.",
                "address": "Faculty of Law & Arts Complex, East Gate",
                "campus_location": "Law Faculty Quadrangle, Ground Floor",
                "contact_phone": "+91 98765 43213",
                "contact_email": "law.books@campus.edu",
                "opening_time": "09:30:00",
                "closing_time": "19:30:00",
                "rating": Decimal("4.65"),
                "is_active": True,
            },
        ]

        shops = {}
        for sdata in shops_data:
            shop, created = Shop.objects.update_or_create(
                slug=sdata["slug"],
                defaults=sdata
            )
            shops[sdata["slug"]] = shop
            status_text = "Created" if created else "Updated"
        self.stdout.write(self.style.NOTICE("\nSeeding shop pickup slots (Today & Tomorrow)..."))
        today = date.today()
        tomorrow = today + timedelta(days=1)

        slot_templates = [
            (today, time(10, 0), time(11, 30), 15, 3),
            (today, time(14, 0), time(15, 30), 12, 5),
            (today, time(16, 30), time(18, 0), 10, 2),
            (tomorrow, time(10, 0), time(11, 30), 15, 0),
            (tomorrow, time(14, 0), time(15, 30), 12, 1),
            (tomorrow, time(16, 30), time(18, 0), 6, 6),  # Fully booked slot for capacity test
        ]

        for shop in shops.values():
            for s_date, s_start, s_end, cap, booked in slot_templates:
                slot, s_created = PickupSlot.objects.update_or_create(
                    shop=shop,
                    date=s_date,
                    start_time=s_start,
                    end_time=s_end,
                    defaults={
                        "capacity": cap,
                        "booked_count": booked,
                        "is_active": True,
                    }
                )
                status_txt = "Created" if s_created else "Updated"
                avail_txt = f"{slot.capacity - slot.booked_count}/{slot.capacity} spots free"
                # self.stdout.write(f"  - Slot [{shop.name}] {s_date} {s_start.strftime('%H:%M')}: {status_txt} ({avail_txt})")

        self.stdout.write(self.style.SUCCESS(f"  Created pickup slots for {len(shops)} shops across today & tomorrow."))

        self.stdout.write(self.style.NOTICE("\nSeeding campus delivery zones & delivery time slots..."))
        zones_data = [
            ("Campus Core & Hostels (0-2 km)", Decimal("0.0"), Decimal("2.0"), Decimal("15.00"), Decimal("250.00")),
            ("Outer Departments & Faculty Quarters (2-5 km)", Decimal("2.0"), Decimal("5.0"), Decimal("25.00"), Decimal("350.00")),
            ("Research Park & Off-Campus Annexe (5-8 km)", Decimal("5.0"), Decimal("8.0"), Decimal("40.00"), Decimal("500.00")),
        ]
        for z_name, min_d, max_d, charge, thresh in zones_data:
            DeliveryZone.objects.update_or_create(
                name=z_name,
                shop=None,
                defaults={
                    "minimum_distance": min_d,
                    "maximum_distance": max_d,
                    "base_charge": charge,
                    "free_delivery_threshold": thresh,
                    "is_active": True,
                }
            )

        delivery_slot_templates = [
            (today, time(10, 30), time(12, 0), 10, 1),
            (today, time(14, 0), time(15, 30), 10, 2),
            (today, time(17, 0), time(18, 30), 10, 0),
            (today, time(19, 0), time(20, 30), 8, 0),
            (tomorrow, time(10, 30), time(12, 0), 10, 0),
            (tomorrow, time(14, 0), time(15, 30), 10, 0),
            (tomorrow, time(17, 0), time(18, 30), 10, 0),
        ]

        for shop in shops.values():
            for s_date, s_start, s_end, cap, booked in delivery_slot_templates:
                DeliverySlot.objects.update_or_create(
                    shop=shop,
                    date=s_date,
                    start_time=s_start,
                    end_time=s_end,
                    defaults={
                        "capacity": cap,
                        "booked_count": booked,
                        "is_active": True,
                    }
                )

        self.stdout.write(self.style.SUCCESS(f"  Created delivery zones and delivery slots for {len(shops)} shops."))

        self.stdout.write(self.style.NOTICE("\nSeeding shop printing capabilities & rate cards..."))

        # Shop 2: Student Xerox & Digital Printing Center (Full Service Print & Copy)
        ShopPrintingConfig.objects.update_or_create(
            shop=shops["student-xerox-printing"],
            defaults={
                "is_printing_enabled": True,
                "bw_rate_per_page": Decimal("1.50"),
                "color_rate_per_page": Decimal("6.00"),
                "a3_multiplier": Decimal("2.00"),
                "corner_staple_price": Decimal("5.00"),
                "spiral_binding_price": Decimal("30.00"),
                "soft_bind_price": Decimal("60.00"),
                "hardcover_price": Decimal("150.00"),
                "supported_paper_sizes": ["A4", "A3"],
                "supported_binding_types": ["NONE", "CORNER_STAPLE", "SPIRAL", "SOFT_BIND", "HARDCOVER"],
                "base_prep_time_mins": 10,
                "mins_per_100_pages": 5,
            }
        )
        self.stdout.write("  - Printing Config [Student Xerox Center]: Active (B/W: INR 1.50, Color: INR 6.00)")

        # Shop 1: Central Campus Bookstore (Standard A4 Print Station)
        ShopPrintingConfig.objects.update_or_create(
            shop=shops["central-campus-bookstore"],
            defaults={
                "is_printing_enabled": True,
                "bw_rate_per_page": Decimal("2.00"),
                "color_rate_per_page": Decimal("8.00"),
                "a3_multiplier": Decimal("2.00"),
                "corner_staple_price": Decimal("5.00"),
                "spiral_binding_price": Decimal("35.00"),
                "soft_bind_price": Decimal("75.00"),
                "hardcover_price": Decimal("180.00"),
                "supported_paper_sizes": ["A4"],
                "supported_binding_types": ["NONE", "CORNER_STAPLE", "SPIRAL"],
                "base_prep_time_mins": 15,
                "mins_per_100_pages": 8,
            }
        )
        self.stdout.write("  - Printing Config [Central Campus Bookstore]: Active (B/W: INR 2.00, Color: INR 8.00, A4 Only)")

        # Shop 3 & 4: Stationery Only
        for slug in ["engineering-tech-supplies", "campus-books-depository"]:
            ShopPrintingConfig.objects.update_or_create(
                shop=shops[slug],
                defaults={"is_printing_enabled": False}
            )

        self.stdout.write(self.style.NOTICE("\nSeeding stationery products & inventory..."))

        products_data = [
            # Shop 1: Central Campus Bookstore
            {
                "shop": shops["central-campus-bookstore"],
                "category": categories["notebooks-registers"],
                "name": "Classmate A4 Long Register (200 Pages)",
                "sku": "REG-A4-200",
                "description": "Premium 200-page ruled register notebook. High quality ozone-treated chlorine-free paper, ideal for semester lecture notes.",
                "price": Decimal("95.00"),
                "brand": "Classmate",
                "unit": Product.Unit.PIECE,
                "stock": 120,
            },
            {
                "shop": shops["central-campus-bookstore"],
                "category": categories["writing-essentials"],
                "name": "Pilot V5 Liquid Ink Pen (Blue 0.5mm)",
                "sku": "PEN-PILOT-V5-BL",
                "description": "Fine 0.5mm rollerball pen with unique liquid ink formula for smooth, skip-free handwriting during exams.",
                "price": Decimal("60.00"),
                "brand": "Pilot",
                "unit": Product.Unit.PIECE,
                "stock": 250,
            },
            {
                "shop": shops["central-campus-bookstore"],
                "category": categories["engineering-tools"],
                "name": "Camlin Kokuyo Geometry Box",
                "sku": "GEO-CAMLIN-01",
                "description": "High precision engineering geometry instruments including compass, divider, 15cm ruler, and protractor.",
                "price": Decimal("140.00"),
                "brand": "Camlin",
                "unit": Product.Unit.SET,
                "stock": 45,
            },
            {
                "shop": shops["central-campus-bookstore"],
                "category": categories["office-study"],
                "name": "Post-it Sticky Notes (Yellow 3x3 Inch)",
                "sku": "NOTE-POSTIT-YEL",
                "description": "100 self-adhesive sheets per pad. Perfect for textbook reminders, revision bookmarks, and desk notices.",
                "price": Decimal("55.00"),
                "brand": "3M Post-it",
                "unit": Product.Unit.PACK,
                "stock": 80,
            },
            {
                "shop": shops["central-campus-bookstore"],
                "category": categories["writing-essentials"],
                "name": "Cello Butterflow Ballpoint Pens (Pack of 5)",
                "sku": "PEN-CELLO-BF-5",
                "description": "Ergonomic rubber grip with low viscosity ink. Smooth and fast handwriting for exam halls.",
                "price": Decimal("50.00"),
                "brand": "Cello",
                "unit": Product.Unit.PACK,
                "stock": 150,
            },

            # Shop 2: Student Xerox & Digital Printing Center
            {
                "shop": shops["student-xerox-printing"],
                "category": categories["paper-sheets"],
                "name": "JK Copier A4 Paper Ream (75 GSM, 500 Sheets)",
                "sku": "PPR-JK-A4-75G",
                "description": "Super high white multi-purpose copier paper ream. Excellent for laser printing, Xerox, and formal project submissions.",
                "price": Decimal("360.00"),
                "brand": "JK Paper",
                "unit": Product.Unit.REAM,
                "stock": 60,
            },
            {
                "shop": shops["student-xerox-printing"],
                "category": categories["notebooks-registers"],
                "name": "Spiral Bound Engineering Practical Lab Record",
                "sku": "REC-ENGG-LAB-120",
                "description": "120-page blank and ruled format with butter paper dividers for circuit diagrams and graphs.",
                "price": Decimal("85.00"),
                "brand": "Campus Press",
                "unit": Product.Unit.PIECE,
                "stock": 90,
            },
            {
                "shop": shops["student-xerox-printing"],
                "category": categories["office-study"],
                "name": "Transparent L-Folder Document Files (Pack of 10)",
                "sku": "FILE-LFOLDER-10",
                "description": "Heavy-duty transparent plastic L-type folders for clean assignment submission and syllabus storage.",
                "price": Decimal("70.00"),
                "brand": "Solo",
                "unit": Product.Unit.PACK,
                "stock": 110,
            },
            {
                "shop": shops["student-xerox-printing"],
                "category": categories["paper-sheets"],
                "name": "A3 Engineering Graph Sheets Pad (50 Sheets)",
                "sku": "PPR-A3-GRAPH-50",
                "description": "High precision mm-grid engineering drawing graph paper pad for civil and mechanical coursework.",
                "price": Decimal("120.00"),
                "brand": "Campus Press",
                "unit": Product.Unit.PACK,
                "stock": 40,
            },
            {
                "shop": shops["student-xerox-printing"],
                "category": categories["writing-essentials"],
                "name": "Faber-Castell Pastel Highlighters (Set of 4)",
                "sku": "HL-FABER-PST-4",
                "description": "Subtle pastel colours (mint, lavender, peach, powder pink). Won't bleed through thin textbook pages.",
                "price": Decimal("110.00"),
                "brand": "Faber-Castell",
                "unit": Product.Unit.SET,
                "stock": 65,
            },

            # Shop 3: Engineering Tech & Drafting Supplies
            {
                "shop": shops["engineering-tech-supplies"],
                "category": categories["engineering-tools"],
                "name": "Casio FX-991CW Advanced Scientific Calculator",
                "sku": "CALC-CASIO-991CW",
                "description": "540+ functions including equation solving, matrix calculation, vector algebra, and high-resolution 4-gradation display. University approved.",
                "price": Decimal("1350.00"),
                "brand": "Casio",
                "unit": Product.Unit.PIECE,
                "stock": 25,
            },
            {
                "shop": shops["engineering-tech-supplies"],
                "category": categories["engineering-tools"],
                "name": "Mini Drafter with Stainless Steel Clamp Rods",
                "sku": "DRAFT-MINI-SS",
                "description": "Unbreakable transparent scale blades with 360-degree protractor head. Indispensable for engineering graphics and design.",
                "price": Decimal("420.00"),
                "brand": "Omega",
                "unit": Product.Unit.SET,
                "stock": 30,
            },
            {
                "shop": shops["engineering-tech-supplies"],
                "category": categories["writing-essentials"],
                "name": "Rotring Tikky Mechanical Pencil (0.5mm)",
                "sku": "PNC-ROTRING-05",
                "description": "Ergonomic wavy rubber grip, fixed lead guidance sleeve preventing lead breakage during technical drawing.",
                "price": Decimal("195.00"),
                "brand": "Rotring",
                "unit": Product.Unit.PIECE,
                "stock": 50,
            },
            {
                "shop": shops["engineering-tech-supplies"],
                "category": categories["art-craft"],
                "name": "Micron Pigma Fineliner Pens (Set of 6, Black)",
                "sku": "ART-MICRON-6",
                "description": "Archival pigment ink pens (0.2mm to 0.8mm). Waterproof, chemical-proof, and fade resistant.",
                "price": Decimal("390.00"),
                "brand": "Sakura",
                "unit": Product.Unit.SET,
                "stock": 28,
            },
            {
                "shop": shops["engineering-tech-supplies"],
                "category": categories["engineering-tools"],
                "name": "Professional Triangular Drafting Scale (30cm)",
                "sku": "SCL-TRI-DRAFT-30",
                "description": "Colour-coded grooves with six distinct architectural and engineering ratio scales.",
                "price": Decimal("160.00"),
                "brand": "Omega",
                "unit": Product.Unit.PIECE,
                "stock": 0, # Out of stock demonstration item!
            },

            # Shop 4: Campus Books & Law Depository
            {
                "shop": shops["campus-books-depository"],
                "category": categories["notebooks-registers"],
                "name": "Executive Hardbound Ruled Journal & Planner",
                "sku": "JRNL-EXEC-HARD-A5",
                "description": "192 numbered pages with pen loop, ribbon bookmark, and back pocket. Premium leatherette cover.",
                "price": Decimal("280.00"),
                "brand": "Moleskine Style",
                "unit": Product.Unit.PIECE,
                "stock": 35,
            },
            {
                "shop": shops["campus-books-depository"],
                "category": categories["writing-essentials"],
                "name": "Parker Vector Matte Black Fountain Pen",
                "sku": "PEN-PARKER-VECT-BK",
                "description": "Fine stainless steel nib with stainless steel body and refillable converter. Smooth, classic writing experience.",
                "price": Decimal("490.00"),
                "brand": "Parker",
                "unit": Product.Unit.PIECE,
                "stock": 18,
            },
            {
                "shop": shops["campus-books-depository"],
                "category": categories["office-study"],
                "name": "Kangaro Heavy Duty Stapler & Pin Pack (No. 10)",
                "sku": "STPL-KANGARO-10",
                "description": "All-metal construction with quick-loading mechanism. Includes 1000 standard staples.",
                "price": Decimal("145.00"),
                "brand": "Kangaro",
                "unit": Product.Unit.SET,
                "stock": 55,
            },
        ]

        for pdata in products_data:
            stock_qty = pdata.pop("stock")
            slug_base = slugify(pdata["name"])
            product, created = Product.objects.update_or_create(
                shop=pdata["shop"],
                sku=pdata["sku"],
                defaults={
                    **pdata,
                    "slug": f"{slug_base}-{pdata['sku'].lower()}",
                    "is_active": True,
                }
            )

            # Update or create associated Inventory record
            inv, inv_created = Inventory.objects.update_or_create(
                shop=product.shop,
                product=product,
                defaults={
                    "current_stock": stock_qty,
                    "reorder_threshold": 10,
                    "safety_stock": 5,
                    "unit_cost": product.price * Decimal("0.70"),
                }
            )

            status_text = "Created" if created else "Updated"
            self.stdout.write(f"  - Product [{product.name}] in [{product.shop.name}]: {status_text} (Stock: {stock_qty})")

        self.stdout.write(self.style.SUCCESS("\nSuccessfully seeded marketplace data!"))
