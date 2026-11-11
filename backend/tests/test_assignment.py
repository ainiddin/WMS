"""Orders are approved by the system and spread evenly between Workers; waiting orders form a fair queue."""

from datetime import timedelta

import pytest

from app.models import MovementType, StockMovement
from app.models.common import utcnow
from app.services import eta_service


@pytest.fixture
def crew(api, team):
    """The team from conftest plus two more Workers and plenty of kettles."""
    w2, w2_id = api.staff("worker2@wms.kz", "WORKER", manager_id=team["manager_id"])
    w3, w3_id = api.staff("worker3@wms.kz", "WORKER", manager_id=team["manager_id"])
    api.stock_in(team["worker"], team["product"]["id"], 90)  # 100 in stock
    return team | {"workers": {team["worker_id"]: team["worker"], w2_id: w2, w3_id: w3}}


def loads(client, headers) -> dict[int, int]:
    return {row["worker"]["id"]: row["open_units"] for row in client.get("/api/orders/workload/", headers=headers).json()}


def test_orders_are_spread_evenly_by_units(client, api, crew):
    for qty in (5, 1, 1, 1, 4, 2):
        order = api.order(crew["customer"], [(crew["product"]["id"], qty)]).json()
        assert order["status"] == "APPROVED" and order["assigned_to"] is not None
    units = loads(client, crew["manager"])
    assert sum(units.values()) == 14
    assert max(units.values()) - min(units.values()) <= 5  # within one order
    assert set(units) == set(crew["workers"])


def test_workload_and_rebalance_are_for_managers(client, crew):
    assert client.get("/api/orders/workload/", headers=crew["worker"]).status_code == 403
    assert client.post("/api/orders/rebalance/", headers=crew["customer"]).status_code == 403
    r = client.post("/api/orders/rebalance/", headers=crew["manager"])
    assert r.status_code == 200 and r.json()["moved"] == 0


def test_any_worker_can_take_over_an_order(client, api, crew):
    order = api.order(crew["customer"], [(crew["product"]["id"], 1)]).json()
    other_id = next(w for w in crew["workers"] if w != order["assigned_to"]["id"])
    r = client.post(f"/api/orders/{order['id']}/ship/", headers=crew["workers"][other_id])
    assert r.status_code == 200
    assert r.json()["shipped_by"]["id"] == other_id and r.json()["assigned_to"]["id"] == other_id


def test_blocked_worker_orders_go_to_the_others(client, api, crew):
    for _ in range(6):
        api.order(crew["customer"], [(crew["product"]["id"], 1)])
    gone = crew["worker_id"]
    assert loads(client, crew["manager"])[gone] > 0
    employees = client.get("/api/admin/employees/", headers=api.admin).json()
    user_id = next(e["user_id"] for e in employees if e["id"] == gone)
    assert client.post(f"/api/admin/users/{user_id}/block/", headers=api.admin).status_code == 200

    units = loads(client, crew["manager"])
    assert gone not in units and sum(units.values()) == 6 and set(units.values()) == {3}
    open_orders = client.get("/api/orders/?status=APPROVED", headers=crew["manager"]).json()
    assert all(o["assigned_to"]["id"] != gone for o in open_orders)


def test_without_workers_orders_wait_for_the_first_worker(client, api):
    m, m_id = api.staff("lonely@wms.kz", "MANAGER")
    product = api.product(m, "Mug", price=100)
    api.stock_in(m, product["id"], 5)
    customer = api.customer("c@mail.kz")
    order = api.order(customer, [(product["id"], 1)]).json()
    assert order["status"] == "APPROVED" and order["assigned_to"] is None  # approved, nobody to give it to

    _, w_id = api.staff("first.worker@wms.kz", "WORKER", manager_id=m_id)
    again = client.get(f"/api/orders/{order['id']}/", headers=m).json()
    assert again["assigned_to"]["id"] == w_id


def test_waiting_order_is_approved_when_goods_arrive(client, api, team):
    order = api.order(team["customer"], [(team["product"]["id"], 15)]).json()  # 10 in stock
    assert order["status"] == "PENDING"
    assert order["waiting"] == [{"product_id": team["product"]["id"], "product_code": team["product"]["code"],
                                 "product_name": "Kettle", "missing": 5}]
    api.stock_in(team["worker"], team["product"]["id"], 5)
    r = client.get(f"/api/orders/{order['id']}/", headers=team["customer"]).json()
    assert r["status"] == "APPROVED" and r["waiting"] is None
    assert r["assigned_to"]["id"] == team["worker_id"]


def test_newer_order_cannot_overtake_a_waiting_one(client, api, team):
    first = api.order(team["customer"], [(team["product"]["id"], 12)]).json()  # waits for 2
    second = api.order(team["customer"], [(team["product"]["id"], 1)]).json()
    assert first["status"] == "PENDING"
    assert second["status"] == "PENDING"  # the 10 kettles are held for the older order
    api.stock_in(team["worker"], team["product"]["id"], 2)
    statuses = {o["id"]: o["status"] for o in client.get("/api/orders/", headers=team["customer"]).json()}
    assert statuses[first["id"]] == "APPROVED" and statuses[second["id"]] == "PENDING"
    api.stock_in(team["worker"], team["product"]["id"], 1)
    assert client.get(f"/api/orders/{second['id']}/", headers=team["customer"]).json()["status"] == "APPROVED"


def test_cancelling_frees_stock_for_the_queue(client, api, team):
    big = api.order(team["customer"], [(team["product"]["id"], 8)]).json()
    small = api.order(team["customer"], [(team["product"]["id"], 5)]).json()
    assert big["status"] == "APPROVED" and small["status"] == "PENDING"
    client.post(f"/api/orders/{big['id']}/cancel/", headers=team["customer"])
    assert client.get(f"/api/orders/{small['id']}/", headers=team["customer"]).json()["status"] == "APPROVED"


def test_checkout_preview_tells_what_will_wait(client, api, team):
    body = {"items": [{"product_id": team["product"]["id"], "quantity": 3}]}
    r = client.post("/api/orders/check/", headers=team["customer"], json=body).json()
    assert r == {"waiting": [], "eta_min_days": None, "eta_max_days": None}

    body["items"][0]["quantity"] = 13
    r = client.post("/api/orders/check/", headers=team["customer"], json=body).json()
    assert r["waiting"][0]["missing"] == 3
    assert 1 <= r["eta_min_days"] < r["eta_max_days"]
    assert client.get("/api/orders/", headers=team["customer"]).json() == []  # nothing was saved


def test_eta_follows_the_delivery_rhythm(db, api, team):
    product_id, worker_id = team["product"]["id"], team["worker_id"]
    now = utcnow()
    # The fixture's delivery was just now; add older ones every 4 days.
    for days in (4, 8, 12, 16):
        db.add(StockMovement(product_id=product_id, movement_type=MovementType.IN, quantity=1,
                             employee_id=worker_id, movement_time=now - timedelta(days=days)))
    db.commit()
    eta = eta_service.product_eta(db, product_id, now)
    assert (eta.min_days, eta.max_days) == (4, 5)

    later = eta_service.product_eta(db, product_id, now + timedelta(days=2))
    assert (later.min_days, later.max_days) == (2, 3)


def test_eta_without_history_is_the_default(db, api, team):
    other = api.product(team["manager"], "Iron", price=100)
    eta = eta_service.product_eta(db, other["id"])
    assert (eta.min_days, eta.max_days) == eta_service.DEFAULT_ETA
