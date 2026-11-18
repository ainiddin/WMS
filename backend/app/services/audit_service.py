"""Audit log: every security-relevant action is written in the same transaction as the action itself,
so an action without its log row (or the other way round) cannot happen."""

from sqlalchemy.orm import Session

from app.models import AuditAction, AuditLog, User


def log(
    db: Session,
    action: AuditAction,
    actor: User | None,
    target: User | None = None,
    ip: str | None = None,
    **details,
) -> AuditLog:
    row = AuditLog(
        action=action,
        actor_id=actor.id if actor else None,
        actor_email=actor.email if actor else None,
        target_user_id=target.id if target else None,
        target_email=target.email if target else None,
        ip=ip,
        details=details,
    )
    db.add(row)
    return row
