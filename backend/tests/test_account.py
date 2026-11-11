"""Customer account: top up from the (simulated) bank, pay for orders, refunds."""


def test_new_customer_has_an_empty_account(client, api):
    c = api.customer("new@mail.kz", money=0)
    r = client.get("/api/account/", headers=c)
    assert r.status_code == 200
    assert r.json()["balance"] == 0
    assert r.json()["code"].startswith("A")
    assert r.json()["transactions"] == []


def test_top_up_adds_money_and_is_logged(client, api):
    c = api.customer("top@mail.kz", money=0)
    r = api.top_up(c, 25_000)
    assert r.status_code == 201
    account = r.json()
    assert account["balance"] == 25_000
    tx = account["transactions"][0]
    assert tx["tx_type"] == "TOPUP" and tx["amount"] == 25_000 and tx["balance_after"] == 25_000
    assert "Demo Bank" in tx["note"]
    assert client.get("/api/customers/me/", headers=c).json()["balance"] == 25_000


def test_top_up_amount_is_checked(client, api):
    c = api.customer("limits@mail.kz", money=0)
    for bad in (0, -500, 99, 1_000_001, 150.5):
        assert api.top_up(c, bad).status_code == 422, bad
    for _ in range(10):
        assert api.top_up(c, 1_000_000).status_code == 201
    r = api.top_up(c, 100)  # 10 000 000 is the limit
    assert r.status_code == 409


def test_order_is_paid_from_the_account(client, api, team):
    c = team["customer"]
    before = api.balance(c)
    order = api.order(c, [(team["product"]["id"], 2)]).json()
    assert order["payment_status"] == "PAID"
    assert api.balance(c) == before - 3000
    tx = client.get("/api/account/", headers=c).json()["transactions"][0]
    assert tx["tx_type"] == "PAYMENT" and tx["amount"] == 3000 and tx["order_code"] == order["code"]


def test_not_enough_money_means_no_order(client, api, team):
    poor = api.customer("poor@mail.kz", money=1000)
    r = api.order(poor, [(team["product"]["id"], 1)])  # 1500 KZT
    assert r.status_code == 402
    assert "Top up at least 500 KZT" in r.json()["detail"]
    assert client.get("/api/orders/", headers=poor).json() == []
    assert api.balance(poor) == 1000


def test_cancel_and_reject_give_the_money_back(client, api, team):
    c = team["customer"]
    before = api.balance(c)
    o1 = api.order(c, [(team["product"]["id"], 1)]).json()
    o2 = api.order(c, [(team["product"]["id"], 2)]).json()
    assert api.balance(c) == before - 4500

    r = client.post(f"/api/orders/{o1['id']}/cancel/", headers=c)
    assert r.json()["payment_status"] == "REFUNDED"
    r = client.post(f"/api/orders/{o2['id']}/reject/", headers=team["manager"], json={"reason": "test"})
    assert r.json()["payment_status"] == "REFUNDED"
    assert api.balance(c) == before

    types = [t["tx_type"] for t in client.get("/api/account/", headers=c).json()["transactions"]]
    assert types[:4] == ["REFUND", "REFUND", "PAYMENT", "PAYMENT"]


def test_shipped_order_stays_paid(client, api, team):
    c = team["customer"]
    order = api.order(c, [(team["product"]["id"], 1)]).json()
    client.post(f"/api/orders/{order['id']}/approve/", headers=team["manager"])
    r = client.post(f"/api/orders/{order['id']}/ship/", headers=team["worker"])
    assert r.json()["payment_status"] == "PAID"


def test_only_customers_have_an_account(client, api, team):
    assert client.get("/api/account/", headers=team["manager"]).status_code == 403
    assert client.post("/api/account/top-up/", json={"amount": 1000}).status_code == 401


def test_managers_see_customer_balances(client, api, team):
    rows = client.get("/api/customers/", headers=team["manager"]).json()
    assert rows[0]["balance"] == 100_000
