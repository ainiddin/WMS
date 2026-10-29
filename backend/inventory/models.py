from django.db import models
from django.core.exceptions import ValidationError


class Supplier(models.Model):
    code = models.CharField(max_length=10, unique=True, editable=False)
    supplier_name = models.CharField(max_length=200)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'suppliers'
        ordering = ['code']

    def save(self, *args, **kwargs):
        if not self.code:
            last = Supplier.objects.order_by('-id').first()
            num = (last.id + 1) if last else 1
            self.code = f'S{num:03d}'
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.code} — {self.supplier_name}'


class Product(models.Model):
    code = models.CharField(max_length=10, unique=True, editable=False)
    product_name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    supplier = models.ForeignKey(
        Supplier, on_delete=models.PROTECT, related_name='products'
    )
    quantity = models.IntegerField(default=0)
    min_quantity = models.IntegerField(default=0)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    barcode = models.CharField(max_length=100, unique=True, blank=True, null=True)
    last_updated = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'products'
        ordering = ['code']
        constraints = [
            models.CheckConstraint(condition=models.Q(quantity__gte=0), name='chk_product_quantity_gte_0'),
            models.CheckConstraint(condition=models.Q(min_quantity__gte=0), name='chk_product_min_quantity_gte_0'),
            models.CheckConstraint(condition=models.Q(unit_price__gte=0), name='chk_product_unit_price_gte_0'),
        ]

    def save(self, *args, **kwargs):
        if not self.code:
            last = Product.objects.order_by('-id').first()
            num = (last.id + 1) if last else 1
            self.code = f'P{num:03d}'
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.code} — {self.product_name}'

    @property
    def below_minimum(self):
        return self.quantity < self.min_quantity


class Employee(models.Model):
    code = models.CharField(max_length=10, unique=True, editable=False)
    user = models.OneToOneField(
        'accounts.User', on_delete=models.PROTECT, related_name='employee', null=True, blank=True
    )
    full_name = models.CharField(max_length=200)
    phone = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'employees'
        ordering = ['code']

    def save(self, *args, **kwargs):
        if not self.code:
            last = Employee.objects.order_by('-id').first()
            num = (last.id + 1) if last else 1
            self.code = f'E{num:03d}'
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.code} — {self.full_name}'


class Customer(models.Model):
    code = models.CharField(max_length=10, unique=True, editable=False)
    user = models.OneToOneField(
        'accounts.User', on_delete=models.PROTECT, related_name='customer', null=True, blank=True
    )
    customer_name = models.CharField(max_length=200)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'customers'
        ordering = ['code']

    def save(self, *args, **kwargs):
        if not self.code:
            last = Customer.objects.order_by('-id').first()
            num = (last.id + 1) if last else 1
            self.code = f'C{num:03d}'
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.code} — {self.customer_name}'


class StockMovement(models.Model):
    IN = 'IN'
    OUT = 'OUT'
    TYPE_CHOICES = [(IN, 'IN'), (OUT, 'OUT')]

    code = models.CharField(max_length=10, unique=True, editable=False)
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='movements')
    employee = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name='movements')
    customer = models.ForeignKey(
        Customer, on_delete=models.PROTECT, related_name='movements', null=True, blank=True
    )
    order = models.ForeignKey(
        'sales.Order', on_delete=models.SET_NULL, related_name='movements', null=True, blank=True
    )
    movement_type = models.CharField(max_length=3, choices=TYPE_CHOICES)
    quantity = models.IntegerField()
    movement_time = models.DateTimeField(auto_now_add=True)
    note = models.CharField(max_length=300, blank=True)

    class Meta:
        db_table = 'stock_movements'
        ordering = ['-movement_time']
        constraints = [
            models.CheckConstraint(condition=models.Q(quantity__gt=0), name='chk_movement_quantity_gt_0'),
        ]

    def clean(self):
        if self.movement_type == self.OUT and not self.customer_id:
            raise ValidationError('OUT movement must have a customer.')
        if self.movement_type == self.IN and self.customer_id:
            raise ValidationError('IN movement must not have a customer.')

    def save(self, *args, **kwargs):
        if not self.code:
            last = StockMovement.objects.order_by('-id').first()
            num = (last.id + 1) if last else 1
            self.code = f'M{num:04d}'
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.code} {self.movement_type} {self.product.code} x{self.quantity}'
