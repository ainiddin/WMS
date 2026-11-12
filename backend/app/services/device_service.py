import hashlib

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DeviceStatus, Role, StaffDevice, User
from app.models.common import utcnow


def hash_secret(secret: str) -> str:
    # The secret is 32 random bytes made by the app, so a plain SHA-256 is enough (no brute force possible).
    return hashlib.sha256(secret.encode()).hexdigest()


def _admin_phone_exists(db: Session) -> bool:
    stmt = (
        select(StaffDevice.id)
        .join(User, StaffDevice.user_id == User.id)
        .where(User.role == Role.ADMIN, StaffDevice.status == DeviceStatus.APPROVED)
        .limit(1)
    )
    return db.scalar(stmt) is not None


def check_in(db: Session, user: User, secret: str, device_name: str) -> StaffDevice:
    """Staff sign in: the phone must be APPROVED. An unknown phone is registered as PENDING and refused.

    The very first Admin phone is approved at once, otherwise nobody could approve anything.
    """
    device = db.scalars(
        select(StaffDevice).where(StaffDevice.user_id == user.id, StaffDevice.secret_hash == hash_secret(secret))
    ).one_or_none()
    if device is None:
        device = StaffDevice(user_id=user.id, secret_hash=hash_secret(secret), device_name=device_name,
                             status=DeviceStatus.PENDING)
        if user.role == Role.ADMIN and not _admin_phone_exists(db):
            device.status = DeviceStatus.APPROVED
            device.approved_at = utcnow()
        db.add(device)
        db.flush()
    if device.status == DeviceStatus.PENDING:
        db.commit()  # keep the request so the Admin sees it
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "This phone is waiting for admin approval. Ask the Admin to approve it, then sign in again.")
    if device.status == DeviceStatus.REVOKED:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This phone is blocked for your account")
    device.last_seen_at = utcnow()
    return device


def get_device(db: Session, device_id: int) -> StaffDevice:
    device = db.get(StaffDevice, device_id)
    if device is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found")
    return device


def approve(device: StaffDevice, admin: User) -> StaffDevice:
    if device.status == DeviceStatus.APPROVED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Device is already approved")
    device.status = DeviceStatus.APPROVED
    device.approved_by_id = admin.id
    device.approved_at = utcnow()
    return device


def revoke(device: StaffDevice, admin: User, current_device_id: int | None) -> StaffDevice:
    if device.id == current_device_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot block the phone you are using")
    if device.status == DeviceStatus.REVOKED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Device is already blocked")
    device.status = DeviceStatus.REVOKED
    device.approved_by_id = admin.id
    device.approved_at = utcnow()
    return device
