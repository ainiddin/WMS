"""Seed data.

    python -m app.seed            # only the first Admin (from .env), safe to run any time
    python -m app.seed --demo     # + demo shop: categories, products, 3 teams, customers, one year of history
    python -m app.seed --demo --reset   # wipe all data first
    python -m app.seed --demo-if-empty  # demo data only into an empty database (used on deploy)

The year of history is simulated event by event through the real services (create -> approve -> ship, daily
restock), so every rule is respected and the reconciliation report is clean.
"""

import argparse
import heapq
import itertools
import random
import sys
from collections import Counter
from datetime import UTC, datetime, time, timedelta
from decimal import ROUND_CEILING, Decimal

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import Base, SessionLocal
from app.models import (
    Account,
    Category,
    Customer,
    Employee,
    MovementType,
    Order,
    OrderStatus,
    Product,
    Role,
    Supplier,
    User,
    UserStatus,
)
from app.schemas.orders import OrderCreate, OrderItemIn
from app.services import account_service, order_service
from app.services.movement_service import record_movement
from app.services.timeutil import local_tz
from app.services.user_service import ensure_first_admin

CATEGORIES = ["Kitchen", "Cleaning", "Bathroom", "Laundry", "Home textile"]

SUPPLIERS = [
    ("Almaty HomeGoods LLP", "+7 727 355 10 20", "sales@homegoods.kz"),
    ("Steppe Clean Supply", "+7 717 244 88 90", "orders@steppeclean.kz"),
    ("Astana Textile Co", "+7 717 270 44 55", "info@astanatextile.kz"),
    ("Caspian Kitchenware", "+7 729 230 77 11", "b2b@caspiankitchen.kz"),
]

# name, category, supplier index, price KZT, min_quantity, description
PRODUCTS = [
    ("Non-stick frying pan 28 cm", "Kitchen", 3, 12990, 15, "Aluminium pan with granite coating, for all hobs."),
    ("Stainless steel pot 5 L", "Kitchen", 3, 15490, 10, "Pot with glass lid and heat-resistant handles."),
    ("Kitchen knife set (5 pcs)", "Kitchen", 3, 18990, 8, "Chef, bread, santoku, utility and paring knives."),
    ("Glass food containers (set of 3)", "Kitchen", 0, 6490, 20, "Borosilicate glass, microwave safe."),
    ("Electric kettle 1.7 L", "Kitchen", 0, 14990, 10, "2200 W, auto shut-off, LED light."),
    ("Bamboo cutting board", "Kitchen", 0, 4290, 15, "Large board 40x30 cm with juice groove."),
    ("Dishwashing liquid 1 L", "Cleaning", 1, 1290, 60, "Lemon scent, concentrated formula."),
    ("All-purpose cleaner spray 750 ml", "Cleaning", 1, 1690, 50, "For kitchen, bathroom and glass."),
    ("Microfiber cloths (pack of 10)", "Cleaning", 1, 2490, 40, "Lint-free, machine washable."),
    ("Mop with bucket and wringer", "Cleaning", 0, 11990, 8, "360 degree spin mop, 2 refills."),
    ("Trash bags 60 L (30 pcs)", "Cleaning", 1, 1490, 60, "Strong bags with ties."),
    ("Bath towel 70x140", "Bathroom", 2, 5990, 25, "100% cotton, 500 g/m2."),
    ("Shower curtain with rings", "Bathroom", 2, 4490, 12, "Water-repellent polyester, 180x200 cm."),
    ("Toilet paper 3-ply (12 rolls)", "Bathroom", 1, 2990, 50, "Soft, unscented."),
    ("Bathroom mat anti-slip", "Bathroom", 2, 3990, 15, "Memory foam, 50x80 cm."),
    ("Toothbrush holder ceramic", "Bathroom", 0, 2790, 10, "White ceramic, 4 slots."),
    ("Laundry detergent 3 kg", "Laundry", 1, 5490, 40, "Powder for white and colour fabrics."),
    ("Fabric softener 2 L", "Laundry", 1, 2390, 30, "Spring flowers scent."),
    ("Drying rack foldable", "Laundry", 0, 9990, 8, "18 m of drying space, steel."),
    ("Laundry basket 50 L", "Laundry", 0, 3490, 12, "With handles and lid."),
    ("Ironing board", "Laundry", 0, 13990, 6, "Adjustable height, cotton cover."),
    ("Bed linen set (double)", "Home textile", 2, 19990, 10, "Sateen cotton: duvet cover, sheet, 2 pillowcases."),
    ("Pillow 50x70", "Home textile", 2, 4990, 20, "Hypoallergenic fibre filling."),
    ("Fleece blanket 150x200", "Home textile", 2, 6990, 15, "Soft and warm, grey."),
    ("Blackout curtains (2 panels)", "Home textile", 2, 15990, 6, "140x260 cm each, with hooks."),
]

