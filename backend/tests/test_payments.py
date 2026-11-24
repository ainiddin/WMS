"""Top-ups by card through CardPay Fake: limits, the gateway page, and the signed webhook that moves the money."""

import json
import logging
import time
from datetime import timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select, text

from app.core.config import settings
from app.fakepay import signing
from app.models import Customer, User
from app.models.common import utcnow
from app.services import account_service, payment_service
from tests.conftest import TEST_CARD, checkout_link

SECRET = settings.FAKEPAY_SECRET


@pytest.fixture
def buyer(api):
    return api.customer("buyer@mail.kz", money=0)


def balance(client, headers) -> float:
    return client.get("/api/account/", headers=headers).json()["balance"]


def status_of(client, headers, code):
    return client.get(f"/api/payments/{code}/", headers=headers)


def event(reference: str, amount: str, kind="payment.succeeded", event_id="evt_test", card=None):
    return json.dumps({"id": event_id, "type": kind, "created": int(time.time()),
                       "data": {"reference": reference, "amount": amount, "currency": "KZT",
                                "card": card or {"brand": "Visa", "last4": "4242"}}}).encode()


def webhook(client, body: bytes, signature: str | None):
    headers = {"Content-Type": "application/json"}
    if signature is not None:
        headers["FakePay-Signature"] = signature
    return client.post("/api/payments/fakepay/webhook/", content=body, headers=headers)


def age(db, sql: str):
    db.execute(text(sql))
    db.commit()


# ---------------- the normal way ----------------
def test_a_top_up_goes_through_the_gateway_page_and_the_webhook(client, api, buyer, fakepay_webhooks):
    r = api.start_top_up(buyer, 50_000)
    assert r.status_code == 201, r.text
    started = r.json()
    assert started["checkout_url"].startswith("/fakepay/checkout?")
    assert status_of(client, buyer, started["code"]).json()["status"] == "PENDING"
    assert balance(client, buyer) == 0  # opening a payment moves no money

    page = client.get(started["checkout_url"])
    assert page.status_code == 200
    assert "CardPay Fake" in page.text and "NOT a real payment" in page.text and "50 000" in page.text

    r = api.pay(started["checkout_url"])
    assert r.status_code == 200 and r.json() == {"redirect": f"/account?payment={started['code']}"}
    assert balance(client, buyer) == 50_000
    paid = status_of(client, buyer, started["code"]).json()
    assert paid["status"] == "SUCCEEDED" and paid["card_brand"] == "Visa" and paid["card_last4"] == "4242"

    body, _ = fakepay_webhooks[-1]
    assert b"4242424242424242" not in body and b"cvc" not in body  # only brand + last 4 reach the shop


def test_coming_back_to_the_site_proves_nothing(client, api, buyer):
    code = api.start_top_up(buyer, 10_000).json()["code"]
    # The customer opens the return address himself without paying.
    assert status_of(client, buyer, code).json()["status"] == "PENDING"
    assert balance(client, buyer) == 0


def test_the_card_number_never_reaches_the_log_or_the_shop(client, api, buyer, db, caplog):
    caplog.set_level(logging.DEBUG)
    api.top_up(buyer, 1000)
    assert "4242424242424242" not in caplog.text and "4242 4242 4242 4242" not in caplog.text
    row = db.execute(text("SELECT card_brand, card_last4 FROM payments")).one()
    assert tuple(row) == ("Visa", "4242")


# ---------------- limits ----------------
@pytest.mark.parametrize("amount", [0, -500, 99, 300_001, 150.5])
def test_one_top_up_is_100_to_300_000(api, buyer, amount):
    assert api.start_top_up(buyer, amount).status_code == 422


def test_the_edges_of_one_top_up_are_allowed(api, buyer):
    assert api.start_top_up(buyer, 100).status_code == 201
    assert api.start_top_up(buyer, 300_000).status_code == 201


def test_at_most_a_million_a_day_counting_open_links(client, api, buyer, db):
    for _ in range(3):
        api.top_up(buyer, 300_000)
    r = api.start_top_up(buyer, 100_001)
    assert r.status_code == 409 and "Left today: 100 000 KZT" in r.json()["detail"]
    open_link = api.start_top_up(buyer, 100_000)  # not paid yet, but it counts
    assert open_link.status_code == 201
    assert api.start_top_up(buyer, 100).status_code == 409

    # The open link expires: its amount is free again.
    age(db, "UPDATE payments SET expires_at = now() - interval '1 second' WHERE status = 'PENDING'")
    assert status_of(client, buyer, open_link.json()["code"]).json()["status"] == "EXPIRED"
    assert api.start_top_up(buyer, 100_000).status_code == 201


