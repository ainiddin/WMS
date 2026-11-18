from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.common import created_at_column
from app.models.device import StaffDevice
from app.models.user import User


class TwoFactorChallenge(Base):
    """One Admin sign in waiting for the email code.

    The browser/app holds a random challenge token; only its SHA-256 is stored, and only a bcrypt hash of the code.
    A code is tied to its challenge, so a code from another sign in never works.
    """

    __tablename__ = "two_factor_challenges"
    __table_args__ = (CheckConstraint("channel IN ('WEB', 'DEVICE')", name="chk_two_factor_channel"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    channel: Mapped[str] = mapped_column(String(10))
    device_id: Mapped[int | None] = mapped_column(ForeignKey("staff_devices.id", ondelete="CASCADE"))
    ip: Mapped[str | None] = mapped_column(String(45))
    code_hash: Mapped[str] = mapped_column(String(100))
    code_sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))  # the whole sign in, not one code
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_column()

    user: Mapped[User] = relationship()
    device: Mapped[StaffDevice | None] = relationship()
