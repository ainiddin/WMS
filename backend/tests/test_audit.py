from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.models import AuditAction, AuditLog, User
from app.services import audit_service
from app.services.timeutil import local_tz
from tests.conftest import PASSWORD, staff_login


def user_id(client, admin, email):
    users = client.get(f"/api/admin/users/?search={email}", headers=admin).json()
    return next(u["id"] for u in users if u["email"] == email)


def audit(client, admin, **params):
    r = client.get("/api/admin/audit/", headers=admin, params=params)
    assert r.status_code == 200, r.text
    # The Admin's own sign in (email code) is logged too; these tests look at the other actions.
    return [row for row in r.json() if not row["action"].startswith("TWO_FACTOR_")]


def test_block_and_unblock_are_logged_with_actor_target_and_ip(client, api):
    admin = api.admin
    api.customer("buyer@mail.kz")
    uid = user_id(client, admin, "buyer@mail.kz")

    assert client.post(f"/api/admin/users/{uid}/block/", headers=admin).status_code == 200
    assert client.post(f"/api/admin/users/{uid}/unblock/", headers=admin).status_code == 200

    rows = audit(client, admin)
    assert [r["action"] for r in rows] == ["USER_UNBLOCKED", "USER_BLOCKED"]  # newest first
    for row in rows:
        assert row["actor_email"] == "admin001@wms.kz"
        assert row["target_user_id"] == uid
        assert row["target_email"] == "buyer@mail.kz"
        assert row["ip"] == "testclient"


def test_a_refused_action_leaves_no_log_row(client, api):
    admin = api.admin
    me = user_id(client, admin, "admin001@wms.kz")
    assert client.post(f"/api/admin/users/{me}/block/", headers=admin).status_code == 409
    assert client.post("/api/admin/users/999/block/", headers=admin).status_code == 404
    api.customer("buyer@mail.kz")
    uid = user_id(client, admin, "buyer@mail.kz")
    assert client.post(f"/api/admin/users/{uid}/unblock/", headers=admin).status_code == 409  # not blocked
    assert audit(client, admin) == []


def test_role_change_keeps_old_and_new_values(client, api):
    admin = api.admin
    _, boss_id = api.staff("boss@wms.kz", "MANAGER")
    _, boss2_id = api.staff("boss2@wms.kz", "MANAGER")
    api.staff("arman@wms.kz", "WORKER", boss_id)
    uid = user_id(client, admin, "arman@wms.kz")

    r = client.patch(f"/api/admin/users/{uid}/role/", headers=admin, json={"role": "WORKER", "manager_id": boss2_id})
    assert r.status_code == 200, r.text
    row = audit(client, admin, action="ROLE_CHANGED")[0]
    assert row["details"] == {"old_role": "WORKER", "new_role": "WORKER",
                              "old_manager_id": boss_id, "new_manager_id": boss2_id}


def test_team_change_and_approval_are_logged(client, api):
    admin = api.admin
    _, boss_id = api.staff("boss@wms.kz", "MANAGER")
    _, boss2_id = api.staff("boss2@wms.kz", "MANAGER")
    _, worker_id = api.staff("arman@wms.kz", "WORKER", boss_id)

    approved = audit(client, admin, action="USER_APPROVED")
    assert {r["target_email"] for r in approved} == {"boss@wms.kz", "boss2@wms.kz", "arman@wms.kz"}
    assert next(r for r in approved if r["target_email"] == "arman@wms.kz")["details"] == {
        "role": "WORKER", "manager_id": boss_id}

    r = client.patch(f"/api/admin/employees/{worker_id}/team/", headers=admin, json={"manager_id": boss2_id})
    assert r.status_code == 200, r.text
    row = audit(client, admin, action="TEAM_CHANGED")[0]
    assert row["target_email"] == "arman@wms.kz"
    assert row["details"] == {"old_manager_id": boss_id, "new_manager_id": boss2_id}


def test_phone_approval_and_block_are_logged(client, api):
    admin = api.admin
    api.staff("boss@wms.kz", "MANAGER")
    assert staff_login(client, "boss@wms.kz", PASSWORD, phone="second phone").status_code == 403  # new phone waits
    pending = client.get("/api/admin/devices/?status=PENDING", headers=admin).json()
    device = next(d for d in pending if d["user_email"] == "boss@wms.kz")

    assert client.post(f"/api/admin/devices/{device['id']}/approve/", headers=admin).status_code == 200
    assert client.post(f"/api/admin/devices/{device['id']}/revoke/", headers=admin).status_code == 200

    rows = [r for r in audit(client, admin) if r["details"].get("device_id") == device["id"]]
    assert [r["action"] for r in rows] == ["DEVICE_REVOKED", "DEVICE_APPROVED"]
    assert rows[0]["details"]["device_name"] == "Test phone"
    assert rows[0]["target_email"] == "boss@wms.kz"


