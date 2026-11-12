from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.common import DeviceStatus, created_at_column, in_check
from app.models.user import User


class StaffDevice(Base):
    """A phone with the KeyFive Staff app on which a staff member may sign in.

    Staff never sign in on the website. The app keeps a random secret; only its SHA-256 hash is stored here.
    A new phone is PENDING until an Admin approves it, so a leaked email + password alone does not open the system.
    """

    __tablename__ = "staff_devices"
    __table_args__ = (
        CheckConstraint(in_check("status", DeviceStatus), name="chk_staff_devices_status"),
        UniqueConstraint("user_id", "secret_hash", name="uq_staff_devices_user_secret"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    secret_hash: Mapped[str] = mapped_column(String(64))
    device_name: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[datetime] = created_at_column()
    approved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(foreign_keys=[user_id])
    approved_by: Mapped[User | None] = relationship(foreign_keys=[approved_by_id])
