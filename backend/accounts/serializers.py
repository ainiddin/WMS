from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import User


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name', 'password', 'password2']

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({'password': 'Passwords do not match.'})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password2')
        user = User.objects.create_user(
            **validated_data,
            role=User.CUSTOMER,
        )
        from inventory.models import Customer
        Customer.objects.create(
            user=user,
            customer_name=f'{user.first_name} {user.last_name}'.strip() or user.username,
            email=user.email,
        )
        return user


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role', 'is_active']
        read_only_fields = ['id']


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, default='wms1234!')

    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name', 'role', 'password']

    def create(self, validated_data):
        password = validated_data.pop('password', 'wms1234!')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        role = validated_data.get('role')
        if role in (User.MANAGER, User.WORKER):
            from inventory.models import Employee
            Employee.objects.create(
                user=user,
                full_name=f'{user.first_name} {user.last_name}'.strip() or user.username,
            )
        return user
