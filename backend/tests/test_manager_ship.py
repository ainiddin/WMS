"""A Manager ships orders on the website: only orders of his own team, recorded as the shipper."""

import pytest


@pytest.fixture
def order(client, api, team):
    """An approved order of 2 kettles, given to the team's Worker."""
    r = api.order(team["customer"], [(team["product"]["id"], 2)])
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "APPROVED" and body["assigned_to"]["id"] == team["worker_id"]
    return body


def ship(client, headers, order_id):
    return client.post(f"/api/orders/{order_id}/ship/", headers=headers)


def stock(client, headers, product_id):
    return client.get(f"/api/products/{product_id}/", headers=headers).json()["quantity"]


def test_a_manager_ships_an_order_of_his_worker(client, team, order):
    r = ship(client, team["manager"], order["id"])
    assert r.status_code == 200, r.text
    shipped = r.json()
    assert shipped["status"] == "SHIPPED"
    assert shipped["shipped_by"]["id"] == team["manager_id"]
    assert shipped["assigned_to"]["id"] == team["worker_id"]  # the order stays the Worker's
    assert stock(client, team["manager"], team["product"]["id"]) == 8


def test_a_manager_cannot_ship_an_order_of_another_team(client, api, team, order):
    other, other_id = api.staff("other.boss@wms.kz", "MANAGER")
    r = ship(client, other, order["id"])
    assert r.status_code == 403 and r.json()["detail"] == "This order belongs to another team"
    again = client.get(f"/api/orders/{order['id']}/", headers=team["manager"]).json()
    assert again["status"] == "APPROVED" and again["shipped_by"] is None
    assert stock(client, team["manager"], team["product"]["id"]) == 10  # nothing left the warehouse


def test_a_manager_ships_an_order_given_to_himself(client, team, order, db):
    from sqlalchemy import text
    db.execute(text("UPDATE orders SET assigned_to_id = :m WHERE id = :o"), {"m": team["manager_id"], "o": order["id"]})
    db.commit()
    assert ship(client, team["manager"], order["id"]).status_code == 200


def test_an_order_given_to_nobody_is_not_any_managers(client, team, order, db):
    from sqlalchemy import text
    db.execute(text("UPDATE orders SET assigned_to_id = NULL, assigned_at = NULL WHERE id = :o"), {"o": order["id"]})
    db.commit()
    assert ship(client, team["manager"], order["id"]).status_code == 403


def test_any_worker_still_ships_any_order_and_takes_it_over(client, api, team, order):
    other_boss, other_id = api.staff("other.boss@wms.kz", "MANAGER")
    helper, helper_id = api.staff("helper@wms.kz", "WORKER", manager_id=other_id)
    r = ship(client, helper, order["id"])
    assert r.status_code == 200, r.text
    assert r.json()["shipped_by"]["id"] == helper_id and r.json()["assigned_to"]["id"] == helper_id


def test_shipping_twice_is_refused(client, team, order):
    assert ship(client, team["manager"], order["id"]).status_code == 200
    assert ship(client, team["manager"], order["id"]).status_code == 409


def test_a_customer_cannot_ship(client, team, order):
    assert ship(client, team["customer"], order["id"]).status_code == 403
