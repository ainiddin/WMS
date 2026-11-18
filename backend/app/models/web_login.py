from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.common import created_at_column
from app.models.device import StaffDevice
from app.models.user import User


class WebLoginRequest(Base):
    """A website sign in waiting for "Is this you?" on the person's approved phone (like Steam Guard).

    The browser shows `number`; the phone shows `choices` (three numbers, one of them right). A wrong pick
    rejects the request, so someone who knows the password cannot get in by spamming requests until a tired
    person taps "yes". The browser holds a random token; only its SHA-256 is stored.
    """

    __tablename__ = "web_login_requests"
    __table_args__ = (
        CheckConstraint("status IN ('PENDING', 'APPROVED', 'DENIED', 'USED', 'CLOSED')",
                        name="chk_web_login_status"),
        CheckConstraint("number BETWEEN 10 AND 99", name="chk_web_login_number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    choices: Mapped[str] = mapped_column(String(20))  # e.g. "83,47,12", already shuffled
    status: Mapped[str] = mapped_column(String(10), default="PENDING", server_default="PENDING")
    ip: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = created_at_column()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_device_id: Mapped[int | None] = mapped_column(ForeignKey("staff_devices.id", ondelete="SET NULL"))

    user: Mapped[User] = relationship()
    decided_device: Mapped[StaffDevice | None] = relationship()
