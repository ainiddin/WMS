"""Demo channel: Admin sign in codes go to the owner's Telegram chat when TG_BOT_TOKEN and TG_OWNER_CHAT_ID are set.

Real Telegram is never called: httpx.post inside telegram_service is replaced by a fake.
"""

import json
from datetime import timedelta
import logging
import re

import httpx
import pytest
from sqlalchemy import func, select

from app.core.config import settings
from app.models import TwoFactorChallenge
from app.services import telegram_service
from tests.conftest import ADMIN, OUTBOX, staff_login

TOKEN = "123456:FAKE-bot-token-for-tests"
CHAT = "987654321"


class FakeTelegram:
    """Records what the bot would send; `answer` decides what Telegram replies."""

    def __init__(self):
        self.sent: list[dict] = []
        self.answer = lambda url: httpx.Response(200, json={"ok": True, "result": {}})

    def post(self, url, json=None, timeout=None):
        self.sent.append({"url": url, "json": json, "timeout": timeout})
        return self.answer(url)

    def last_code(self) -> str:
        return re.search(r"code: (\d{6})", self.sent[-1]["json"]["text"]).group(1)


@pytest.fixture
def tg(monkeypatch):
    fake = FakeTelegram()
    monkeypatch.setattr(telegram_service.httpx, "post", fake.post)
    monkeypatch.setattr(settings, "TG_BOT_TOKEN", TOKEN)
    monkeypatch.setattr(settings, "TG_OWNER_CHAT_ID", CHAT)
    return fake


def web_login(client):
    return client.post("/api/auth/admin/login/", json={"email": ADMIN[0], "password": ADMIN[1]})


def verify(client, token, code):
    return client.post("/api/auth/2fa/verify/", json={"challenge_token": token, "code": code})


def challenges(db) -> int:
    return db.scalar(select(func.count()).select_from(TwoFactorChallenge))


def test_code_goes_to_the_owner_chat_and_signs_the_admin_in(client, tg, monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_2FA_EMAIL", None)  # the mailbox is not needed in Telegram mode
    r = web_login(client)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sent_via"] == "telegram" and body["sent_to"] == "Telegram"
    assert OUTBOX == {}  # nothing by email

    assert len(tg.sent) == 1
    call = tg.sent[0]
    assert call["url"] == f"https://api.telegram.org/bot{TOKEN}/sendMessage"
    assert call["json"]["chat_id"] == CHAT
    assert "parse_mode" not in call["json"]  # plain text: names from the database cannot break formatting
    assert call["timeout"] == 15
    text = call["json"]["text"]
    assert f"Account: {ADMIN[0]}" in text and "Where: the website" in text
    code = tg.last_code()
    assert code not in r.text

    r = verify(client, body["challenge_token"], code)
    assert r.status_code == 200, r.text
    assert r.json()["user"]["role"] == "ADMIN"


def test_send_again_also_goes_to_telegram_and_only_the_new_code_works(client, tg, db):
    body = web_login(client).json()
    first = tg.last_code()
    db.execute(TwoFactorChallenge.__table__.update().values(
        code_sent_at=TwoFactorChallenge.code_sent_at - timedelta(seconds=61)))
    db.commit()
    r = client.post("/api/auth/2fa/resend/", json={"challenge_token": body["challenge_token"]})
    assert r.status_code == 200, r.text
    assert len(tg.sent) == 2 and OUTBOX == {}
    second = tg.last_code()
    if first != second:
        assert verify(client, body["challenge_token"], first).status_code == 400
    assert verify(client, body["challenge_token"], second).status_code == 200


def test_first_sign_in_on_a_phone_also_asks_the_telegram_code(client, tg):
    r = staff_login(client, *ADMIN, phone="admin phone")
    assert r.status_code == 202, r.text
    assert r.json()["sent_via"] == "telegram"
    assert 'Where: the phone "Test phone"' in tg.sent[-1]["json"]["text"]
    r = verify(client, r.json()["challenge_token"], tg.last_code())
    assert r.status_code == 200, r.text


@pytest.mark.parametrize("missing", ["TG_BOT_TOKEN", "TG_OWNER_CHAT_ID"])
def test_half_set_up_telegram_refuses_and_sends_nothing(client, tg, db, monkeypatch, missing):
    monkeypatch.setattr(settings, missing, "")
    r = web_login(client)
    assert r.status_code == 503
    assert "Telegram is half set up" in r.json()["detail"]
    assert tg.sent == [] and OUTBOX == {}  # not even a fallback to email: the setup is broken, say so
    assert challenges(db) == 0


def test_without_telegram_the_code_still_goes_to_the_corporate_mailbox(client, monkeypatch):
    def must_not_be_called(*a, **kw):
        raise AssertionError("Telegram was called without TG_* settings")

    monkeypatch.setattr(telegram_service.httpx, "post", must_not_be_called)
    r = web_login(client)
    assert r.status_code == 200, r.text
    assert r.json()["sent_via"] == "email" and r.json()["sent_to"] == "c***@keyfive.kz"
    assert list(OUTBOX) == ["ceo-office@keyfive.kz"]


def _timeout(url):
    raise httpx.ConnectTimeout(f"timed out while connecting to {url}")


@pytest.mark.parametrize("answer", [
    lambda url: httpx.Response(401, json={"ok": False, "description": "Unauthorized"}),
    lambda url: httpx.Response(400, json={"ok": False, "description": "Bad Request: chat not found"}),
    lambda url: httpx.Response(200, json={"ok": False}),
    lambda url: httpx.Response(200, text="<html>not json</html>"),
    _timeout,
], ids=["bad-token", "unknown-chat", "ok-false", "not-json", "timeout"])
def test_telegram_failure_is_502_and_the_token_never_leaks(client, tg, caplog, answer):
    tg.answer = answer
    caplog.set_level(logging.DEBUG)
    r = web_login(client)
    assert r.status_code == 502
    assert r.json()["detail"] == "Could not send the code email, try again later"
    assert TOKEN not in r.text
    assert TOKEN not in caplog.text, "the bot token reached the log"
    assert "Could not send the 2FA code" in caplog.text


def test_a_failed_send_does_not_use_up_the_code_limit(client, tg):
    """Codes that never arrived must not count: otherwise a Telegram outage locks the Admin out for 15 min."""
    tg.answer = lambda url: httpx.Response(500, json={"ok": False})
    for _ in range(settings.TWO_FACTOR_MAX_CODES + 1):
        assert web_login(client).status_code == 502
    tg.answer = lambda url: httpx.Response(200, json={"ok": True})
    assert web_login(client).status_code == 200


def test_httpx_request_logs_are_silenced():
    """httpx writes the request URL (with the bot token) at INFO; the module raises its level to WARNING."""
    root = logging.getLogger()
    before = root.level
    root.setLevel(logging.DEBUG)  # even if the server runs with verbose logs
    try:
        assert not logging.getLogger("httpx").isEnabledFor(logging.INFO)
    finally:
        root.setLevel(before)


def test_send_to_owner_posts_plain_json(monkeypatch):
    fake = FakeTelegram()
    monkeypatch.setattr(telegram_service.httpx, "post", fake.post)
    monkeypatch.setattr(settings, "TG_BOT_TOKEN", TOKEN)
    monkeypatch.setattr(settings, "TG_OWNER_CHAT_ID", CHAT)
    telegram_service.send_to_owner("Hello <b>*_[")
    assert json.dumps(fake.sent[0]["json"]) == json.dumps(
        {"chat_id": CHAT, "text": "Hello <b>*_[", "disable_web_page_preview": True})
