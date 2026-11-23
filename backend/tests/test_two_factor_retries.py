"""Admin code: quick retries and double clicks must not burn the "3 codes per 15 min" limit.

- signing in again (same account, same website/phone) within TWO_FACTOR_RESEND_SECONDS sends no new code;
- parallel requests of one account are serialized, so a double click sends one code.
"""

import threading
import time
from datetime import datetime

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from tests.conftest import ADMIN, CORPORATE, OUTBOX, last_code, staff_login
from tests.test_two_factor import age_code, resend, verify, web_login, wrong


def at(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def test_quick_second_sign_in_keeps_the_code_and_does_not_count(client):
    first = web_login(client).json()
    code = last_code(CORPORATE)
    r = web_login(client)
    assert r.status_code == 200, r.text
    second = r.json()
    assert len(OUTBOX[CORPORATE]) == 1  # no second code
    assert second["challenge_token"] != first["challenge_token"]
    assert 0 < second["resend_seconds"] <= settings.TWO_FACTOR_RESEND_SECONDS
    assert second["code_seconds"] <= settings.TWO_FACTOR_CODE_SECONDS
    assert at(second["expires_at"]) == at(first["expires_at"])  # the same sign in continues
    assert verify(client, first["challenge_token"], code).status_code == 400  # the old screen stops working
    assert verify(client, second["challenge_token"], code).status_code == 200


def test_signing_in_again_right_after_a_finished_sign_in_sends_a_new_code(client):
    """A used code is never handed out again: the finished sign in is not continued."""
    first = web_login(client).json()
    assert verify(client, first["challenge_token"], last_code(CORPORATE)).status_code == 200
    second = web_login(client).json()
    assert len(OUTBOX[CORPORATE]) == 2
    assert verify(client, second["challenge_token"], last_code(CORPORATE)).status_code == 200


def test_many_quick_retries_never_reach_the_limit(client):
    for _ in range(settings.TWO_FACTOR_MAX_CODES + 3):
        assert web_login(client).status_code == 200
    assert len(OUTBOX[CORPORATE]) == 1


def test_timers_count_down_from_the_code_actually_sent(client, db):
    web_login(client)
    age_code(db, 40)
    body = web_login(client).json()
    assert body["resend_seconds"] == settings.TWO_FACTOR_RESEND_SECONDS - 40
    assert body["code_seconds"] == settings.TWO_FACTOR_CODE_SECONDS - 40


def test_after_the_pause_a_new_sign_in_sends_a_new_code(client, db):
    first = web_login(client).json()
    old_code = last_code(CORPORATE)
    age_code(db, settings.TWO_FACTOR_RESEND_SECONDS + 1)
    second = web_login(client).json()
    assert len(OUTBOX[CORPORATE]) == 2
    assert second["resend_seconds"] == settings.TWO_FACTOR_RESEND_SECONDS
    assert at(second["expires_at"]) > at(first["expires_at"])
    new_code = last_code(CORPORATE)
    if new_code != old_code:
        assert verify(client, second["challenge_token"], old_code).status_code == 400
    assert verify(client, second["challenge_token"], new_code).status_code == 200


def test_wrong_attempts_survive_a_quick_second_sign_in(client):
    """Otherwise signing in again would give 5 more guesses of the same code."""
    token = web_login(client).json()["challenge_token"]
    code = last_code(CORPORATE)
    for _ in range(settings.TWO_FACTOR_MAX_ATTEMPTS - 1):
        assert verify(client, token, wrong(code)).status_code == 400
    token = web_login(client).json()["challenge_token"]
    assert len(OUTBOX[CORPORATE]) == 1
    verify(client, token, wrong(code))  # the 5th wrong one overall: a new code goes out
    assert len(OUTBOX[CORPORATE]) == 2


def test_website_then_phone_is_a_different_sign_in_and_gets_its_own_code(client):
    site = web_login(client).json()
    r = staff_login(client, *ADMIN, phone="admin phone")
    assert r.status_code == 202, r.text
    assert len(OUTBOX[CORPORATE]) == 2
    assert verify(client, site["challenge_token"], last_code(CORPORATE)).status_code == 400  # cancelled
    assert verify(client, r.json()["challenge_token"], last_code(CORPORATE)).status_code == 200


def _slow_mail(monkeypatch, seconds=0.4):
    """Sending takes a while, so parallel requests really overlap."""
    def send(to, subject, text):
        time.sleep(seconds)
        OUTBOX.setdefault(to, []).append(text)
    monkeypatch.setattr("app.services.email_service.send_email", send)


def _parallel(calls):
    results = [None] * len(calls)
    start = threading.Barrier(len(calls))

    def run(i, call):
        with TestClient(app) as c:
            start.wait()
            results[i] = call(c)

    threads = [threading.Thread(target=run, args=(i, call)) for i, call in enumerate(calls)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)
    return results


def test_double_click_on_send_again_sends_one_code(client, db, monkeypatch):
    token = web_login(client).json()["challenge_token"]
    age_code(db, settings.TWO_FACTOR_RESEND_SECONDS + 1)
    _slow_mail(monkeypatch)
    results = _parallel([lambda c: resend(c, token), lambda c: resend(c, token)])
    assert sorted(r.status_code for r in results) == [200, 429]
    assert len(OUTBOX[CORPORATE]) == 2  # the first code + exactly one more


def test_double_click_on_sign_in_sends_one_code(client, monkeypatch):
    _slow_mail(monkeypatch)
    results = _parallel([web_login, web_login])
    assert [r.status_code for r in results] == [200, 200]
    assert len(OUTBOX[CORPORATE]) == 1
