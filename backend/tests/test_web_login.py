"""Website sign in for Admins and Managers, approved on the phone (Steam Guard style)."""

import jwt
import pytest
from sqlalchemy import text

from app.core.config import settings
from app.models import WebLoginRequest
from tests.conftest import ADMIN, CORPORATE, PASSWORD, admin_login, last_code, staff_login


def start(client, email, password=PASSWORD):
    return client.post("/api/auth/web/login/", json={"email": email, "password": password})


def status_of(client, token):
    return client.post("/api/auth/web/status/", json={"request_token": token})


def pending(client, phone):
    r = client.get("/api/web-logins/", headers=phone)
    assert r.status_code == 200, r.text
    return r.json()


def approve(client, phone, request_id, number):
    return client.post(f"/api/web-logins/{request_id}/approve/", headers=phone, json={"number": number})


def wrong_number(req: dict, right: int) -> int:
    return next(c for c in req["choices"] if c != right)


@pytest.fixture
def boss(api):
    phone, emp_id = api.staff("boss@wms.kz", "MANAGER")  # signed in on an approved phone
    return {"phone": phone, "id": emp_id}


def sign_in(client, email, phone, password=PASSWORD):
    r = start(client, email, password)
    assert r.status_code == 200, r.text
    started = r.json()
    req = pending(client, phone)[0]
    assert approve(client, phone, req["id"], started["number"]).status_code == 204
    r = status_of(client, started["request_token"])
    assert r.status_code == 200 and r.json()["status"] == "APPROVED", r.text
    return r.json()["tokens"]


# ---------------- the happy path ----------------
def test_manager_signs_in_on_the_website_by_tapping_the_number_on_his_phone(client, boss):
    r = start(client, "BOSS@wms.kz")
    assert r.status_code == 200, r.text
    started = r.json()
    assert 10 <= started["number"] <= 99 and started["phone_available"] is True and started["role"] == "MANAGER"
    assert started["seconds"] == settings.WEB_LOGIN_SECONDS
    assert "access_token" not in r.text

    assert status_of(client, started["request_token"]).json() == {"status": "PENDING", "tokens": None}
    [req] = pending(client, boss["phone"])
    assert started["number"] in req["choices"] and len(set(req["choices"])) == 3
    assert all(10 <= c <= 99 for c in req["choices"])
    assert req["ip"] == "testclient"

    assert approve(client, boss["phone"], req["id"], started["number"]).status_code == 204
    r = status_of(client, started["request_token"])
    tokens = r.json()["tokens"]
    assert r.json()["status"] == "APPROVED" and tokens["user"]["role"] == "MANAGER"
    claims = jwt.decode(tokens["access_token"], options={"verify_signature": False})
    assert "web" in claims and "dev" not in claims  # a website session, not a phone token
    assert claims["web"] - claims["iat"] <= settings.ADMIN_WEB_SESSION_HOURS * 3600
    web = {"Authorization": f"Bearer {tokens['access_token']}"}
    assert client.get("/api/orders/", headers=web).status_code == 200
    assert client.get("/api/team/members/", headers=web).status_code == 200


def test_the_session_is_handed_out_only_once(client, boss):
    started = start(client, "boss@wms.kz").json()
    req = pending(client, boss["phone"])[0]
    approve(client, boss["phone"], req["id"], started["number"])
    assert status_of(client, started["request_token"]).status_code == 200
    assert status_of(client, started["request_token"]).status_code == 400


def test_the_choices_do_not_reveal_which_is_right(client, boss):
    """Over many sign ins the right number is not always in the same place."""
    places = set()
    for _ in range(12):
        started = start(client, "boss@wms.kz").json()
        req = pending(client, boss["phone"])[0]
        places.add(req["choices"].index(started["number"]))
        from app.core import rate_limit

        rate_limit.web_logins_by_email.reset("boss@wms.kz")
    assert len(places) > 1


# ---------------- saying no ----------------
def test_a_wrong_number_rejects_the_sign_in(client, boss):
    started = start(client, "boss@wms.kz").json()
    req = pending(client, boss["phone"])[0]
    r = approve(client, boss["phone"], req["id"], wrong_number(req, started["number"]))
    assert r.status_code == 409 and "rejected" in r.json()["detail"]
    r = status_of(client, started["request_token"])
    assert r.status_code == 403 and "rejected" in r.json()["detail"]
    # and the right number afterwards does not save it
    assert approve(client, boss["phone"], req["id"], started["number"]).status_code == 409
    assert pending(client, boss["phone"]) == []


def test_no_it_was_not_me(client, boss):
    started = start(client, "boss@wms.kz").json()
    req = pending(client, boss["phone"])[0]
    assert client.post(f"/api/web-logins/{req['id']}/deny/", headers=boss["phone"]).status_code == 204
    assert status_of(client, started["request_token"]).status_code == 403


