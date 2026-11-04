import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError


def test_stock_in_increases_quantity_and_is_logged(client, team):
    p = team["product"]
    r = client.post("/api/movements/in/", headers=team["worker"], json={"barcode": p["barcode"], "quantity": 5})
    assert r.status_code == 201
    assert r.json()["movement_type"] == "IN"
    assert r.json()["code"] == "M0002"

    product = client.get(f"/api/products/{p['id']}/", headers=team["worker"]).json()
    assert product["quantity"] == 15
    history = client.get(f"/api/movements/?product={p['id']}", headers=team["worker"]).json()
    assert [m["quantity"] for m in history] == [5, 10]


@pytest.mark.parametrize("quantity", [0, -5])
def test_stock_in_needs_positive_quantity(api, team, quantity):
    assert api.stock_in(team["worker"], team["product"]["id"], quantity).status_code == 422


def test_unknown_barcode(client, team):
    r = client.post("/api/movements/in/", headers=team["worker"], json={"barcode": "000000", "quantity": 1})
    assert r.status_code == 404


def test_worker_cannot_manage_catalog_or_see_contacts(client, api, team):
    w = team["worker"]
    assert client.post("/api/suppliers/", headers=w, json={"supplier_name": "X", "phone": "+7 700 1"}).status_code == 403
    assert client.patch(f"/api/products/{team['product']['id']}/", headers=w, json={"unit_price": 1}).status_code == 403
    assert client.get("/api/customers/", headers=w).status_code == 403
    assert client.get("/api/suppliers/", headers=w).status_code == 403
    assert api.stock_in(team["customer"], team["product"]["id"], 1).status_code == 403


def test_customer_sees_only_in_stock_flag(client, team):
    product = client.get(f"/api/products/{team['product']['id']}/", headers=team["customer"]).json()
    assert product["in_stock"] is True
    assert "quantity" not in product
    assert "supplier" not in product


def test_quantity_cannot_be_set_directly(client, team):
    r = client.patch(f"/api/products/{team['product']['id']}/", headers=team["manager"], json={"quantity": 999})
    assert r.status_code == 200
    assert r.json()["quantity"] == 10  # ignored: stock changes only through movements


def test_product_with_history_cannot_be_deleted(client, api, team):
    r = client.delete(f"/api/products/{team['product']['id']}/", headers=team["manager"])
    assert r.status_code == 409
    # ...but it can be deactivated
    r = client.patch(f"/api/products/{team['product']['id']}/", headers=team["manager"], json={"is_active": False})
    assert r.json()["is_active"] is False

    fresh = api.product(team["manager"], "Unused")
    assert client.delete(f"/api/products/{fresh['id']}/", headers=team["manager"]).status_code == 204


def test_duplicate_barcode_is_rejected(client, api, team):
    cat_id, sup_id = team["product"]["category"]["id"], team["product"]["supplier"]["id"]
    r = client.post("/api/products/", headers=team["manager"], json={
        "product_name": "Copy", "category_id": cat_id, "supplier_id": sup_id, "unit_price": 1,
        "barcode": team["product"]["barcode"],
    })
    assert r.status_code == 409


# ---- Rules enforced by PostgreSQL itself (same as sql/06_tests.sql) ----
def test_db_rejects_negative_stock(db, team):
    with pytest.raises(IntegrityError, match="chk_products_quantity"):
        db.execute(text("UPDATE products SET quantity = -5 WHERE id = :id"), {"id": team["product"]["id"]})


def test_db_requires_customer_only_for_out(db, team):
    with pytest.raises(IntegrityError, match="chk_customer_for_out"):
        db.execute(text(
            "INSERT INTO stock_movements (product_id, employee_id, movement_type, quantity) VALUES (:p, :e, 'OUT', 1)"
        ), {"p": team["product"]["id"], "e": team["worker_id"]})
    db.rollback()
    with pytest.raises(IntegrityError, match="chk_movement_type|chk_customer_for_out"):
        db.execute(text(
            "INSERT INTO stock_movements (product_id, employee_id, movement_type, quantity) VALUES (:p, :e, 'XX', 1)"
        ), {"p": team["product"]["id"], "e": team["worker_id"]})


def test_db_requires_manager_for_worker(db, team):
    with pytest.raises(IntegrityError, match="chk_employees_manager"):
        db.execute(text("UPDATE employees SET manager_id = NULL WHERE id = :id"), {"id": team["worker_id"]})


def test_reconciliation_is_clean(client, team):
    rows = client.get("/api/reports/reconciliation/", headers=team["manager"]).json()
    assert all(r["ok"] for r in rows)


def test_worker_does_not_see_supplier_phone(client, team):
    pid = team["product"]["id"]
    assert client.get(f"/api/products/{pid}/", headers=team["worker"]).json()["supplier"]["phone"] is None
    assert client.get(f"/api/products/{pid}/", headers=team["manager"]).json()["supplier"]["phone"]
    by_code = client.get(f"/api/products/by-barcode/{team['product']['barcode']}/", headers=team["worker"]).json()
    assert by_code["supplier"]["phone"] is None


def test_popular_products_are_public(client, team):
    r = client.get("/api/products/popular/")
    assert r.status_code == 200
    assert [p["id"] for p in r.json()] == [team["product"]["id"]]
    assert "quantity" not in r.json()[0]
