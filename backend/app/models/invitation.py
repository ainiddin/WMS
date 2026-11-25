from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.common import created_at_column
from app.models.people import Employee
from app.models.user import User


class Invitation(Base):
    """An invitation LINK. Staff cannot sign up on their own: a Manager creates a link and sends it (any messenger).

    WORKER: joins the inviting Manager's team. MANAGER: gets a new team of his own.
    The link carries a random token; only its SHA-256 is stored. It works once and lives INVITATION_LINK_MINUTES.
    The person types the name, work email, phone and a password on the website and gets an employee id.
    """

    __tablename__ = "invitations"
    __table_args__ = (
        CheckConstraint("role IN ('MANAGER', 'WORKER')", name="chk_invitations_role"),
        CheckConstraint("(role = 'WORKER') = (team_manager_id IS NOT NULL)", name="chk_invitations_team"),
        CheckConstraint("(accepted_at IS NULL) = (accepted_user_id IS NULL)", name="chk_invitations_accepted"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    role: Mapped[str] = mapped_column(String(10))
    team_manager_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id", ondelete="RESTRICT"), index=True)
    invited_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = created_at_column()

    team_manager: Mapped[Employee | None] = relationship()
    invited_by: Mapped[User] = relationship(foreign_keys=[invited_by_id])
    accepted_user: Mapped[User | None] = relationship(foreign_keys=[accepted_user_id])
    revoked_by: Mapped[User | None] = relationship(foreign_keys=[revoked_by_id])