def test_an_unanswered_request_expires(client, boss, db):
    started = start(client, "boss@wms.kz").json()
    req = pending(client, boss["phone"])[0]
    db.execute(text("UPDATE web_login_requests SET expires_at = now() - interval '1 second'"))
    db.commit()
    assert pending(client, boss["phone"]) == []
    assert approve(client, boss["phone"], req["id"], started["number"]).status_code == 409
    assert status_of(client, started["request_token"]).status_code == 400


def test_a_new_sign_in_cancels_the_unfinished_one(client, boss):
    old = start(client, "boss@wms.kz").json()
    new = start(client, "boss@wms.kz").json()
    reqs = pending(client, boss["phone"])
    assert len(reqs) == 1
    assert status_of(client, old["request_token"]).status_code == 400
    approve(client, boss["phone"], reqs[0]["id"], new["number"])
    assert status_of(client, new["request_token"]).json()["status"] == "APPROVED"


@pytest.mark.parametrize("number", [9, 100, -1])
def test_numbers_outside_two_digits_are_refused(client, boss, number):
    start(client, "boss@wms.kz")
    req = pending(client, boss["phone"])[0]
    assert approve(client, boss["phone"], req["id"], number).status_code == 422


# ---------------- who may ----------------
def test_a_manager_must_sign_in_on_the_phone_first(client, api, boss):
    assert api.invite(boss["phone"], "fresh@wms.kz", "MANAGER").status_code == 201
    assert api.accept("fresh@wms.kz").status_code == 201  # account exists, never signed in on a phone
    r = start(client, "fresh@wms.kz")
    assert r.status_code == 409 and "KeyFive Staff app" in r.json()["detail"]


def test_a_manager_whose_phone_is_still_waiting_cannot_sign_in_on_the_website(client, api, boss):
    api.invite(boss["phone"], "fresh@wms.kz", "MANAGER")
    api.accept("fresh@wms.kz")
    assert staff_login(client, "fresh@wms.kz").status_code == 403  # phone waits for approval
    assert start(client, "fresh@wms.kz").status_code == 409


def test_workers_and_customers_have_no_website_staff_sign_in(client, api, boss):
    api.staff("w@wms.kz", "WORKER", boss["id"])
    api.customer("c@mail.kz")
    for email in ("w@wms.kz", "c@mail.kz"):
        assert start(client, email).status_code == 403


def test_wrong_password_creates_nothing(client, boss, db):
    assert start(client, "boss@wms.kz", "wrong-password").status_code == 401
    assert start(client, "nobody@wms.kz").status_code == 401
    assert db.query(WebLoginRequest).count() == 0


def test_only_the_owner_on_his_approved_phone_answers(client, api, boss):
    other, _ = api.staff("other@wms.kz", "MANAGER")
    started = start(client, "boss@wms.kz").json()
    req = pending(client, boss["phone"])[0]
    assert pending(client, other) == []  # not visible to another person
    assert approve(client, other, req["id"], started["number"]).status_code == 404
    assert status_of(client, started["request_token"]).json()["status"] == "PENDING"


def test_a_website_session_cannot_approve_a_website_sign_in(client, boss):
    """Only the phone approves: otherwise one stolen website session could open more of them."""
    web = {"Authorization": f"Bearer {sign_in(client, 'boss@wms.kz', boss['phone'])['access_token']}"}
    started = start(client, "boss@wms.kz").json()
    req = pending(client, boss["phone"])[0]
    r = approve(client, web, req["id"], started["number"])
    assert r.status_code == 403 and "phone" in r.json()["detail"]
    assert status_of(client, started["request_token"]).json()["status"] == "PENDING"


def test_blocked_after_approving_gets_no_session(client, api, boss):
    started = start(client, "boss@wms.kz").json()
    req = pending(client, boss["phone"])[0]
    approve(client, boss["phone"], req["id"], started["number"])
    uid = next(u["id"] for u in client.get("/api/admin/users/?search=boss", headers=api.admin).json())
    client.post(f"/api/admin/users/{uid}/block/", headers=api.admin)
    assert status_of(client, started["request_token"]).status_code == 403


# ---------------- limits ----------------
def test_too_many_unanswered_requests_are_refused_but_an_approval_clears_the_count(client, boss):
    for _ in range(settings.WEB_LOGIN_MAX_REQUESTS):
        assert start(client, "boss@wms.kz").status_code == 200
    r = start(client, "boss@wms.kz")
    assert r.status_code == 429 and "waiting for the phone" in r.json()["detail"]
    assert int(r.headers["Retry-After"]) > 0

    from app.core import rate_limit

    rate_limit.web_logins_by_email.reset("boss@wms.kz")
    sign_in(client, "boss@wms.kz", boss["phone"])  # approved: the counter starts from zero
    for _ in range(settings.WEB_LOGIN_MAX_REQUESTS):
        assert start(client, "boss@wms.kz").status_code == 200


def test_status_with_a_made_up_token(client):
    assert status_of(client, "x" * 43).status_code == 400
    assert status_of(client, "short").status_code == 422


