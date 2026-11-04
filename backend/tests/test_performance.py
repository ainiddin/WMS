def ship_one(client, api, team, qty=1):
    order = api.order(team["customer"], [(team["product"]["id"], qty)]).json()
    assert client.post(f"/api/orders/{order['id']}/approve/", headers=team["manager"]).status_code == 200
    assert client.post(f"/api/orders/{order['id']}/ship/", headers=team["worker"]).status_code == 200


def test_points_follow_the_formula(client, api, team):
    ship_one(client, api, team)
    ship_one(client, api, team, qty=2)
    # team fixture already made 1 stock IN by the worker

    me = client.get("/api/performance/me/?period=week", headers=team["worker"]).json()
    assert me["me"]["orders_shipped"] == 2
    assert me["me"]["units_shipped"] == 3
    assert me["me"]["stock_in_count"] == 1
    assert me["me"]["points"] == 2 * 10 + 1 * 1
    assert me["rank_in_team"] == 1 and me["team_size"] == 1

    manager = client.get("/api/performance/me/?period=week", headers=team["manager"]).json()["me"]
    assert manager["orders_approved"] == 2
    assert manager["points"] == 2 * 2

    board = client.get("/api/leaderboard/?period=week", headers=team["worker"]).json()["teams"]
    assert len(board) == 1
    assert board[0]["points"] == 21 + 4
    assert board[0]["rank"] == 1

    timeline = me["timeline"]
    assert len(timeline) == 7
    assert sum(p["orders_shipped"] for p in timeline) == 2


def test_who_sees_what(client, api, team):
    other_m, other_id = api.staff("m2@wms.kz", "MANAGER")
    own = team["manager_id"]

    # Worker: only himself
    assert client.get(f"/api/performance/team/{own}/", headers=team["worker"]).status_code == 403
    assert client.get(f"/api/leaderboard/team/{own}/", headers=team["worker"]).status_code == 403
    assert client.get("/api/performance/all/", headers=team["worker"]).status_code == 403
    # Manager: own team only
    assert client.get(f"/api/performance/team/{own}/", headers=team["manager"]).status_code == 200
    assert client.get(f"/api/performance/team/{other_id}/", headers=team["manager"]).status_code == 403
    assert client.get("/api/performance/all/", headers=team["manager"]).status_code == 403
    # Admin: everything
    admin = api.admin
    assert client.get(f"/api/performance/team/{other_id}/", headers=admin).status_code == 200
    all_teams = client.get("/api/performance/all/?period=year", headers=admin).json()
    assert len(all_teams["teams"]) == 2
    # Customers have no performance at all
    assert client.get("/api/performance/me/", headers=team["customer"]).status_code == 403
    assert client.get("/api/leaderboard/", headers=team["customer"]).status_code == 403


def test_team_view_lists_workers(client, api, team):
    ship_one(client, api, team)
    data = client.get(f"/api/performance/team/{team['manager_id']}/?period=month", headers=team["manager"]).json()
    assert data["team"]["team_name"] == "Team Manager"
    assert [w["employee_id"] for w in data["workers"]] == [team["worker_id"]]
    assert data["workers"][0]["orders_shipped"] == 1


def test_reports_and_exports(client, api, team):
    ship_one(client, api, team, qty=8)  # 10 -> 2, below min 3
    restock = client.get("/api/reports/restock/", headers=team["manager"]).json()
    assert [r["product_id"] for r in restock] == [team["product"]["id"]]
    assert restock[0]["supplier_phone"]

    for name in ("restock", "monthly-usage", "top-customers", "reconciliation", "orders"):
        for fmt, magic in (("xlsx", b"PK"), ("pdf", b"%PDF")):
            r = client.get(f"/api/reports/{name}/export/?format={fmt}", headers=team["manager"])
            assert r.status_code == 200, (name, fmt)
            assert r.content.startswith(magic)
    assert client.get("/api/reports/restock/", headers=team["worker"]).status_code == 403
    assert client.get("/api/dashboard/", headers=team["manager"]).json()["cards"]["products_below_min"] == 1
    assert client.get("/api/products/barcodes/labels.pdf", headers=team["manager"]).content.startswith(b"%PDF")
