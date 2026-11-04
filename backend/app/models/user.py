from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.common import Role, UserStatus, created_at_column, in_check


class User(Base):
    """Login account. Customers become ACTIVE at sign up; staff wait for an Admin (PENDING)."""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(in_check("role", Role), name="chk_users_role"),
        CheckConstraint(in_check("status", UserStatus), name="chk_users_status"),
        CheckConstraint(
            "requested_role IS NULL OR requested_role IN ('MANAGER', 'WORKER')", name="chk_users_requested_role"
        ),
        CheckConstraint("email = lower(email)", name="chk_users_email_lower"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    full_name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(30))
    role: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(10))
    requested_role: Mapped[str | None] = mapped_column(String(10))
    approved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_column()

    approved_by: Mapped["User | None"] = relationship(remote_side=[id])
    employee: Mapped["Employee | None"] = relationship(back_populates="user")  # noqa: F821
    customer: Mapped["Customer | None"] = relationship(back_populates="user")  # noqa: F821
