from datetime import datetime
from enum import StrEnum

from sqlalchemy import DDL, ForeignKey, String, event
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.common import created_at_column


class AuditAction(StrEnum):
    """What happened. Kept as text, so new actions need no migration."""

    USER_APPROVED = "USER_APPROVED"
    USER_REJECTED = "USER_REJECTED"
    USER_BLOCKED = "USER_BLOCKED"
    USER_UNBLOCKED = "USER_UNBLOCKED"
    ROLE_CHANGED = "ROLE_CHANGED"
    TEAM_CHANGED = "TEAM_CHANGED"
    LOGIN_TIMER_CLEARED = "LOGIN_TIMER_CLEARED"
    DEVICE_APPROVED = "DEVICE_APPROVED"
    DEVICE_REVOKED = "DEVICE_REVOKED"
    TWO_FACTOR_CODE_SENT = "TWO_FACTOR_CODE_SENT"
    TWO_FACTOR_FAILED = "TWO_FACTOR_FAILED"
    TWO_FACTOR_PASSED = "TWO_FACTOR_PASSED"
    PASSWORD_CHANGED = "PASSWORD_CHANGED"
    INVITE_SENT = "INVITE_SENT"
    INVITE_RESENT = "INVITE_RESENT"
    INVITE_REVOKED = "INVITE_REVOKED"
    INVITE_ACCEPTED = "INVITE_ACCEPTED"
    INVITE_CODE_FAILED = "INVITE_CODE_FAILED"


class AuditLog(Base):
    """Who did what to whom, when and from which IP. For security analysis (SOC).

    Rows are only ever added: there is no API to change them, and PostgreSQL itself refuses UPDATE and DELETE
    (trigger trg_audit_log_append_only). Emails are copied, so a row stays readable whatever happens to the user.
    """

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = created_at_column()
    action: Mapped[str] = mapped_column(String(40), index=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    actor_email: Mapped[str | None] = mapped_column(String(254))
    target_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    target_email: Mapped[str | None] = mapped_column(String(254))
    ip: Mapped[str | None] = mapped_column(String(45))
    details: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")


APPEND_ONLY_SQL = """
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
"""

# Tests build the schema with create_all, so the trigger is attached to the table, not only to the migration.
event.listen(AuditLog.__table__, "after_create", DDL(APPEND_ONLY_SQL))