# ---------------- Admin ----------------
def test_admin_approves_on_his_phone_too(client):
    phone = {"Authorization": f"Bearer {admin_login(client).json()['access_token']}"}  # phone passed the email code
    tokens = sign_in(client, ADMIN[0], phone, ADMIN[1])
    assert tokens["user"]["role"] == "ADMIN"
    assert client.get("/api/admin/users/", headers={"Authorization": f"Bearer {tokens['access_token']}"}).status_code == 200


def test_admin_without_an_approving_phone_falls_back_to_the_email_code(client):
    r = start(client, ADMIN[0], ADMIN[1])  # no phone ever passed the email code
    assert r.status_code == 200 and r.json()["phone_available"] is False
    r = client.post("/api/auth/web/email-code/", json={"request_token": r.json()["request_token"]})
    assert r.status_code == 200 and r.json()["two_factor_required"] is True
    v = client.post("/api/auth/2fa/verify/", json={"challenge_token": r.json()["challenge_token"],
                                                   "code": last_code(CORPORATE)})
    assert v.status_code == 200 and v.json()["user"]["role"] == "ADMIN"


def test_admin_with_a_phone_may_still_choose_the_email_code(client):
    admin_login(client)
    started = start(client, ADMIN[0], ADMIN[1]).json()
    assert started["phone_available"] is True
    r = client.post("/api/auth/web/email-code/", json={"request_token": started["request_token"]})
    assert r.status_code == 200
    assert status_of(client, started["request_token"]).status_code == 400  # the phone request is closed


def test_only_an_admin_has_the_email_code_fallback(client, boss):
    started = start(client, "boss@wms.kz").json()
    r = client.post("/api/auth/web/email-code/", json={"request_token": started["request_token"]})
    assert r.status_code == 403


def test_the_email_code_fallback_works_once_and_only_while_waiting(client):
    started = start(client, ADMIN[0], ADMIN[1]).json()
    body = {"request_token": started["request_token"]}
    assert client.post("/api/auth/web/email-code/", json=body).status_code == 200
    assert client.post("/api/auth/web/email-code/", json=body).status_code == 400


def test_every_step_is_in_the_audit_log(client, api, boss):
    started = start(client, "boss@wms.kz").json()
    req = pending(client, boss["phone"])[0]
    approve(client, boss["phone"], req["id"], wrong_number(req, started["number"]))
    sign_in(client, "boss@wms.kz", boss["phone"])
    rows = client.get("/api/admin/audit/?limit=20", headers=api.admin).json()
    actions = [r["action"] for r in rows if r["action"].startswith("WEB_LOGIN")]
    assert actions == ["WEB_LOGIN_APPROVED", "WEB_LOGIN_REQUESTED", "WEB_LOGIN_WRONG_NUMBER", "WEB_LOGIN_REQUESTED"]
    wrong = next(r for r in rows if r["action"] == "WEB_LOGIN_WRONG_NUMBER")
    assert wrong["actor_email"] == "boss@wms.kz" and wrong["details"]["browser_ip"] == "testclient"


def test_an_admin_phone_that_never_passed_the_email_code_does_not_count(client):
    assert staff_login(client, *ADMIN).status_code == 202  # phone approved automatically, code not entered yet
    r = start(client, ADMIN[0], ADMIN[1])
    assert r.status_code == 200 and r.json()["phone_available"] is False



# ---------------- the demo switch (Managers without phones) ----------------
def test_by_default_a_manager_never_skips_the_phone(client, boss):
    assert settings.MANAGER_WEB_PHONE_CONFIRM is True
    assert start(client, "boss@wms.kz").json()["confirmed"] is False


def test_switched_off_a_manager_signs_in_with_the_password_alone(client, api, boss, monkeypatch):
    monkeypatch.setattr(settings, "MANAGER_WEB_PHONE_CONFIRM", False)
    api.invite(boss["phone"], "nophone@wms.kz", "MANAGER")
    api.accept("nophone@wms.kz")  # never signed in on a phone
    r = start(client, "nophone@wms.kz")
    assert r.status_code == 200 and r.json()["confirmed"] is True
    r = status_of(client, r.json()["request_token"])
    assert r.json()["status"] == "APPROVED" and r.json()["tokens"]["user"]["role"] == "MANAGER"
    web = {"Authorization": f"Bearer {r.json()['tokens']['access_token']}"}
    assert client.get("/api/orders/", headers=web).status_code == 200
    rows = client.get("/api/admin/audit/?action=WEB_LOGIN_APPROVED", headers=api.admin).json()
    assert rows[0]["details"]["phone_confirmation"] == "off"  # visible in the audit log


def test_the_switch_never_touches_admins_or_workers(client, api, boss, monkeypatch):
    monkeypatch.setattr(settings, "MANAGER_WEB_PHONE_CONFIRM", False)
    r = start(client, ADMIN[0], ADMIN[1])
    assert r.status_code == 200 and r.json()["confirmed"] is False  # Admin still needs the phone or the code
    api.staff("w@wms.kz", "WORKER", boss["id"])
    assert start(client, "w@wms.kz").status_code == 403
    assert start(client, "boss@wms.kz", "wrong-password").status_code == 401  # the password still matters
