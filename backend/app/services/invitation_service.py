"""Staff join only by invitation LINK.

- A Manager invites a WORKER into his own team, or a MANAGER (who gets a new team): "up to his own rank".
- The Admin sees and can revoke every link, but creates one only to start a company with no active Manager.
- A link carries a random token (only its SHA-256 is stored), works ONCE and lives INVITATION_LINK_MINUTES.
- The person opens it on the website and types first and last name, work email, phone and a password; the account
  is ACTIVE at once in the right role and team, and gets its employee id. Then: sign in in the Staff app, where
  the new phone waits for the Manager's approval (a second gate if a link reached the wrong person).
"""

import hashlib
import secrets
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models import AuditAction, Employee, Invitation, Role, User, UserStatus
from app.models.common import utcnow
from app.services import assignment_service, audit_service

PENDING, ACCEPTED, REVOKED, EXPIRED = "PENDING", "ACCEPTED", "REVOKED", "EXPIRED"
JOIN_PATH = "/join/"
# The same answer for an unknown, used, revoked or expired link: a guess learns nothing.
_LINK_GONE = "This invitation link is not valid or has expired. Ask your Manager for a new one."


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def status_of(invitation: Invitation) -> str:
    if invitation.accepted_at:
        return ACCEPTED
    if invitation.revoked_at:
        return REVOKED
    if invitation.expires_at <= utcnow():
        return EXPIRED
    return PENDING


def active_manager_exists(db: Session) -> bool:
    return db.scalar(
        select(Employee.id).join(User, Employee.user_id == User.id)
        .where(Employee.role == Role.MANAGER, Employee.is_active, User.status == UserStatus.ACTIVE).limit(1)
    ) is not None


def get(db: Session, invitation_id: int) -> Invitation:
    invitation = db.get(Invitation, invitation_id)
    if invitation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation not found")
    return invitation


def create(db: Session, inviter: User, role: Role, ip: str | None) -> tuple[str, Invitation]:
    """A new link. Returns (the path with the token, shown ONCE; the row). Caller commits."""
    if inviter.role == Role.MANAGER:
        if role not in (Role.WORKER, Role.MANAGER):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "A Manager can invite only Workers and Managers")
        team = inviter.employee if role == Role.WORKER else None
    elif inviter.role == Role.ADMIN:
        # The Admin is not part of the normal flow; he only starts a company that has no Manager yet.
        if role != Role.MANAGER or active_manager_exists(db):
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                                "Managers invite staff. The Admin can invite only the first Manager.")
        team = None
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only Managers invite staff")

    token = secrets.token_urlsafe(32)
    invitation = Invitation(token_hash=_hash(token), role=role, team_manager=team, invited_by=inviter,
                            expires_at=utcnow() + timedelta(minutes=settings.INVITATION_LINK_MINUTES))
    db.add(invitation)
    db.flush()
    audit_service.log(db, AuditAction.INVITE_SENT, inviter, None, ip, invitation_id=invitation.id,
                      role=str(role), team_manager_id=team.id if team else None, by="link")
    return JOIN_PATH + token, invitation


def _check_owner(invitation: Invitation, user: User) -> None:
    """A Manager acts only on his own links; the Admin on all of them."""
    if user.role == Role.ADMIN:
        return
    if invitation.invited_by_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation not found")


def revoke(db: Session, invitation: Invitation, user: User, ip: str | None) -> Invitation:
    _check_owner(invitation, user)
    if status_of(invitation) != PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, f"The invitation is {status_of(invitation).lower()}")
    invitation.revoked_at = utcnow()
    invitation.revoked_by = user
    audit_service.log(db, AuditAction.INVITE_REVOKED, user, None, ip, invitation_id=invitation.id)
    return invitation


def open_link(db: Session, token: str, *, lock: bool = False) -> Invitation:
    """The invitation of a link that can still be used, or 404 with one answer for every other case."""
    stmt = select(Invitation).where(Invitation.token_hash == _hash(token))
    if lock:  # two people with the same link at the same moment: the second waits and then finds it used
        stmt = stmt.with_for_update()
    invitation = db.scalars(stmt).one_or_none()
    if invitation is None or status_of(invitation) != PENDING:
        raise HTTPException(status.HTTP_404_NOT_FOUND, _LINK_GONE)
    _check_still_valid(invitation)
    return invitation


def _check_still_valid(invitation: Invitation) -> None:
    inviter, team = invitation.invited_by, invitation.team_manager
    if inviter.status != UserStatus.ACTIVE:
        raise HTTPException(status.HTTP_404_NOT_FOUND, _LINK_GONE)
    if team is not None and (team.role != Role.MANAGER or not team.is_active):
        raise HTTPException(status.HTTP_404_NOT_FOUND, _LINK_GONE)


def accept(db: Session, token: str, first_name: str, last_name: str, email: str, phone: str, password: str,
           ip: str | None) -> User:
    """The person fills in the form: an ACTIVE account in the right role and team, with an employee id.
    The link is used up. Caller commits."""
    invitation = open_link(db, token, lock=True)
    email = email.strip().lower()
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This email is already registered")

    now = utcnow()
    full_name = f"{first_name} {last_name}"
    team = invitation.team_manager
    inviter = invitation.invited_by
    user = User(email=email, password_hash=hash_password(password), full_name=full_name, phone=phone,
                role=invitation.role, status=UserStatus.ACTIVE, approved_by_id=inviter.id, approved_at=now)
    user.employee = Employee(full_name=full_name, phone=phone, role=invitation.role,
                             manager_id=team.id if team else None)
    db.add(user)
    db.flush()
    invitation.accepted_at = now
    invitation.accepted_user_id = user.id
    audit_service.log(db, AuditAction.INVITE_ACCEPTED, user, user, ip, invitation_id=invitation.id,
                      role=invitation.role, invited_by=inviter.email, team_manager_id=team.id if team else None)
    if invitation.role == Role.WORKER:  # a new pair of hands: open orders are spread again
        assignment_service.rebalance(db)
    return user