# (full name, email, phone); a worker list per manager = one team. Activity = how busy the team is.
TEAMS = [
    (("Dauren Abenov", "dauren@wms.kz", "+7 701 111 22 33"), 1.3, [
        ("Arman Seitkali", "arman@wms.kz", "+7 702 120 33 01"),
        ("Dana Yesenova", "dana@wms.kz", "+7 702 120 33 02"),
        ("Yerlan Mukhamedov", "yerlan@wms.kz", "+7 702 120 33 03"),
    ]),
    (("Aigerim Sadykova", "aigerim@wms.kz", "+7 701 222 33 44"), 1.0, [
        ("Madina Ospanova", "madina@wms.kz", "+7 705 330 11 01"),
        ("Timur Bekov", "timur@wms.kz", "+7 705 330 11 02"),
    ]),
    (("Nurlan Tokhtarov", "nurlan@wms.kz", "+7 701 333 44 55"), 0.8, [
        ("Asel Nurlanovna", "asel@wms.kz", "+7 707 440 55 01"),
        ("Bekzat Zhumabay", "bekzat@wms.kz", "+7 707 440 55 02"),
    ]),
]

CUSTOMERS = [
    ("Aliya Karimova", "aliya@mail.kz", "+7 777 501 00 01", "Almaty, Abay ave 52, apt 14"),
    ("Ruslan Ibraimov", "ruslan@mail.kz", "+7 777 501 00 02", "Almaty, Dostyk ave 105, apt 3"),
    ("Saule Akhmetova", "saule@mail.kz", "+7 777 501 00 03", "Astana, Kabanbay batyr 11, apt 87"),
    ("Daniyar Kassymov", "daniyar@mail.kz", "+7 777 501 00 04", "Almaty, Satpayev st 30, apt 9"),
    ("Gulnara Bekova", "gulnara@mail.kz", "+7 777 501 00 05", "Almaty, Tole bi st 190, apt 41"),
    ("Askar Omarov", "askar@mail.kz", "+7 777 501 00 06", "Astana, Mangilik El 20, apt 112"),
    ("Zhanna Serikova", "zhanna@mail.kz", "+7 777 501 00 07", "Almaty, Rozybakiev st 247, apt 6"),
    ("Marat Duisenov", "marat@mail.kz", "+7 777 501 00 08", "Shymkent, Tauke khan ave 8, apt 25"),
    ("Kamila Abdrakhmanova", "kamila@mail.kz", "+7 777 501 00 09", "Almaty, Zharokov st 15, apt 70"),
    ("Yerzhan Tulegenov", "yerzhan@mail.kz", "+7 777 501 00 10", "Karaganda, Bukhar zhyrau 48, apt 2"),
    ("Assel Mukanova", "assel.m@mail.kz", "+7 777 501 00 11", "Almaty, Nauryzbay batyr 89, apt 31"),
    ("Timur Zhakupov", "timur.z@mail.kz", "+7 777 501 00 12", "Astana, Turan ave 37, apt 54"),
]

PENDING_STAFF = [
    ("Ayan Kudaibergen", "ayan@wms.kz", "+7 708 550 66 01", Role.WORKER),
    ("Dilnaz Sultanova", "dilnaz@wms.kz", "+7 708 550 66 02", Role.MANAGER),
]


def ean13(body12: str) -> str:
    total = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(body12))
    return body12 + str((10 - total % 10) % 10)


def _user(email, full_name, phone, role, status, password_hash, created_at, requested_role=None) -> User:
    return User(email=email, full_name=full_name, phone=phone, role=role, status=status,
                password_hash=password_hash, created_at=created_at, requested_role=requested_role,
                approved_at=created_at if status == UserStatus.ACTIVE else None)


def reset(db: Session) -> None:
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    db.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    db.commit()


