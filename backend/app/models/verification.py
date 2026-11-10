from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class EmailVerification(Base):
    """One-time sign-up code sent to an email. The row is deleted once the account is created."""

    __tablename__ = "email_verifications"

    email: Mapped[str] = mapped_column(String(254), primary_key=True)
    code_hash: Mapped[str] = mapped_column(String(100))
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
