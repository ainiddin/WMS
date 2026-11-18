"""Staff join only by invitation.

- A Manager invites a WORKER into his own team, or a MANAGER (who gets a new team): "up to his own rank".
- The Admin sees and can revoke every invitation, but invites only to start a company with no active Manager.
- The invitee gets a 6-digit code by email (valid INVITATION_HOURS) and sets a password in the Staff app.
- Wrong codes are counted (INVITATION_MAX_ATTEMPTS, then the code is burnt) and also count as failed logins.
"""

import logging
import secrets
import smtplib
from datetime import timedelta

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.models import AuditAction, Employee, Invitation, Role, User, UserStatus
from app.models.common import utcnow
from app.services import assignment_service, audit_service, email_service

log = logging.getLogger("keyfive")

PENDING, ACCEPTED, REVOKED, EXPIRED = "PENDING", "ACCEPTED", "REVOKED", "EXPIRED"


def status_of(invitation: Invitation) -> str:
    if invitation.accepted_at:
        return ACCEPTED
    if invitation.revoked_at:
        return REVOKED
    if invitation.expires_at <= utcnow():
        return EXPIRED
    return PENDING


def _is_open(invitation: Invitation) -> bool:
    return invitation.accepted_at is None and invitation.revoked_at is None


def active_manager_exists(db: Session) -> bool:
    return db.scalar(
        select(Employee.id).join(User, Employee.user_id == User.id)
        .where(Employee.role == Role.MANAGER, Employee.is_active, User.status == UserStatus.ACTIVE).limit(1)
    ) is not None


def _send(invitation: Invitation) -> None:
    """New code for this invitation, mailed to the invitee. Caller commits."""
    code = f"{secrets.randbelow(1_000_000):06d}"
    now = utcnow()
    invitation.code_hash = hash_password(code)
    invitation.code_sent_at = now
    invitation.attempts = 0
    invitation.expires_at = now + timedelta(hours=settings.INVITATION_HOURS)
    inviter = invitation.invited_by
    if invitation.role == Role.WORKER:
        what = f"a Worker in the team of {invitation.team_manager.full_name}"
    else:
        what = "a Manager with your own team"
    try:
        email_service.send_email(
            invitation.email,
            f"KeyFive WMS: you are invited, code {code}",
            f"Hello {invitation.full_name},\n\n{inviter.full_name} invited you to KeyFive WMS as {what}.\n\n"
            f"Your invitation code: {code}\n"
            f"It is valid for {settings.INVITATION_HOURS} hours.\n\n"
            "Open the KeyFive Staff app on your work phone, choose \"I have an invitation\", enter this email, "
            "the code and a new password. If you did not expect this, ignore the email.",
        )
    except (httpx.HTTPError, smtplib.SMTPException, OSError) as exc:
        log.error("Could not send invitation to %s: %s", invitation.email, exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not send the invitation email, check the address") from None


def get(db: Session, invitation_id: int) -> Invitation:
    invitation = db.get(Invitation, invitation_id)
    if invitation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation not found")
    return invitation


def create(db: Session, inviter: User, email: str, full_name: str, role: Role, ip: str | None) -> Invitation:
    """Caller commits."""
    email = email.strip().lower()
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

    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This email is already registered")
    email_service.ensure_domain_accepts_mail(email)
    existing = db.scalars(
        select(Invitation).where(Invitation.email == email, Invitation.accepted_at.is_(None),
                                 Invitation.revoked_at.is_(None))
    ).one_or_none()
    if existing is not None:
        if existing.expires_at > utcnow():
            raise HTTPException(status.HTTP_409_CONFLICT, "This email already has an open invitation")
        existing.revoked_at = utcnow()  # an expired one is closed so a new one can be made
        db.flush()

    invitation = Invitation(email=email, full_name=full_name, role=role, team_manager=team, invited_by=inviter)
    db.add(invitation)
    _send(invitation)
    db.flush()
    audit_service.log(db, AuditAction.INVITE_SENT, inviter, None, ip, invitation_id=invitation.id, email=email,
                      role=str(role), team_manager_id=team.id if team else None)
    return invitation


def _check_owner(invitation: Invitation, user: User) -> None:
    """A Manager acts only on his own invitations; the Admin on all of them."""
    if user.role == Role.ADMIN:
        return
    if invitation.invited_by_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation not found")


def resend(db: Session, invitation: Invitation, user: User, ip: str | None) -> Invitation:
    _check_owner(invitation, user)
    if not _is_open(invitation):
        raise HTTPException(status.HTTP_409_CONFLICT, f"The invitation is {status_of(invitation).lower()}")
    wait = settings.INVITATION_RESEND_SECONDS - (utcnow() - invitation.code_sent_at).total_seconds()
    if wait > 0:
        seconds = int(wait) + 1
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, f"Wait {seconds} s before sending it again",
                            headers={"Retry-After": str(seconds)})
    _send(invitation)
    audit_service.log(db, AuditAction.INVITE_RESENT, user, None, ip, invitation_id=invitation.id, email=invitation.email)
    return invitation


