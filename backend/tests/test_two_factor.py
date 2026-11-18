"""Admin two-factor sign in: password + a code mailed to the one corporate mailbox."""

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from sqlalchemy import text

from app.core.config import settings
from app.core.security import create_token
from app.models import TwoFactorChallenge
from tests.conftest import ADMIN, CORPORATE, OUTBOX, PASSWORD, last_code, staff_login, two_factor


def web_login(client, email=ADMIN[0], password=ADMIN[1]):
    return client.post("/api/auth/admin/login/", json={"email": email, "password": password})


def verify(client, token, code):
    return client.post("/api/auth/2fa/verify/", json={"challenge_token": token, "code": code})


def resend(client, token):
    return client.post("/api/auth/2fa/resend/", json={"challenge_token": token})


def wrong(code: str) -> str:
    return f"{(int(code) + 1) % 1_000_000:06d}"


def age_code(db, seconds: int):
    """Pretend the current codes were sent `seconds` earlier (instead of waiting in the test)."""
    db.execute(text("UPDATE two_factor_challenges SET code_sent_at = code_sent_at - make_interval(secs => :s)"),
               {"s": seconds})
    db.commit()


def bearer(r):
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ---------------- website ----------------
def test_code_goes_only_to_the_corporate_mailbox_and_opens_the_admin_api(client):
    r = web_login(client)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["two_factor_required"] is True
    assert body["sent_to"] == "c***@keyfive.kz"
    assert body["code_seconds"] == 360 and body["resend_seconds"] == 60
    assert "access_token" not in body
    assert set(OUTBOX) == {CORPORATE}  # not the Admin's own address
    code = last_code(CORPORATE)
    assert code not in r.text

    r = verify(client, body["challenge_token"], code)
    assert r.status_code == 200, r.text
    assert r.json()["user"]["role"] == "ADMIN"
    assert client.get("/api/admin/users/", headers=bearer(r)).status_code == 200


def test_the_email_says_who_signs_in_where_and_from_which_ip(client):
    web_login(client)
    mail = OUTBOX[CORPORATE][-1]
    assert "admin001@wms.kz" in mail and "the website" in mail and "testclient" in mail


def test_wrong_password_sends_nothing(client):
    assert web_login(client, password="wrong-password").status_code == 401
    assert web_login(client, email="nobody@wms.kz").status_code == 401
    assert OUTBOX == {}


def test_only_admins_use_the_admin_sign_in(client, api):
    api.staff("boss@wms.kz", "MANAGER")
    api.customer("buyer@mail.kz")
    OUTBOX.clear()
    assert web_login(client, "boss@wms.kz", PASSWORD).status_code == 403
    assert web_login(client, "buyer@mail.kz", PASSWORD).status_code == 403
    assert OUTBOX == {}


def test_wrong_codes_count_down_then_a_new_code_is_sent(client):
    token = web_login(client).json()["challenge_token"]
    first = last_code(CORPORATE)
    for left in (4, 3, 2, 1):
        r = verify(client, token, wrong(first))
        assert r.status_code == 400
        assert r.json()["detail"] == f"Wrong code. Attempts left: {left}"
    r = verify(client, token, wrong(first))
    assert r.status_code == 400
    assert "a new code was sent" in r.json()["detail"]
    assert len(OUTBOX[CORPORATE]) == 2
    second = last_code(CORPORATE)

    if first != second:  # 1 in a million they are equal
        assert verify(client, token, first).status_code == 400  # the burnt code does not work
    assert verify(client, token, second).status_code == 200


def test_a_code_works_only_once(client):
    token = web_login(client).json()["challenge_token"]
    code = last_code(CORPORATE)
    assert verify(client, token, code).status_code == 200
    r = verify(client, token, code)
    assert r.status_code == 400
    assert "Sign in again" in r.json()["detail"]


def test_a_new_sign_in_cancels_the_unfinished_one(client):
    old = web_login(client).json()["challenge_token"]
    old_code = last_code(CORPORATE)
    new = web_login(client).json()["challenge_token"]
    assert verify(client, old, old_code).status_code == 400
    assert verify(client, new, last_code(CORPORATE)).status_code == 200


def test_unknown_or_forged_challenge_is_refused(client):
    web_login(client)
    assert verify(client, "x" * 43, last_code(CORPORATE)).status_code == 400
    assert resend(client, "x" * 43).status_code == 400


