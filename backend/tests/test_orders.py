from sqlalchemy import text


def get_qty(client, headers, product_id):
    return client.get(f"/api/products/{product_id}/", headers=headers).json()["quantity"]


def test_full_order_flow(client, api, team):
    p = team["product"]
    r = api.order(team["customer"], [(p["id"], 2), (p["id"], 1)])  # same product twice -> one line
    assert r.status_code == 201
    order = r.json()
    # Stock is there: approved by the system at once and given to the only Worker. No Manager needed.
    assert order["status"] == "APPROVED"
    assert order["approved_by"] is None and order["approved_at"]
    assert order["assigned_to"]["id"] == team["worker_id"]
    assert order["code"] == "O0001"
    assert len(order["items"]) == 1 and order["items"][0]["quantity"] == 3
    assert order["total_amount"] == 4500  # 3 x 1500, computed by the server

    # Price change after ordering does not touch the order (rule 6).
    client.patch(f"/api/products/{p['id']}/", headers=team["manager"], json={"unit_price": 9999})

    r = client.post(f"/api/orders/{order['id']}/ship/", headers=team["worker"])
    assert r.status_code == 200
    shipped = r.json()
    assert shipped["status"] == "SHIPPED"
    assert shipped["shipped_by"]["id"] == team["worker_id"]
    assert shipped["total_amount"] == 4500
    assert get_qty(client, team["manager"], p["id"]) == 7

    outs = client.get(f"/api/movements/?type=OUT&order={order['id']}", headers=team["worker"]).json()
    assert len(outs) == 1 and outs[0]["quantity"] == 3 and outs[0]["customer_id"] is not None


def test_order_waits_when_not_enough_stock(client, api, team):
    order = api.order(team["customer"], [(team["product"]["id"], 11)]).json()  # 10 in stock
    assert order["status"] == "PENDING"
    assert order["assigned_to"] is None
    assert order["waiting"][0]["missing"] == 1
    assert order["eta_min_days"] >= 1 and order["eta_max_days"] > order["eta_min_days"]
    # A Manager cannot push it through either: the stock is simply not there.
    r = client.post(f"/api/orders/{order['id']}/approve/", headers=team["manager"])
    assert r.status_code == 409
    assert "Not enough stock" in r.json()["detail"]


def test_ship_rolls_back_completely(client, api, team, db):
    first = team["product"]
    second = api.product(team["manager"], "Pan", price=2000)
    api.stock_in(team["worker"], second["id"], 3)
    big = api.order(team["customer"], [(first["id"], 4), (second["id"], 3)]).json()
    assert big["status"] == "APPROVED"
    # Two pans were found broken and written off directly in the database (not through the app).
    db.execute(text("UPDATE products SET quantity = 1 WHERE id = :id"), {"id": second["id"]})
    db.commit()

    r = client.post(f"/api/orders/{big['id']}/ship/", headers=team["worker"])
    assert r.status_code == 409
    # Nothing from the failed shipment was saved: kettles untouched, no OUT rows, still APPROVED.
    assert get_qty(client, team["manager"], first["id"]) == 10
    assert get_qty(client, team["manager"], second["id"]) == 1
    assert client.get(f"/api/movements/?order={big['id']}", headers=team["worker"]).json() == []
    assert client.get(f"/api/orders/{big['id']}/", headers=team["manager"]).json()["status"] == "APPROVED"


def test_customer_sees_only_own_orders(client, api, team):
    mine = api.order(team["customer"], [(team["product"]["id"], 1)]).json()
    other = api.customer("other@mail.kz")
    theirs = api.order(other, [(team["product"]["id"], 1)]).json()

    listed = client.get("/api/orders/", headers=team["customer"]).json()
    assert [o["id"] for o in listed] == [mine["id"]]
    assert client.get(f"/api/orders/{theirs['id']}/", headers=team["customer"]).status_code == 404
    assert client.post(f"/api/orders/{theirs['id']}/cancel/", headers=team["customer"]).status_code == 404


def test_status_rules(client, api, team):
    empty = api.product(team["manager"], "Toaster", price=500)  # nothing in stock
    waiting = api.order(team["customer"], [(empty["id"], 1)]).json()
    wid = waiting["id"]
    assert client.post(f"/api/orders/{wid}/approve/", headers=team["worker"]).status_code == 403
    assert client.post(f"/api/orders/{wid}/ship/", headers=team["worker"]).status_code == 409  # not approved yet

    order = api.order(team["customer"], [(team["product"]["id"], 1)]).json()
    oid = order["id"]
    assert order["status"] == "APPROVED"
    # Customer may cancel until the order is shipped
    assert client.post(f"/api/orders/{oid}/cancel/", headers=team["customer"]).json()["status"] == "CANCELLED"
    assert client.post(f"/api/orders/{oid}/ship/", headers=team["worker"]).status_code == 409
    assert client.post(f"/api/orders/{oid}/cancel/", headers=team["manager"]).status_code == 409


def test_reject_and_customer_cancel(client, api, team):
    a = api.order(team["customer"], [(team["product"]["id"], 1)]).json()
    r = client.post(f"/api/orders/{a['id']}/reject/", headers=team["manager"], json={"reason": "Out of area"})
    assert r.json()["status"] == "REJECTED" and r.json()["rejection_reason"] == "Out of area"

    b = api.order(team["customer"], [(team["product"]["id"], 1)]).json()
    assert client.post(f"/api/orders/{b['id']}/cancel/", headers=team["customer"]).json()["status"] == "CANCELLED"
    shipped = api.order(team["customer"], [(team["product"]["id"], 1)]).json()
    client.post(f"/api/orders/{shipped['id']}/ship/", headers=team["worker"])
    assert client.post(f"/api/orders/{shipped['id']}/cancel/", headers=team["customer"]).status_code == 409


def test_inactive_product_cannot_be_ordered(client, api, team):
    client.patch(f"/api/products/{team['product']['id']}/", headers=team["manager"], json={"is_active": False})
    assert api.order(team["customer"], [(team["product"]["id"], 1)]).status_code == 422


def test_staff_cannot_create_orders(api, team):
    assert api.order(team["worker"], [(team["product"]["id"], 1)]).status_code == 403