def revoke(db: Session, invitation: Invitation, user: User, ip: str | None) -> Invitation:
    _check_owner(invitation, user)
    if not _is_open(invitation):
        raise HTTPException(status.HTTP_409_CONFLICT, f"The invitation is {status_of(invitation).lower()}")
    invitation.revoked_at = utcnow()
    invitation.revoked_by = user
    audit_service.log(db, AuditAction.INVITE_REVOKED, user, None, ip, invitation_id=invitation.id, email=invitation.email)
    return invitation


_BAD_CODE = "Wrong email or invitation code"


def accept(db: Session, email: str, code: str, password: str, phone: str | None, ip: str | None) -> User:
    """The invitee sets a password: the account is ACTIVE at once, in the right role and team. Caller commits.
    Wrong codes are saved (committed here) and an error is raised."""
    email = email.strip().lower()
    invitation = db.scalars(
        select(Invitation).where(Invitation.email == email, Invitation.accepted_at.is_(None),
                                 Invitation.revoked_at.is_(None))
    ).one_or_none()
    # Same answer for "no invitation" and "wrong code": nobody can probe who was invited.
    if invitation is None or not invitation.code_hash:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, _BAD_CODE)
    if not verify_password(code, invitation.code_hash):
        invitation.attempts += 1
        if invitation.attempts >= settings.INVITATION_MAX_ATTEMPTS:
            invitation.code_hash = ""  # burnt: only a new code from the Manager helps
        audit_service.log(db, AuditAction.INVITE_CODE_FAILED, None, None, ip, invitation_id=invitation.id,
                          email=email, attempt=invitation.attempts)
        db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, _BAD_CODE)
    # Only someone with the right code learns that the invitation exists but has expired.
    if invitation.expires_at <= utcnow():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The invitation has expired. Ask your Manager to send it again.")

    inviter = invitation.invited_by
    team = invitation.team_manager
    if inviter.status != UserStatus.ACTIVE:
        raise HTTPException(status.HTTP_409_CONFLICT, "This invitation is no longer valid. Ask for a new one.")
    if team is not None and (team.role != Role.MANAGER or not team.is_active):
        raise HTTPException(status.HTTP_409_CONFLICT, "That team no longer exists. Ask for a new invitation.")
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This email is already registered")

    now = utcnow()
    user = User(email=email, password_hash=hash_password(password), full_name=invitation.full_name, phone=phone,
                role=invitation.role, status=UserStatus.ACTIVE, approved_by_id=inviter.id, approved_at=now)
    user.employee = Employee(full_name=invitation.full_name, phone=phone, role=invitation.role,
                             manager_id=team.id if team else None)
    db.add(user)
    invitation.accepted_at = now
    db.flush()
    invitation.accepted_user_id = user.id
    audit_service.log(db, AuditAction.INVITE_ACCEPTED, user, user, ip, invitation_id=invitation.id,
                      role=invitation.role, invited_by=inviter.email, team_manager_id=team.id if team else None)
    if invitation.role == Role.WORKER:  # a new pair of hands: open orders are spread again
        assignment_service.rebalance(db)
    return user