def test_expired_code_then_send_again(client, db):
    token = web_login(client).json()["challenge_token"]
    code = last_code(CORPORATE)
    age_code(db, settings.TWO_FACTOR_CODE_SECONDS + 1)
    r = verify(client, token, code)
    assert r.status_code == 400
    assert "expired" in r.json()["detail"]

    assert resend(client, token).status_code == 200
    assert verify(client, token, last_code(CORPORATE)).status_code == 200


def test_code_is_still_valid_just_before_it_expires(client, db):
    token = web_login(client).json()["challenge_token"]
    age_code(db, settings.TWO_FACTOR_CODE_SECONDS - 5)
    assert verify(client, token, last_code(CORPORATE)).status_code == 200


def test_the_whole_sign_in_expires(client, db):
    token = web_login(client).json()["challenge_token"]
    code = last_code(CORPORATE)
    db.execute(text("UPDATE two_factor_challenges SET expires_at = now() - interval '1 second'"))
    db.commit()
    assert verify(client, token, code).status_code == 400
    assert resend(client, token).status_code == 400


def test_send_again_only_once_a_minute(client, db):
    token = web_login(client).json()["challenge_token"]
    r = resend(client, token)
    assert r.status_code == 429
    assert 0 < int(r.headers["Retry-After"]) <= 60
    assert len(OUTBOX[CORPORATE]) == 1

    age_code(db, 61)
    old = last_code(CORPORATE)
    assert resend(client, token).status_code == 200
    assert len(OUTBOX[CORPORATE]) == 2
    new = last_code(CORPORATE)
    if old != new:
        assert verify(client, token, old).status_code == 400  # the previous code stopped working
    assert verify(client, token, new).status_code == 200


def test_at_most_three_codes_per_window_then_locked_until_cleared(client, db, api):
    phone_admin = api.admin  # a working Admin session in the app, to clear the timer later
    OUTBOX.clear()
    # The app sign in above entered its code, so it no longer counts: 3 unfinished codes are allowed.
    token = web_login(client).json()["challenge_token"]  # code 1
    for _ in range(2):  # codes 2 and 3
        age_code(db, 61)
        r = resend(client, token)
        assert r.status_code == 200, r.text
    age_code(db, 61)
    r = resend(client, token)
    assert r.status_code == 429
    assert "Too many codes were sent" in r.json()["detail"]
    r = web_login(client)  # a fresh sign in does not get around it
    assert r.status_code == 429
    assert len(OUTBOX[CORPORATE]) == 3

    admin_id = client.get("/api/auth/me/", headers=phone_admin).json()["id"]
    user = next(u for u in client.get("/api/admin/users/", headers=phone_admin).json() if u["id"] == admin_id)
    assert user["login_locked_seconds"] > 0  # visible in Users

    assert client.post(f"/api/admin/users/{admin_id}/clear-login-timer/", headers=phone_admin).status_code == 200
    r = web_login(client)
    assert r.status_code == 200
    assert verify(client, r.json()["challenge_token"], last_code(CORPORATE)).status_code == 200


def test_five_wrong_codes_with_no_codes_left_burns_the_code_and_locks(client, db):
    token = web_login(client).json()["challenge_token"]  # 1
    age_code(db, 61)
    resend(client, token)  # 2
    age_code(db, 61)
    resend(client, token)  # 3
    code = last_code(CORPORATE)
    for _ in range(4):
        assert verify(client, token, wrong(code)).status_code == 400
    r = verify(client, token, wrong(code))
    assert r.status_code == 429  # no new code can be sent
    r = verify(client, token, code)
    assert r.status_code == 400  # the right code is burnt too
    assert "Send again" in r.json()["detail"]
    assert len(OUTBOX[CORPORATE]) == 3  # and trying more does not send anything


def test_blocked_or_demoted_while_the_code_travels(client, api):
    boss, _ = api.staff("boss2@wms.kz", "MANAGER")
    admin = api.admin
    users = client.get("/api/admin/users/?search=boss2", headers=admin).json()
    second_id = users[0]["id"]
    assert client.patch(f"/api/admin/users/{second_id}/role/", headers=admin,
                        json={"role": "ADMIN", "manager_id": None}).status_code == 200

    token = web_login(client, "boss2@wms.kz", PASSWORD).json()["challenge_token"]
    code = last_code(CORPORATE)
    assert client.post(f"/api/admin/users/{second_id}/block/", headers=admin).status_code == 200
    assert verify(client, token, code).status_code == 403

    assert client.post(f"/api/admin/users/{second_id}/unblock/", headers=admin).status_code == 200
    token = web_login(client, "boss2@wms.kz", PASSWORD).json()["challenge_token"]
    code = last_code(CORPORATE)
    assert client.patch(f"/api/admin/users/{second_id}/role/", headers=admin,
                        json={"role": "MANAGER", "manager_id": None}).status_code == 200
    assert verify(client, token, code).status_code == 403


