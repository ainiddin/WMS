from django.db import transaction
from .models import Product, StockMovement


@transaction.atomic
def record_movement(product, employee, movement_type, quantity, customer=None, order=None, note=''):
    product = Product.objects.select_for_update().get(pk=product.pk)

    if movement_type == StockMovement.OUT:
        if product.quantity < quantity:
            raise ValueError(
                f'Insufficient stock: available {product.quantity}, requested {quantity}.'
            )
        if not customer:
            raise ValueError('OUT movement requires a customer.')
        product.quantity -= quantity
    else:
        if customer:
            raise ValueError('IN movement must not have a customer.')
        product.quantity += quantity

    product.save(update_fields=['quantity', 'last_updated'])

    movement = StockMovement.objects.create(
        product=product,
        employee=employee,
        customer=customer,
        order=order,
        movement_type=movement_type,
        quantity=quantity,
        note=note,
    )
    return movement
