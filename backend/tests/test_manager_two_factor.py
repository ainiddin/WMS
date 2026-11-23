"""Managers sign in with two factors, like Admins:
- website: the password, then the phone approves (number) or the sign in code (goes to the owner's channel);
- app: a new phone is approved by the code once (no Admin needed); Workers' phones still wait for approval;
- a Manager's website session lasts REFRESH_TOKEN_DAYS and every refresh renews it (an Admin keeps 4 hours, hard).
"""

from datetime import timedelta

import jwt
import pytest

from app.core.config import settings
from app.models.common import utcnow
from tests.conftest import CORPORATE, OUTBOX, PASSWORD, admin_web_login, last_code, staff_login
from tests.test_audit import audit


def verify(client, token, code):
    return client.post("/api/auth/2fa/verify/", json={"challenge_token": token, "code": code})


def claims(tokens: dict) -> dict:
    return jwt.decode(tokens["access_token"], options={"verify_signature": False})


def refresh(client, tokens: dict):
    return client.post("/api/auth/refresh/", json={"refresh_token": tokens["refresh_token"]})


@pytest.fixture
def boss(api):
    phone, emp_id = api.staff("boss@wms.kz", "MANAGER")  # new phone, approved by the code
    return {"phone": phone, "id": emp_id}


def new_manager(api, boss, email="fresh@wms.kz"):
    assert api.invite(boss["phone"], email, "MANAGER").status_code == 201
    assert api.accept(email).status_code == 201


def code_web_login(client, email):
    started = client.post("/api/auth/web/login/", json={"email": email, "password": PASSWORD}).json()
    r = client.post("/api/auth/web/email-code/", json={"request_token": started["request_token"]})
    assert r.status_code == 200, r.text
    r = verify(client, r.json()["challenge_token"], last_code(CORPORATE))
    assert r.status_code == 200, r.text
    return r.json()


# ---------------- the app: a new Manager phone ----------------
def test_a_new_manager_phone_is_approved_by_the_code_not_by_the_admin(client, api, boss):
    new_manager(api, boss)
    r = staff_login(client, "fresh@wms.kz", phone="fresh phone")
    assert r.status_code == 202, r.text
    assert "access_token" not in r.text
    admin = api.admin
    phones = client.get("/api/admin/devices/?status=PENDING", headers=admin).json()
    assert [d["user_email"] for d in phones] == ["fresh@wms.kz"]  # not approved before the code

    text = OUTBOX[CORPORATE][-1]
    assert "Manager sign in code:" in text and "Account: fresh@wms.kz" in text and 'the phone "Test phone"' in text
    assert not any("sign in code" in t for t in OUTBOX["fresh@wms.kz"])  # never to the Manager himself
    code = last_code(CORPORATE)
    wrong = f"{(int(code) + 1) % 1_000_000:06d}"
    challenge = r.json()["challenge_token"]
    assert verify(client, challenge, wrong).status_code == 400
    assert client.get("/api/admin/devices/?status=PENDING", headers=admin).json() != []  # a wrong code approves nothing

    r = verify(client, challenge, code)
    assert r.status_code == 200, r.text
    assert claims(r.json())["dev"]  # a phone token
    assert client.get("/api/admin/devices/?status=PENDING", headers=admin).json() == []
    rows = [row for row in audit(client, admin, action="DEVICE_APPROVED") if row["target_email"] == "fresh@wms.kz"]
    assert len(rows) == 1
    assert rows[0]["actor_email"] == "fresh@wms.kz" and rows[0]["details"]["by"] == "two_factor_code"
    assert client.get("/api/team/members/", headers={"Authorization": f"Bearer {r.json()['access_token']}"}
                      ).status_code == 200

    sent = len(OUTBOX[CORPORATE])
    assert staff_login(client, "fresh@wms.kz", phone="fresh phone").status_code == 200  # once per phone
    assert len(OUTBOX[CORPORATE]) == sent


def test_a_blocked_manager_phone_never_gets_a_code(client, api, boss):
    new_manager(api, boss)
    assert staff_login(client, "fresh@wms.kz", phone="lost phone").status_code == 202
    admin = api.admin
    device = client.get("/api/admin/devices/?status=PENDING", headers=admin).json()[0]
    assert client.post(f"/api/admin/devices/{device['id']}/revoke/", headers=admin).status_code == 200
    sent = len(OUTBOX[CORPORATE])
    r = staff_login(client, "fresh@wms.kz", phone="lost phone")
    assert r.status_code == 403 and r.json()["detail"] == "This phone is blocked for your account"
    assert len(OUTBOX[CORPORATE]) == sent


