from django.db import models
from django.utils import timezone


class Order(models.Model):
    PENDING = 'PENDING'
    APPROVED = 'APPROVED'
    REJECTED = 'REJECTED'
    SHIPPED = 'SHIPPED'
    CANCELLED = 'CANCELLED'
    STATUS_CHOICES = [
        (PENDING, 'Pending'),
        (APPROVED, 'Approved'),
        (REJECTED, 'Rejected'),
        (SHIPPED, 'Shipped'),
        (CANCELLED, 'Cancelled'),
    ]

    code = models.CharField(max_length=10, unique=True, editable=False)
    customer = models.ForeignKey(
        'inventory.Customer', on_delete=models.PROTECT, related_name='orders'
    )
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    approved_by = models.ForeignKey(
        'inventory.Employee', on_delete=models.SET_NULL,
        related_name='approved_orders', null=True, blank=True
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    shipped_at = models.DateTimeField(null=True, blank=True)
    comment = models.TextField(blank=True)

    class Meta:
        db_table = 'orders'
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.code:
            last = Order.objects.order_by('-id').first()
            num = (last.id + 1) if last else 1
            self.code = f'O{num:04d}'
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.code} [{self.status}]'

    @property
    def total(self):
        return sum(item.subtotal for item in self.items.all())


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(
        'inventory.Product', on_delete=models.PROTECT, related_name='order_items'
    )
    quantity = models.IntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = 'order_items'
        unique_together = [('order', 'product')]
        constraints = [
            models.CheckConstraint(condition=models.Q(quantity__gt=0), name='chk_orderitem_quantity_gt_0'),
            models.CheckConstraint(condition=models.Q(unit_price__gte=0), name='chk_orderitem_unit_price_gte_0'),
        ]

    @property
    def subtotal(self):
        return self.quantity * self.unit_price

    def __str__(self):
        return f'{self.order.code} / {self.product.code} x{self.quantity}'
