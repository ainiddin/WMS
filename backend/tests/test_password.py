"""Password change, Admin password expiry (180 days) and sign out of old sessions."""

import time
from datetime import timedelta

import pytest
from sqlalchemy import text

from app.core.config import settings
from app.models import User
from tests.conftest import ADMIN, PASSWORD, admin_login, admin_web_login, staff_login

NEW = "brand-new-pass-2026"


def change(client, headers, old, new):
    return client.post("/api/auth/password/", headers=headers, json={"old_password": old, "new_password": new})


def bearer(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def expire_admin_password(db, days_over: int = 1):
    db.execute(text("UPDATE users SET password_changed_at = now() - make_interval(days => :d) WHERE role = 'ADMIN'"),
               {"d": settings.ADMIN_PASSWORD_MAX_DAYS + days_over})
    db.commit()


def wait_next_second():
    """Tokens carry `iat` in whole seconds; a new token must be from a later second than the change."""
    time.sleep(1.05)


# ---------------- changing ----------------
def test_change_password_then_sign_in_with_the_new_one(client, api):
    headers = api.customer("buyer@mail.kz")
    r = change(client, headers, PASSWORD, NEW)
    assert r.status_code == 200, r.text
    assert "password" not in r.text.lower().replace("password_expires_at", "")  # no password or hash comes back
    assert client.post("/api/auth/login/", data={"username": "buyer@mail.kz", "password": PASSWORD}).status_code == 401
    assert client.post("/api/auth/login/", data={"username": "buyer@mail.kz", "password": NEW}).status_code == 200


def test_new_password_must_differ_from_the_previous(client, api):
    headers = api.customer("buyer@mail.kz")
    r = change(client, headers, PASSWORD, PASSWORD)
    assert r.status_code == 400
    assert "differ" in r.json()["detail"]


def test_new_password_differs_only_in_case_is_a_different_password(client, api):
    headers = api.customer("buyer@mail.kz")
    assert change(client, headers, PASSWORD, PASSWORD.upper()).status_code == 200


def test_wrong_current_password_is_refused_and_counted_as_a_failed_login(client, api):
    headers = api.customer("buyer@mail.kz")
    for _ in range(settings.LOGIN_MAX_FAILS_PER_EMAIL):
        r = change(client, headers, "not-my-password", NEW)
        assert r.status_code == 400
        assert r.json()["detail"] == "The current password is wrong"
    assert change(client, headers, PASSWORD, NEW).status_code == 429  # brute force through this door is closed too


@pytest.mark.parametrize("new", ["short", "x" * 73, ""])
def test_new_password_rules(client, api, new):
    headers = api.customer("buyer@mail.kz")
    assert change(client, headers, PASSWORD, new).status_code == 422


def test_change_needs_a_signed_in_user(client):
    assert client.post("/api/auth/password/", json={"old_password": PASSWORD, "new_password": NEW}).status_code == 401


def test_the_hash_really_changes_and_is_bcrypt(client, api, db):
    headers = api.customer("buyer@mail.kz")
    before = db.query(User).filter_by(email="buyer@mail.kz").one().password_hash
    change(client, headers, PASSWORD, NEW)
    db.expire_all()
    after = db.query(User).filter_by(email="buyer@mail.kz").one().password_hash
    assert after != before and after.startswith("$2") and NEW not in after


# ---------------- other sessions are signed out ----------------
def test_old_sessions_stop_working_and_this_one_continues(client, api):
    headers = api.customer("buyer@mail.kz")
    other = client.post("/api/auth/login/", data={"username": "buyer@mail.kz", "password": PASSWORD}).json()
    wait_next_second()
    r = change(client, headers, PASSWORD, NEW)
    assert r.status_code == 200
    fresh = r.json()

    assert client.get("/api/auth/me/", headers=bearer(other)).status_code == 401  # the other device
    assert client.post("/api/auth/refresh/", json={"refresh_token": other["refresh_token"]}).status_code == 401
    assert client.get("/api/auth/me/", headers=headers).status_code == 401  # even the old token of this session
    assert client.get("/api/auth/me/", headers=bearer(fresh)).status_code == 200  # the new tokens work
    assert client.post("/api/auth/refresh/", json={"refresh_token": fresh["refresh_token"]}).status_code == 200


def test_change_is_in_the_audit_log(client, api):
    headers = api.customer("buyer@mail.kz")
    change(client, headers, PASSWORD, NEW)
    rows = client.get("/api/admin/audit/?action=PASSWORD_CHANGED", headers=api.admin).json()
    assert len(rows) == 1 and rows[0]["actor_email"] == "buyer@mail.kz" and rows[0]["target_email"] == "buyer@mail.kz"


# ---------------- Admin expiry ----------------
def test_admin_sees_when_the_password_expires_others_do_not(client, api):
    me = client.get("/api/auth/me/", headers=api.admin).json()
    assert me["password_expires_at"] is not None
    customer = client.get("/api/auth/me/", headers=api.customer("buyer@mail.kz")).json()
    assert customer["password_expires_at"] is None


def test_expired_admin_password_allows_only_me_and_change(client, db):
    tokens = admin_login(client).json()
    expire_admin_password(db)
    headers = bearer(tokens)

    r = client.get("/api/admin/users/", headers=headers)
    assert r.status_code == 403
    assert r.headers["X-Password-Expired"] == "1"
    assert client.get("/api/orders/", headers=headers).status_code == 403
    assert client.get("/api/auth/me/", headers=headers).status_code == 200

    r = change(client, headers, ADMIN[1], NEW)
    assert r.status_code == 200, r.text
    assert client.get("/api/admin/users/", headers=bearer(r.json())).status_code == 200


def test_expired_admin_cannot_reuse_the_same_password(client, db):
    headers = bearer(admin_login(client).json())
    expire_admin_password(db)
    assert change(client, headers, ADMIN[1], ADMIN[1]).status_code == 400
    assert client.get("/api/admin/users/", headers=headers).status_code == 403  # still locked out


def test_expired_admin_password_on_the_website_too(client, db):
    headers = bearer(admin_web_login(client).json())
    expire_admin_password(db)
    assert client.get("/api/admin/users/", headers=headers).status_code == 403
    r = change(client, headers, ADMIN[1], NEW)
    assert r.status_code == 200
    import jwt

    claims = jwt.decode(r.json()["access_token"], options={"verify_signature": False})
    assert "web" in claims  # the website session keeps its hard end after the change


def test_one_day_before_expiry_everything_works(client, db):
    headers = bearer(admin_login(client).json())
    db.execute(text("UPDATE users SET password_changed_at = now() - make_interval(days => :d) WHERE role = 'ADMIN'"),
               {"d": settings.ADMIN_PASSWORD_MAX_DAYS - 1})
    db.commit()
    assert client.get("/api/admin/users/", headers=headers).status_code == 200


def test_expiry_counts_only_for_admins(client, api, db):
    manager, _ = api.staff("boss@wms.kz", "MANAGER")
    db.execute(text("UPDATE users SET password_changed_at = now() - interval '3650 days' WHERE role <> 'ADMIN'"))
    db.commit()
    assert client.get("/api/orders/", headers=manager).status_code == 200


def test_after_the_change_the_admin_phone_signs_in_with_the_new_password(client, db):
    admin_login(client)
    expire_admin_password(db)
    headers = bearer(staff_login(client, *ADMIN).json())  # phone is remembered: no code needed
    assert change(client, headers, ADMIN[1], NEW).status_code == 200
    assert staff_login(client, ADMIN[0], ADMIN[1]).status_code == 401
    assert staff_login(client, ADMIN[0], NEW).status_code == 200


def test_expiry_value(client, api, db):
    me = client.get("/api/auth/me/", headers=api.admin).json()
    changed = db.query(User).filter_by(email=ADMIN[0]).one().password_changed_at
    from datetime import datetime

    expires = datetime.fromisoformat(me["password_expires_at"])
    assert expires - changed == timedelta(days=settings.ADMIN_PASSWORD_MAX_DAYS)