def test_a_phone_blocked_while_its_code_travels_is_not_approved(client, api, boss):
    new_manager(api, boss)
    r = staff_login(client, "fresh@wms.kz", phone="lost phone")
    admin = api.admin
    device = client.get("/api/admin/devices/?status=PENDING", headers=admin).json()[0]
    assert client.post(f"/api/admin/devices/{device['id']}/revoke/", headers=admin).status_code == 200
    assert verify(client, r.json()["challenge_token"], last_code(CORPORATE)).status_code == 403
    assert client.get("/api/admin/devices/?status=REVOKED", headers=admin).json()[0]["id"] == device["id"]


def test_a_worker_phone_still_waits_for_approval_and_gets_no_code(client, api, boss):
    assert api.invite(boss["phone"], "w@wms.kz", "WORKER").status_code == 201
    assert api.accept("w@wms.kz").status_code == 201
    sent = len(OUTBOX.get(CORPORATE, []))
    r = staff_login(client, "w@wms.kz")
    assert r.status_code == 403 and "waiting for admin approval" in r.json()["detail"]
    assert len(OUTBOX.get(CORPORATE, [])) == sent


def test_an_old_manager_phone_without_the_code_must_pass_it_once(client, api, boss, db):
    """Phones approved before Managers had the code: their tokens stop, the next sign in asks the code once."""
    from sqlalchemy import text
    db.execute(text("UPDATE staff_devices SET two_factor_at = NULL"
                    " WHERE user_id = (SELECT id FROM users WHERE email = 'boss@wms.kz')"))
    db.commit()
    r = client.get("/api/team/members/", headers=boss["phone"])
    assert r.status_code == 403 and "has not passed" in r.json()["detail"]
    admin = api.admin
    approvals = len(audit(client, admin, action="DEVICE_APPROVED"))
    r = staff_login(client, "boss@wms.kz")
    assert r.status_code == 202
    assert verify(client, r.json()["challenge_token"], last_code(CORPORATE)).status_code == 200
    # Already approved: the code only marks it, it is not "approved again" (no new log row, approver kept).
    assert len(audit(client, admin, action="DEVICE_APPROVED")) == approvals


def test_the_admin_code_on_a_phone_does_not_approve_anything(client, api):
    admin = api.admin  # first Admin phone: approved at once, then the code once
    assert audit(client, admin, action="DEVICE_APPROVED") == []


# ---------------- the website session ----------------
def test_manager_website_session_is_renewed_by_refresh(client, boss, monkeypatch):
    tokens = code_web_login(client, "boss@wms.kz")
    first = claims(tokens)
    assert "dev" not in first
    assert first["web"] - first["iat"] == pytest.approx(settings.REFRESH_TOKEN_DAYS * 86400, abs=5)

    later = utcnow() + timedelta(days=3)
    monkeypatch.setattr("app.services.web_login_service.utcnow", lambda: later)
    r = refresh(client, tokens)
    assert r.status_code == 200, r.text
    renewed = claims(r.json())
    assert renewed["web"] == pytest.approx(int((later + timedelta(days=settings.REFRESH_TOKEN_DAYS)).timestamp()),
                                           abs=5)
    assert renewed["web"] > first["web"]


def test_admin_website_session_keeps_its_hard_end_on_refresh(client, monkeypatch):
    tokens = admin_web_login(client).json()
    first = claims(tokens)
    assert first["web"] - first["iat"] == pytest.approx(settings.ADMIN_WEB_SESSION_HOURS * 3600, abs=5)
    monkeypatch.setattr("app.services.web_login_service.utcnow", lambda: utcnow() + timedelta(hours=1))
    r = refresh(client, tokens)
    assert r.status_code == 200, r.text
    assert claims(r.json())["web"] == first["web"]


def test_a_worker_cannot_use_the_website_code(client, api, boss):
    assert api.invite(boss["phone"], "w@wms.kz", "WORKER").status_code == 201
    assert api.accept("w@wms.kz").status_code == 201
    r = client.post("/api/auth/web/login/", json={"email": "w@wms.kz", "password": PASSWORD})
    assert r.status_code == 403