def test_the_daily_limit_starts_again_the_next_day(api, buyer, db):
    for _ in range(3):
        api.top_up(buyer, 300_000)
    api.top_up(buyer, 100_000)
    assert api.start_top_up(buyer, 100).status_code == 409
    # Payments cannot be moved back in time (the database forbids editing them), so the clock moves forward.
    customer = db.scalars(select(Customer).join(Customer.user).where(User.email == "buyer@mail.kz")).one()
    payment, _ = payment_service.start_top_up(db, customer, Decimal(300_000), now=utcnow() + timedelta(days=1))
    assert payment.status == "PENDING"


def test_the_limit_is_per_customer(api, buyer):
    other = api.customer("other@mail.kz", money=0)
    for _ in range(3):
        api.top_up(buyer, 300_000)
    api.top_up(buyer, 100_000)
    assert api.start_top_up(other, 300_000).status_code == 201


def test_the_balance_stays_under_the_ceiling(api, buyer, monkeypatch):
    monkeypatch.setattr(account_service, "MAX_BALANCE", 150_000)
    api.top_up(buyer, 100_000)
    assert api.start_top_up(buyer, 40_000).status_code == 201  # open, counts
    r = api.start_top_up(buyer, 20_000)
    assert r.status_code == 409 and "cannot be more than 150 000" in r.json()["detail"]


def test_no_secret_no_top_ups(client, api, buyer, monkeypatch):
    url = api.start_top_up(buyer, 1000).json()["checkout_url"]
    monkeypatch.setattr(settings, "FAKEPAY_SECRET", None)
    assert api.start_top_up(buyer, 1000).status_code == 503
    assert client.get(url).status_code == 503


# ---------------- the gateway page ----------------
@pytest.mark.parametrize("card, problem", [
    ({"number": "4242 4242 4242 4241"}, "check the digits"),
    ({"number": "4242"}, "13 to 19 digits"),
    ({"exp_month": 1, "exp_year": 2020}, "expired"),
    ({"exp_month": 13}, "01 to 12"),
    ({"cvc": "12"}, "CVC"),
    ({"holder": " "}, "name"),
])
def test_wrong_card_details_are_shown_and_nothing_moves(client, api, buyer, fakepay_webhooks, card, problem):
    url = api.start_top_up(buyer, 5000).json()["checkout_url"]
    r = api.pay(url, {**TEST_CARD, **card})
    assert r.status_code == 422
    assert any(problem in e for e in r.json()["detail"])
    assert fakepay_webhooks == [] and balance(client, buyer) == 0


@pytest.mark.parametrize("number, reason", [("4000 0000 0000 0002", "declined"),
                                            ("4000 0000 0000 9995", "Not enough money")])
def test_test_cards_decline_and_another_card_can_be_tried(client, api, buyer, fakepay_webhooks, number, reason):
    started = api.start_top_up(buyer, 5000).json()
    r = api.pay(started["checkout_url"], {**TEST_CARD, "number": number})
    assert r.status_code == 402 and reason in r.json()["detail"]
    assert fakepay_webhooks == [] and balance(client, buyer) == 0
    assert status_of(client, buyer, started["code"]).json()["status"] == "PENDING"  # still open
    assert api.pay(started["checkout_url"]).status_code == 200
    assert balance(client, buyer) == 5000


def test_cancel_closes_the_payment_and_it_cannot_be_paid_after(client, api, buyer):
    started = api.start_top_up(buyer, 5000).json()
    r = client.post("/fakepay/api/cancel", json=checkout_link(started["checkout_url"]))
    assert r.status_code == 200
    s = status_of(client, buyer, started["code"]).json()
    assert s["status"] == "FAILED" and "Cancelled" in s["failure_reason"]
    r = api.pay(started["checkout_url"])
    assert r.status_code == 502  # the shop refuses: nothing is charged
    assert balance(client, buyer) == 0


@pytest.mark.parametrize("change", [{"amount": "999999.00"}, {"ref": "PAY99999"}, {"back": "/somewhere"},
                                   {"expires": 9999999999}, {"sig": "0" * 64}])
def test_a_changed_link_is_refused(client, api, buyer, fakepay_webhooks, change):
    link = checkout_link(api.start_top_up(buyer, 5000).json()["checkout_url"])
    r = client.post("/fakepay/api/pay", json={**link, **change, **TEST_CARD})
    assert r.status_code == 400
    assert fakepay_webhooks == [] and balance(client, buyer) == 0
    query = "&".join(f"{k}={v}" for k, v in {**link, **change}.items())
    assert client.get(f"/fakepay/checkout?{query}").status_code == 400