def test_clearing_the_login_timer_records_how_many_failures_there_were(client, api):
    admin = api.admin
    api.customer("forgetful@mail.kz")
    for _ in range(3):
        client.post("/api/auth/login/", data={"username": "forgetful@mail.kz", "password": "wrong-password"})
    uid = user_id(client, admin, "forgetful@mail.kz")
    assert client.post(f"/api/admin/users/{uid}/clear-login-timer/", headers=admin).status_code == 200
    row = audit(client, admin, action="LOGIN_TIMER_CLEARED")[0]
    assert row["details"] == {"failed_logins": 3}


def test_filters(client, api):
    admin = api.admin
    api.customer("a@mail.kz")
    api.customer("b@mail.kz")
    a, b = user_id(client, admin, "a@mail.kz"), user_id(client, admin, "b@mail.kz")
    client.post(f"/api/admin/users/{a}/block/", headers=admin)
    client.post(f"/api/admin/users/{b}/block/", headers=admin)
    client.post(f"/api/admin/users/{b}/unblock/", headers=admin)
    me = user_id(client, admin, "admin001@wms.kz")

    assert len(audit(client, admin, user_id=b)) == 2
    assert len(audit(client, admin, target_user_id=a)) == 1
    assert len(audit(client, admin, actor_id=me)) == 3
    assert audit(client, admin, actor_id=a) == []
    assert len(audit(client, admin, action="USER_BLOCKED")) == 2
    assert len(audit(client, admin, limit=1, offset=2)) == 1
    assert audit(client, admin, limit=1)[0]["action"] == "USER_UNBLOCKED"

    today = datetime.now(local_tz()).date()  # "today" in the shop time zone, as the API reads dates
    assert len(audit(client, admin, date_from=today, date_to=today)) == 3  # both ends included
    assert len(audit(client, admin, date_from=today - timedelta(days=1), date_to=today + timedelta(days=1))) == 3
    assert audit(client, admin, date_from=today + timedelta(days=2)) == []
    assert audit(client, admin, date_to=today - timedelta(days=2)) == []


def test_bad_filters_are_refused(client, api):
    admin = api.admin
    today = date.today()
    assert client.get("/api/admin/audit/", headers=admin,
                      params={"date_from": today, "date_to": today - timedelta(days=1)}).status_code == 422
    assert client.get("/api/admin/audit/?action=DROP_TABLE", headers=admin).status_code == 422
    assert client.get("/api/admin/audit/?limit=0", headers=admin).status_code == 422
    assert client.get("/api/admin/audit/?limit=501", headers=admin).status_code == 422
    assert client.get("/api/admin/audit/?offset=-1", headers=admin).status_code == 422


def test_only_admin_reads_the_log(client, api):
    manager, _ = api.staff("boss@wms.kz", "MANAGER")
    customer = api.customer("buyer@mail.kz")
    assert client.get("/api/admin/audit/", headers=manager).status_code == 403
    assert client.get("/api/admin/audit/", headers=customer).status_code == 403
    assert client.get("/api/admin/audit/").status_code == 401


def test_the_database_refuses_to_change_or_delete_log_rows(client, api, db):
    admin = api.admin
    api.customer("buyer@mail.kz")
    client.post(f"/api/admin/users/{user_id(client, admin, 'buyer@mail.kz')}/block/", headers=admin)

    with pytest.raises(DBAPIError, match="append-only"):
        db.execute(text("UPDATE audit_log SET action = 'NOTHING_HAPPENED'"))
    db.rollback()
    with pytest.raises(DBAPIError, match="append-only"):
        db.execute(text("DELETE FROM audit_log"))
    db.rollback()
    assert db.query(AuditLog).count() == 3  # code sent + code passed (Admin sign in) + the block


def test_a_user_with_log_rows_cannot_be_deleted(db):
    """Deleting a user would orphan his history; the foreign key refuses it (and SET NULL would hit the trigger)."""
    user = User(email="gone@mail.kz", password_hash="x", full_name="Gone", role="CUSTOMER", status="ACTIVE")
    db.add(user)
    db.flush()
    audit_service.log(db, AuditAction.USER_BLOCKED, None, user, "1.2.3.4")
    db.commit()
    with pytest.raises(IntegrityError, match="audit_log"):
        db.delete(user)
        db.flush()
    db.rollback()


def test_no_admin_action_happens_without_a_log_row(client, api):
    """Guard: every state-changing admin endpoint must write to the log. A new endpoint without it fails here."""
    from app.routers.admin import router

    changing = {(m, r.path) for r in router.routes for m in r.methods if m in {"POST", "PATCH", "PUT", "DELETE"}}
    logged = {
        ("POST", "/api/admin/users/{user_id}/approve/"), ("POST", "/api/admin/users/{user_id}/reject/"),
        ("POST", "/api/admin/users/{user_id}/block/"), ("POST", "/api/admin/users/{user_id}/unblock/"),
        ("POST", "/api/admin/users/{user_id}/clear-login-timer/"), ("PATCH", "/api/admin/users/{user_id}/role/"),
        ("PATCH", "/api/admin/employees/{employee_id}/team/"), ("POST", "/api/admin/devices/{device_id}/approve/"),
        ("POST", "/api/admin/devices/{device_id}/revoke/"),
    }
    assert changing == logged, "a state-changing admin endpoint was added or removed: log it and update this list"