def test_without_a_corporate_mailbox_no_admin_can_sign_in(client, monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_2FA_EMAIL", None)
    r = web_login(client)
    assert r.status_code == 503
    r = staff_login(client, *ADMIN)
    assert r.status_code == 503
    assert OUTBOX == {}


def test_a_failed_email_is_not_counted_and_opens_nothing(client, db, monkeypatch):
    def broken(to, subject, text):
        raise OSError("mail server down")

    monkeypatch.setattr("app.services.email_service.send_email", broken)
    for _ in range(settings.TWO_FACTOR_MAX_CODES + 1):
        assert web_login(client).status_code == 502
    assert db.query(TwoFactorChallenge).count() == 0
    monkeypatch.undo()
    monkeypatch.setattr("app.services.email_service.send_email",
                        lambda to, subject, text: OUTBOX.setdefault(to, []).append(text))
    assert web_login(client).status_code == 200  # the failures did not use up the limit


def test_secrets_are_stored_only_as_hashes(client, db):
    token = web_login(client).json()["challenge_token"]
    code = last_code(CORPORATE)
    row = db.query(TwoFactorChallenge).one()
    assert token not in row.token_hash and code not in row.code_hash
    assert row.code_hash.startswith("$2")  # bcrypt


@pytest.mark.parametrize("code", ["12345", "1234567", "abcdef", "12 456", ""])
def test_malformed_codes_are_refused(client, code):
    token = web_login(client).json()["challenge_token"]
    assert verify(client, token, code).status_code == 422


def test_every_step_is_in_the_audit_log(client, api):
    token = web_login(client).json()["challenge_token"]
    code = last_code(CORPORATE)
    verify(client, token, wrong(code))
    verify(client, token, code)
    rows = client.get("/api/admin/audit/?limit=10", headers=api.admin).json()
    web = [r["action"] for r in rows if r["details"].get("channel") == "WEB"]
    assert web == ["TWO_FACTOR_PASSED", "TWO_FACTOR_FAILED", "TWO_FACTOR_CODE_SENT"]
    failed = next(r for r in rows if r["action"] == "TWO_FACTOR_FAILED")
    assert failed["details"]["attempt"] == 1 and failed["ip"] == "testclient"


# ---------------- website session (4 hours) ----------------
def test_web_session_has_a_hard_end_that_refresh_keeps(client):
    r = two_factor(client, web_login(client))
    tokens = r.json()
    access = jwt.decode(tokens["access_token"], options={"verify_signature": False})
    refresh = jwt.decode(tokens["refresh_token"], options={"verify_signature": False})
    hours = settings.ADMIN_WEB_SESSION_HOURS
    assert refresh["exp"] == refresh["web"]  # the refresh token dies with the session, not in 7 days
    assert refresh["web"] - refresh["iat"] <= hours * 3600
    assert access["exp"] <= access["web"]

    r = client.post("/api/auth/refresh/", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200
    again = jwt.decode(r.json()["refresh_token"], options={"verify_signature": False})
    assert again["web"] == refresh["web"]  # refresh does not make the session longer


def test_after_the_session_end_the_tokens_stop_working(client):
    admin_id = two_factor(client, web_login(client)).json()["user"]["id"]
    ended = datetime.now(UTC) - timedelta(seconds=1)
    access = create_token(admin_id, "ADMIN", "access", session_ends=ended)
    refresh = create_token(admin_id, "ADMIN", "refresh", session_ends=ended)
    assert client.get("/api/admin/users/", headers={"Authorization": f"Bearer {access}"}).status_code == 401
    assert client.post("/api/auth/refresh/", json={"refresh_token": refresh}).status_code == 401


def test_only_an_admin_may_have_a_session_without_a_phone(client, api):
    _, _ = api.staff("boss@wms.kz", "MANAGER")
    boss_id = next(u["id"] for u in client.get("/api/admin/users/?search=boss", headers=api.admin).json())
    later = datetime.now(UTC) + timedelta(hours=1)
    forged = create_token(boss_id, "MANAGER", "access", session_ends=later)
    r = client.get("/api/orders/", headers={"Authorization": f"Bearer {forged}"})
    assert r.status_code == 403


# ---------------- app (phone) ----------------
def test_app_asks_the_code_once_per_phone(client):
    r = staff_login(client, *ADMIN)
    assert r.status_code == 202
    r = two_factor(client, r)
    claims = jwt.decode(r.json()["access_token"], options={"verify_signature": False})
    assert "dev" in claims and "web" not in claims  # a phone token, not a website session

    OUTBOX.clear()
    assert staff_login(client, *ADMIN).status_code == 200  # the phone is remembered
    assert OUTBOX == {}


def test_a_second_admin_phone_needs_approval_and_then_the_code(client, api):
    admin = api.admin
    assert staff_login(client, *ADMIN, phone="tablet").status_code == 403  # waits for approval
    device = next(d for d in client.get("/api/admin/devices/?status=PENDING", headers=admin).json())
    assert client.post(f"/api/admin/devices/{device['id']}/approve/", headers=admin).status_code == 200
    r = staff_login(client, *ADMIN, phone="tablet")
    assert r.status_code == 202
    assert two_factor(client, r).status_code == 200


def test_a_blocked_and_reapproved_phone_needs_the_code_again(client, api):
    admin = api.admin
    assert staff_login(client, *ADMIN, phone="tablet").status_code == 403
    device = next(d for d in client.get("/api/admin/devices/?status=PENDING", headers=admin).json())
    client.post(f"/api/admin/devices/{device['id']}/approve/", headers=admin)
    assert two_factor(client, staff_login(client, *ADMIN, phone="tablet")).status_code == 200

    assert client.post(f"/api/admin/devices/{device['id']}/revoke/", headers=admin).status_code == 200
    assert client.post(f"/api/admin/devices/{device['id']}/approve/", headers=admin).status_code == 200
    assert staff_login(client, *ADMIN, phone="tablet").status_code == 202


def test_an_admin_phone_token_without_the_code_is_refused(client, db):
    r = staff_login(client, *ADMIN)  # 202: the phone exists and is approved, but no code yet
    assert r.status_code == 202
    device_id, user_id = db.execute(text("SELECT id, user_id FROM staff_devices")).one()
    forged = create_token(user_id, "ADMIN", "access", device_id)
    r = client.get("/api/admin/users/", headers={"Authorization": f"Bearer {forged}"})
    assert r.status_code == 403
    assert "email code" in r.json()["detail"]


def test_phone_blocked_while_the_code_travels(client, api, db):
    admin = api.admin
    staff_login(client, *ADMIN, phone="tablet")
    device = next(d for d in client.get("/api/admin/devices/?status=PENDING", headers=admin).json())
    client.post(f"/api/admin/devices/{device['id']}/approve/", headers=admin)
    r = staff_login(client, *ADMIN, phone="tablet")
    assert r.status_code == 202
    code = last_code(CORPORATE)
    assert client.post(f"/api/admin/devices/{device['id']}/revoke/", headers=admin).status_code == 200
    assert verify(client, r.json()["challenge_token"], code).status_code == 403


def test_workers_and_managers_get_no_code_in_the_app(client, api):
    api.staff("boss@wms.kz", "MANAGER")
    OUTBOX.clear()
    assert staff_login(client, "boss@wms.kz").status_code == 200
    assert CORPORATE not in OUTBOX


def test_signing_in_successfully_does_not_use_up_the_code_limit(client):
    """Three right sign ins in a row, then a fourth: the right code clears the counter."""
    for _ in range(settings.TWO_FACTOR_MAX_CODES + 2):
        r = web_login(client)
        assert r.status_code == 200, r.text
        assert verify(client, r.json()["challenge_token"], last_code(CORPORATE)).status_code == 200


def test_send_again_after_successful_sign_ins_still_works(client, db):
    """The case from real use: two sign ins, a third one, then "Send again"."""
    for _ in range(2):
        r = web_login(client)
        verify(client, r.json()["challenge_token"], last_code(CORPORATE))
    token = web_login(client).json()["challenge_token"]
    age_code(db, 61)
    assert resend(client, token).status_code == 200


def test_unfinished_sign_ins_still_hit_the_limit(client):
    """Only a right code clears the counter: someone who knows the password but not the code is still limited."""
    for _ in range(settings.TWO_FACTOR_MAX_CODES):
        assert web_login(client).status_code == 200
    r = web_login(client)
    assert r.status_code == 429
    assert r.json()["detail"].startswith("Too many codes were sent to the corporate mailbox.")
    assert 0 < int(r.headers["Retry-After"]) <= settings.TWO_FACTOR_WINDOW_SECONDS


def test_wrong_codes_never_clear_the_counter(client):
    token = web_login(client).json()["challenge_token"]
    code = last_code(CORPORATE)
    verify(client, token, wrong(code))
    web_login(client)
    web_login(client)
    assert web_login(client).status_code == 429
