from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    ADMIN = 'ADMIN'
    MANAGER = 'MANAGER'
    WORKER = 'WORKER'
    CUSTOMER = 'CUSTOMER'
    ROLE_CHOICES = [
        (ADMIN, 'Admin'),
        (MANAGER, 'Manager'),
        (WORKER, 'Worker'),
        (CUSTOMER, 'Customer'),
    ]
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default=CUSTOMER)

    class Meta:
        db_table = 'users'

    def __str__(self):
        return f'{self.username} ({self.role})'
