"""On the phone: answer website sign ins of this account ("Is this you?").

Kept outside /api/auth/ so the app refreshes its token for these calls like for any other screen.
"""

from fastapi import APIRouter, HTTPException, status

from app.core.deps import DB, ClientIP, CurrentUser
from app.schemas.auth import PendingWebLogin, WebLoginDecision
from app.services import web_login_service

router = APIRouter(prefix="/api/web-logins", tags=["auth"])


@router.get("/", response_model=list[PendingWebLogin])
def pending(db: DB, user: CurrentUser):
    """Website sign ins of this account waiting for an answer (the app checks while it is open)."""
    return [PendingWebLogin(id=r.id, created_at=r.created_at, expires_at=r.expires_at, ip=r.ip,
                            user_agent=r.user_agent, choices=[int(c) for c in r.choices.split(",")])
            for r in web_login_service.pending_for(db, user)]


@router.post("/{request_id}/approve/", status_code=status.HTTP_204_NO_CONTENT)
def approve(request_id: int, data: WebLoginDecision, db: DB, user: CurrentUser, ip: ClientIP):
    """The number tapped on the phone. A wrong number rejects the request (not just "try again")."""
    req = web_login_service.decide(db, request_id, user, user.device_id, data.number, ip)
    db.commit()
    if req.status != web_login_service.APPROVED:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "Wrong number: the sign in was rejected. If it was you, sign in again in the browser.")


@router.post("/{request_id}/deny/", status_code=status.HTTP_204_NO_CONTENT)
def deny(request_id: int, db: DB, user: CurrentUser, ip: ClientIP):
    """"No, it was not me": someone knows the password. Change it."""
    web_login_service.decide(db, request_id, user, user.device_id, None, ip)
    db.commit()
