from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.common import created_at_column
from app.models.people import Employee
from app.models.user import User


class Invitation(Base):
    """A Manager invites a person by email. Staff can no longer sign up on their own.

    WORKER: joins the inviting Manager's team. MANAGER: gets a new team of his own.
    The person gets a 6-digit code (only its bcrypt hash is stored) and sets a password in the app.
    """

    __tablename__ = "invitations"
    __table_args__ = (
        CheckConstraint("role IN ('MANAGER', 'WORKER')", name="chk_invitations_role"),
        CheckConstraint("email = lower(email)", name="chk_invitations_email_lower"),
        CheckConstraint("(role = 'WORKER') = (team_manager_id IS NOT NULL)", name="chk_invitations_team"),
        # At most one open invitation per email.
        Index("uq_invitations_open_email", "email", unique=True,
              postgresql_where=text("accepted_at IS NULL AND revoked_at IS NULL")),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), index=True)
    full_name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(10))
    team_manager_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id", ondelete="RESTRICT"), index=True)
    invited_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    code_hash: Mapped[str] = mapped_column(String(100))
    code_sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = created_at_column()

    team_manager: Mapped[Employee | None] = relationship()
    invited_by: Mapped[User] = relationship(foreign_keys=[invited_by_id])
    revoked_by: Mapped[User | None] = relationship(foreign_keys=[revoked_by_id])