def test_an_expired_link_cannot_be_paid(client, api, buyer):
    link = checkout_link(api.start_top_up(buyer, 5000).json()["checkout_url"])
    expired = {**link, "expires": int(time.time()) - 1}
    expired["sig"] = signing.sign_link(SECRET, link["ref"], link["amount"], link["currency"], link["back"],
                                       expired["expires"])
    r = client.post("/fakepay/api/pay", json={**expired, **TEST_CARD})
    assert r.status_code == 400 and "expired" in r.json()["detail"]


@pytest.mark.parametrize("back", ["//evil.example/x", "https://evil.example", "/\\evil.example"])
def test_the_gateway_only_returns_to_this_site(client, api, buyer, back):
    link = checkout_link(api.start_top_up(buyer, 5000).json()["checkout_url"])
    link["back"] = back
    link["sig"] = signing.sign_link(SECRET, link["ref"], link["amount"], link["currency"], back, link["expires"])
    assert client.post("/fakepay/api/pay", json={**link, **TEST_CARD}).status_code == 400


# ---------------- the webhook ----------------
def _open(api, buyer, amount=5000):
    return api.start_top_up(buyer, amount).json()["code"]


def test_a_webhook_without_or_with_a_wrong_signature_moves_nothing(client, api, buyer):
    code = _open(api, buyer)
    body = event(code, "5000.00")
    assert webhook(client, body, None).status_code == 400
    assert webhook(client, body, signing.sign_event("not-the-secret", body)).status_code == 400
    assert webhook(client, body, "t=123,v1=abc").status_code == 400
    assert balance(client, buyer) == 0


def test_a_changed_body_breaks_the_signature(client, api, buyer):
    code = _open(api, buyer)
    signature = signing.sign_event(SECRET, event(code, "5000.00"))
    assert webhook(client, event(code, "300000.00"), signature).status_code == 400
    assert balance(client, buyer) == 0


def test_an_old_webhook_is_refused(client, api, buyer):
    code = _open(api, buyer)
    body = event(code, "5000.00")
    old = int(time.time()) - settings.FAKEPAY_EVENT_MAX_AGE_SECONDS - 5
    assert webhook(client, body, signing.sign_event(SECRET, body, old)).status_code == 400
    assert balance(client, buyer) == 0


def test_a_signed_webhook_with_another_amount_is_refused(client, api, buyer):
    code = _open(api, buyer)
    body = event(code, "6000.00")
    assert webhook(client, body, signing.sign_event(SECRET, body)).status_code == 400
    assert balance(client, buyer) == 0


def test_the_same_webhook_twice_credits_once(client, api, buyer, fakepay_webhooks):
    api.top_up(buyer, 5000)
    body, signature = fakepay_webhooks[-1]
    assert webhook(client, body, signature).status_code == 200  # the gateway retried
    assert balance(client, buyer) == 5000


def test_another_event_for_a_paid_payment_is_refused(client, api, buyer, fakepay_webhooks):
    api.top_up(buyer, 5000)
    code = json.loads(fakepay_webhooks[-1][0])["data"]["reference"]
    body = event(code, "5000.00", event_id="evt_other")
    assert webhook(client, body, signing.sign_event(SECRET, body)).status_code == 409
    assert balance(client, buyer) == 5000


def test_an_unknown_payment_is_404(client):
    body = event("PAY99999", "5000.00")
    assert webhook(client, body, signing.sign_event(SECRET, body)).status_code == 404


def test_a_webhook_after_the_link_expired_moves_nothing(client, api, buyer, db):
    code = _open(api, buyer)
    age(db, "UPDATE payments SET expires_at = now() - interval '1 second'")
    body = event(code, "5000.00")
    assert webhook(client, body, signing.sign_event(SECRET, body)).status_code == 409
    assert balance(client, buyer) == 0
    assert status_of(client, buyer, code).json()["status"] == "EXPIRED"


def test_payments_of_other_customers_are_hidden(client, api, buyer):
    code = _open(api, buyer)
    other = api.customer("other@mail.kz", money=0)
    assert status_of(client, other, code).status_code == 404
    assert status_of(client, buyer, "PAY99999").status_code == 404


# ---------------- the Admin ----------------
def test_the_admin_sees_the_money_received_read_only(client, api, buyer):
    api.top_up(buyer, 7000)
    _open(api, buyer, 3000)
    admin = api.admin
    r = client.get("/api/admin/payments/", headers=admin)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["gateway"] == "CardPay Fake" and data["total"] == 7000 and data["today"] == 7000
    assert [p["status"] for p in data["payments"]] == ["PENDING", "SUCCEEDED"]
    assert data["payments"][1]["customer_name"] and data["payments"][1]["card_last4"] == "4242"
    assert client.get("/api/admin/payments/", headers=buyer).status_code == 403