class Simulation:
    def __init__(self, db: Session, rng: random.Random, start: datetime, now: datetime):
        self.db, self.rng, self.now = db, rng, now
        self.start = start
        self.events: list = []
        self.seq = itertools.count()
        self.products = db.scalars(select(Product).order_by(Product.id)).all()
        self.customers = db.scalars(select(Customer).order_by(Customer.id)).all()
        self.managers = db.scalars(select(Employee).where(Employee.role == Role.MANAGER).order_by(Employee.id)).all()
        self.workers = db.scalars(select(Employee).where(Employee.role == Role.WORKER).order_by(Employee.id)).all()
        self.activity = {m.id: a for m, (_, a, _) in zip(self.managers, TEAMS)}
        self.stats = Counter(orders=0, shipped=0, rejected=0, cancelled=0, stock_in=0, waited_for_stock=0,
                             approved_after_waiting=0)

    def schedule(self, at: datetime, kind: str, payload=None) -> None:
        if at <= self.now:
            heapq.heappush(self.events, (at, next(self.seq), kind, payload))

    def team_worker(self, manager_id: int | None = None) -> Employee:
        """Busier teams do more of the work."""
        if manager_id and self.rng.random() < 0.75:
            pool = [w for w in self.workers if w.manager_id == manager_id]
        else:
            pool = self.workers
        weights = [self.activity[w.manager_id] for w in pool]
        return self.rng.choices(pool, weights)[0]

    def create_order(self, customer: Customer, items: list[OrderItemIn], at: datetime, comment: str | None = None) -> Order:
        """Orders are paid from the account, so a customer short of money first tops up from the bank."""
        total = sum((self.db.get(Product, i.product_id).unit_price * i.quantity for i in items), Decimal("0"))
        account = account_service.get_account(self.db, customer.id)
        if account.balance < total:
            needed = ((total - account.balance) / 5000).to_integral_value(ROUND_CEILING) * 5000
            amount = max(needed, Decimal(self.rng.choice([10_000, 20_000, 30_000, 50_000, 100_000])))
            account_service.top_up(self.db, customer, amount, at - timedelta(minutes=self.rng.randint(3, 40)))
        self.stats["orders"] += 1
        return order_service.create_order(self.db, customer, OrderCreate(items=items, comment=comment), at=at)

    def local(self, day, hour: float) -> datetime:
        return datetime.combine(day, time(), local_tz()) + timedelta(hours=hour)

    def run(self) -> None:
        tz = local_tz()
        first_day = self.start.astimezone(tz).date()
        last_day = self.now.astimezone(tz).date()
        days = (last_day - first_day).days

        # Day 0: first delivery of every product.
        for p in self.products:
            self.stock_in(p, p.min_quantity * 3 + self.rng.randint(0, 20), self.local(first_day, 9))
        for offset in range(1, days + 1):
            day = first_day + timedelta(days=offset)
            self.schedule(self.local(day, 8), "restock")
            # The shop grows during the year: ~2 orders a day at the start, ~5 at the end.
            per_day = 2 + 3 * offset / days
            n = max(0, round(self.rng.gauss(per_day, 1.2)))
            for _ in range(n):
                self.schedule(self.local(day, self.rng.uniform(9, 22)), "create")

        while self.events:
            at, _, kind, payload = heapq.heappop(self.events)
            getattr(self, f"on_{kind}")(at, payload)
            if kind == "restock":
                self.db.commit()
        self.finish()
        self.db.commit()

    def finish(self) -> None:
        """Leave something to show at the defense: products below minimum and orders in every queue."""
        # Bulk purchases in the last hours took a few products below their minimum -> Restock list.
        for p in self.rng.sample(self.products, 4):
            free = p.quantity - order_service.reserved_units(self.db, [p.id]).get(p.id, 0)
            qty = free - self.rng.randint(max(1, p.min_quantity // 3), max(1, p.min_quantity - 1))
            if qty <= 0:
                continue
            at = self.now - timedelta(hours=self.rng.uniform(4, 6))
            customer = self.rng.choice(self.customers)
            order = self.create_order(customer, [OrderItemIn(product_id=p.id, quantity=qty)], at,
                                      comment="Bulk purchase for an office")
            if order.status == OrderStatus.APPROVED:
                self.ship(order, at + timedelta(hours=2), self.db.get(Employee, order.assigned_to_id))
        # A few fresh orders: approved by the system and waiting in the Workers' queues.
        in_stock = [p for p in self.products if p.quantity >= 8]
        for i in range(6):
            at = self.now - timedelta(hours=3 - i * 0.5)
            items = [OrderItemIn(product_id=p.id, quantity=self.rng.randint(1, 2))
                     for p in self.rng.sample(in_stock, self.rng.randint(1, 3))]
            self.create_order(self.rng.choice(self.customers), items, at)
        # Two customers ordered more than there is: their orders wait for a delivery (shows the expected wait).
        for p in self.rng.sample(self.products, 2):
            at = self.now - timedelta(hours=self.rng.uniform(1, 2))
            self.create_order(self.rng.choice(self.customers),
                              [OrderItemIn(product_id=p.id, quantity=p.quantity + self.rng.randint(3, 8))], at,
                              comment="Need them for a new flat")

    def stock_in(self, product: Product, qty: int, at: datetime) -> None:
        worker = self.team_worker()
        record_movement(self.db, product_id=product.id, movement_type=MovementType.IN, quantity=qty,
                        employee_id=worker.id, note="Supplier delivery", at=at)
        self.stats["stock_in"] += 1
        # Orders that waited for this product are approved by the system and given to Workers.
        for order in order_service.approve_waiting(self.db, [product.id], at):
            self.stats["approved_after_waiting"] += 1
            self.schedule_ship(order, at)

    def schedule_ship(self, order: Order, at: datetime) -> None:
        self.schedule(at + timedelta(hours=self.rng.uniform(1, 30)), "ship", (order.id, 0))

    def on_restock(self, at: datetime, _) -> None:
        # Products below their minimum, and products that waiting orders need, are ordered from the supplier.
        _, missing, _ = order_service.queue_state(self.db, [p.id for p in self.products])
        demand = Counter()
        for short in missing.values():
            demand.update(short)
        for p in self.products:
            low = p.quantity < p.min_quantity * 1.3
            if (low and self.rng.random() < 0.6) or (demand[p.id] and self.rng.random() < 0.5):
                qty = max(10, round((p.min_quantity * 3 + demand[p.id] - p.quantity) / 5) * 5)
                self.stock_in(p, qty, at + timedelta(minutes=self.rng.randint(0, 300)))

    def on_create(self, at: datetime, _) -> None:
        customer = self.rng.choice(self.customers)
        picks = self.rng.sample(self.products, self.rng.choices([1, 2, 3, 4], [40, 35, 18, 7])[0])
        items = [OrderItemIn(product_id=p.id, quantity=self.rng.choices([1, 2, 3, 4], [55, 28, 12, 5])[0])
                 for p in picks]
        order = self.create_order(customer, items, at)
        if self.rng.random() < 0.03:
            self.schedule(at + timedelta(hours=self.rng.uniform(0.2, 3)), "customer_cancel", order.id)
        elif self.rng.random() < 0.02:
            self.schedule(at + timedelta(hours=self.rng.uniform(0.3, 6)), "manager_reject", order.id)
        if order.status == OrderStatus.APPROVED:
            self.schedule_ship(order, at)
        else:
            self.stats["waited_for_stock"] += 1
            if self.rng.random() < 0.3:  # some customers cannot wait and buy elsewhere
                self.schedule(at + timedelta(days=self.rng.uniform(1, 3)), "customer_cancel", order.id)

    def on_customer_cancel(self, at: datetime, order_id: int) -> None:
        order = self.db.get(Order, order_id)
        if order.status in (OrderStatus.PENDING, OrderStatus.APPROVED):
            order_service.cancel_order(self.db, order, by_customer=True, at=at)
            self.stats["cancelled"] += 1

    def on_manager_reject(self, at: datetime, order_id: int) -> None:
        order = self.db.get(Order, order_id)
        if order.status in (OrderStatus.PENDING, OrderStatus.APPROVED):
            weights = [self.activity[m.id] for m in self.managers]
            manager = self.rng.choices(self.managers, weights)[0]
            order_service.reject_order(self.db, order, manager, "Delivery address is outside the service area", at)
            self.stats["rejected"] += 1

    def ship(self, order: Order, at: datetime, shipper: Employee) -> bool:
        try:
            with self.db.begin_nested():
                order_service.ship_order(self.db, order, shipper, at)
            self.stats["shipped"] += 1
            return True
        except HTTPException:
            return False

    def on_ship(self, at: datetime, payload) -> None:
        order_id, attempt = payload
        order = self.db.get(Order, order_id)
        if order.status != OrderStatus.APPROVED:
            return
        # Usually the assigned Worker; sometimes a colleague takes it over (the assigned one is ill or busy).
        assigned = self.db.get(Employee, order.assigned_to_id) if order.assigned_to_id else None
        shipper = assigned if assigned and self.rng.random() < 0.85 else self.team_worker()
        if not self.ship(order, at, shipper):
            # Should not happen (stock is reserved), but never leave an order stuck.
            if attempt >= 2:
                order_service.cancel_order(self.db, order, by_customer=False, at=at)
                self.stats["cancelled"] += 1
            else:
                self.schedule(at + timedelta(days=1), "ship", (order_id, attempt + 1))


def seed_demo(db: Session) -> None:
    if not settings.DEMO_PASSWORD:
        sys.exit("Set DEMO_PASSWORD in .env first")
    if db.scalar(select(Product.id).limit(1)) is not None:
        sys.exit("Demo data already exists. Use --demo --reset to recreate it (deletes ALL data).")

    rng = random.Random(2026)
    now = datetime.now(UTC)
    year_ago = now - timedelta(days=365)
    pw = hash_password(settings.DEMO_PASSWORD)

    categories = {name: Category(name=name) for name in CATEGORIES}
    suppliers = [Supplier(supplier_name=n, phone=ph, email=em) for n, ph, em in SUPPLIERS]
    db.add_all([*categories.values(), *suppliers])
    db.flush()
    for i, (name, cat, sup, price, min_qty, desc) in enumerate(PRODUCTS, start=1):
        db.add(Product(product_name=name, category=categories[cat], supplier=suppliers[sup],
                       unit_price=Decimal(price), min_quantity=min_qty, description=desc, quantity=0,
                       barcode=ean13(f"487000{i:06d}")))

    admin = db.scalars(select(User).where(User.role == Role.ADMIN)).first()
    for (m_name, m_email, m_phone), _, workers in TEAMS:
        m_user = _user(m_email, m_name, m_phone, Role.MANAGER, UserStatus.ACTIVE, pw, year_ago,
                       requested_role=Role.MANAGER)
        m_user.approved_by = admin
        m_user.employee = Employee(full_name=m_name, phone=m_phone, role=Role.MANAGER)
        db.add(m_user)
        db.flush()
        for w_name, w_email, w_phone in workers:
            w_user = _user(w_email, w_name, w_phone, Role.WORKER, UserStatus.ACTIVE, pw, year_ago,
                           requested_role=Role.WORKER)
            w_user.approved_by = admin
            w_user.employee = Employee(full_name=w_name, phone=w_phone, role=Role.WORKER,
                                       manager_id=m_user.employee.id)
            db.add(w_user)

    for name, email, phone, address in CUSTOMERS:
        c_user = _user(email, name, phone, Role.CUSTOMER, UserStatus.ACTIVE, pw,
                       year_ago + timedelta(days=rng.randint(0, 60)))
        c_user.customer = Customer(full_name=name, phone=phone, address=address, account=Account())
        db.add(c_user)

    for name, email, phone, role in PENDING_STAFF:
        db.add(_user(email, name, phone, role, UserStatus.PENDING, pw, now - timedelta(days=1), requested_role=role))
    db.commit()

    sim = Simulation(db, rng, year_ago, now)
    sim.run()
    print("Demo data:", dict(sim.stats))


def main() -> None:
    parser = argparse.ArgumentParser(description="KeyFive WMS seed")
    parser.add_argument("--demo", action="store_true", help="add demo shop data with one year of history")
    parser.add_argument("--reset", action="store_true", help="delete ALL data before seeding")
    parser.add_argument("--demo-if-empty", action="store_true",
                        help="add demo data only if there are no products yet (safe on every deploy)")
    args = parser.parse_args()

    with SessionLocal() as db:
        if args.reset:
            reset(db)
            print("All tables truncated")
        admin = ensure_first_admin(db)
        db.commit()
        print(f"First admin {settings.ADMIN_EMAIL} created" if admin else "Admin already exists")
        if args.demo:
            seed_demo(db)
        elif args.demo_if_empty:
            if db.scalar(select(Product.id).limit(1)) is not None:
                print("Data already exists, demo seed skipped")
            elif not settings.DEMO_PASSWORD:
                print("DEMO_PASSWORD is not set, demo seed skipped")
            else:
                seed_demo(db)


if __name__ == "__main__":
    main()
