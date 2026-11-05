from app.core.config import settings
from app.core.rate_limit import SlidingWindowLimiter
from tests.conftest import ADMIN, PASSWORD


def login(client, email, password):
    return client.post("/api/auth/login/", data={"username": email, "password": password})


def test_sliding_window_lets_old_events_expire_one_by_one():
    now = [0.0]
    limiter = SlidingWindowLimiter(limit=3, window_seconds=60, clock=lambda: now[0])
    for t in (0, 10, 20):
        now[0] = t
        assert limiter.retry_after("k") == 0
        limiter.hit("k")
    now[0] = 30
    assert limiter.retry_after("k") == 30  # oldest event (t=0) leaves the window at t=60
    now[0] = 60
    assert limiter.retry_after("k") == 0  # t=0 expired -> one slot free
    limiter.hit("k")
    assert limiter.retry_after("k") == 10  # next to expire is t=10, at t=70
    assert limiter.retry_after("other") == 0  # keys are independent


def test_too_many_wrong_passwords_lock_the_email_even_for_the_right_password(client):
    for _ in range(settings.LOGIN_MAX_FAILS_PER_EMAIL):
        assert login(client, ADMIN[0], "wrong-password").status_code == 401

    r = login(client, ADMIN[0], ADMIN[1])
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) > 0
    assert "Too many attempts" in r.json()["detail"]
    # Same email in other letter case is the same account.
    assert login(client, ADMIN[0].upper(), ADMIN[1]).status_code == 429


def test_successful_login_resets_the_email_counter(client):
    for _ in range(settings.LOGIN_MAX_FAILS_PER_EMAIL - 1):
        assert login(client, ADMIN[0], "wrong-password").status_code == 401
    assert login(client, ADMIN[0], ADMIN[1]).status_code == 200
    for _ in range(settings.LOGIN_MAX_FAILS_PER_EMAIL - 1):
        assert login(client, ADMIN[0], "wrong-password").status_code == 401
    assert login(client, ADMIN[0], ADMIN[1]).status_code == 200


def test_one_ip_cannot_spray_many_accounts(client, api):
    api.customer("victim@mail.kz")
    # Unknown emails count too, so an attacker cannot probe addresses for free.
    for i in range(settings.LOGIN_MAX_FAILS_PER_IP):
        assert login(client, f"guess{i}@mail.kz", "wrong-password").status_code == 401
    assert login(client, "victim@mail.kz", PASSWORD).status_code == 429


def test_signups_are_limited_per_ip(client):
    for i in range(settings.SIGNUP_MAX_PER_IP):
        r = client.post("/api/auth/register/", json={
            "email": f"spam{i}@mail.kz", "password": PASSWORD, "full_name": "Spam", "address": "Almaty",
        })
        assert r.status_code == 201, r.text
    r = client.post("/api/auth/register-staff/", json={
        "email": "spam-staff@wms.kz", "password": PASSWORD, "full_name": "Spam", "requested_role": "WORKER",
    })
    assert r.status_code == 429
