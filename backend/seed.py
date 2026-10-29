"""
Run: python seed.py
Creates demo data for all roles.
"""
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from accounts.models import User
from inventory.models import Supplier, Product, Employee, Customer, StockMovement
from inventory.services import record_movement

print("Seeding database...")

# --- Users ---
def make_user(username, role, password='wms1234!', **kw):
    u, created = User.objects.get_or_create(username=username, defaults={'role': role, **kw})
    if created:
        u.set_password(password)
        u.save()
    return u

admin = make_user('admin', User.ADMIN, email='admin@wms.kz', first_name='Admin', is_staff=True, is_superuser=True)
manager_user = make_user('manager', User.MANAGER, email='manager@wms.kz', first_name='Ainiddin', last_name='Yessirkep')
worker_user = make_user('worker', User.WORKER, email='worker@wms.kz', first_name='Aibar', last_name='Naimankhan')
customer_user = make_user('customer', User.CUSTOMER, email='customer@wms.kz', first_name='Alua', last_name='Korganbek')

# --- Suppliers ---
def make_supplier(name, phone, email):
    s, _ = Supplier.objects.get_or_create(supplier_name=name, defaults={'phone': phone, 'email': email})
    return s

sup1 = make_supplier('TechParts LLP', '+7 701 111 1111', 'tech@parts.kz')
sup2 = make_supplier('AlmatySupply Co.', '+7 702 222 2222', 'supply@almaty.kz')
sup3 = make_supplier('KazImport Ltd', '+7 703 333 3333', 'kaz@import.kz')

# --- Employees ---
def make_employee(user, full_name, phone=''):
    e, _ = Employee.objects.get_or_create(user=user, defaults={'full_name': full_name, 'phone': phone})
    return e

emp_manager = make_employee(manager_user, 'Ainiddin Yessirkep', '+7 705 123 4567')
emp_worker = make_employee(worker_user, 'Aibar Naimankhan', '+7 706 987 6543')
emp_admin = Employee.objects.filter(user=admin).first()
if not emp_admin:
    emp_admin = Employee.objects.create(user=admin, full_name='Admin User')

# --- Products ---
def make_product(name, supplier, qty, min_qty, price, barcode=None, desc=''):
    p, _ = Product.objects.get_or_create(
        product_name=name,
        defaults={'supplier': supplier, 'quantity': qty, 'min_quantity': min_qty,
                  'unit_price': price, 'barcode': barcode, 'description': desc}
    )
    return p

p1 = make_product('Laptop Stand Pro', sup1, 45, 10, 12500, '8001234001', 'Ergonomic aluminum laptop stand')
p2 = make_product('USB-C Hub 7-in-1', sup1, 8, 15, 7800, '8001234002', 'USB-C hub with HDMI, USB 3.0, SD card')
p3 = make_product('Wireless Keyboard', sup2, 30, 10, 18900, '8001234003', 'Compact wireless keyboard')
p4 = make_product('Monitor 27" 4K', sup2, 3, 5, 185000, '8001234004', '4K IPS monitor 27 inch')
p5 = make_product('Office Chair Ergo', sup3, 12, 5, 65000, '8001234005', 'Ergonomic office chair with lumbar support')

# --- Customers ---
def make_customer(user, name, phone='', email='', address=''):
    c, _ = Customer.objects.get_or_create(
        user=user,
        defaults={'customer_name': name, 'phone': phone, 'email': email, 'address': address}
    )
    return c

cust1 = make_customer(customer_user, 'Alua Korganbek', '+7 707 111 2222', 'alua@mail.kz', 'Almaty, Alatau district')
# Extra customers without user accounts
cust2, _ = Customer.objects.get_or_create(customer_name='Dala Corp', defaults={'phone': '+7 700 555 7777', 'email': 'dala@corp.kz', 'address': 'Astana, Esil district'})
cust3, _ = Customer.objects.get_or_create(customer_name='Zhalyn LLP', defaults={'phone': '+7 701 444 8888', 'email': 'zhalyn@llp.kz', 'address': 'Almaty, Medeu district'})

# --- Stock IN movements (initial stock) ---
if StockMovement.objects.count() == 0:
    for product, qty in [(p1, 50), (p2, 20), (p3, 40), (p4, 10), (p5, 20)]:
        # Reset quantity first
        product.quantity = 0
        product.save(update_fields=['quantity', 'last_updated'])
        record_movement(product, emp_manager, StockMovement.IN, qty, note='Initial stock')

    # Some OUT movements
    record_movement(p1, emp_worker, StockMovement.OUT, 5, customer=cust2, note='Test order')
    record_movement(p3, emp_worker, StockMovement.OUT, 10, customer=cust3, note='Bulk order')
    record_movement(p5, emp_worker, StockMovement.OUT, 8, customer=cust2, note='Office refurb')

print("Done! Users created:")
print("  admin / wms1234!  (role: ADMIN)")
print("  manager / wms1234!  (role: MANAGER)")
print("  worker / wms1234!  (role: WORKER)")
print("  customer / wms1234!  (role: CUSTOMER)")
print(f"\nProducts: {Product.objects.count()}, Suppliers: {Supplier.objects.count()}, Movements: {StockMovement.objects.count()}")
