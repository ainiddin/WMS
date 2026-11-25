"""Staff join only by invitation LINK; a Manager runs only his own team."""

import hashlib

import pytest
from sqlalchemy import text

from app.core.config import settings
from tests.conftest import PASSWORD, staff_login

GONE = "This invitation link is not valid or has expired. Ask your Manager for a new one."


@pytest.fixture
def boss(api):
    headers, emp_id = api.staff("boss@wms.kz", "MANAGER")
    return {"h": headers, "id": emp_id}


def new_link(client, headers, role="WORKER", url="/api/team/invitations/"):
    r = client.post(url, headers=headers, json={"role": role})
    assert r.status_code == 201, r.text
    return r.json()


def join(client, link, email="arman@wms.kz", first="Arman", last="Bekov", phone="+7 701 111 22 33",
         password=PASSWORD):
    return client.post(f"/api/auth{link}/", json={"first_name": first, "last_name": last, "email": email,
                                                  "phone": phone, "password": password})


def info(client, link):
    return client.get(f"/api/auth{link}/")


# ---------------- creating a link and joining with it ----------------
def test_a_manager_invites_a_worker_by_link_into_his_own_team(client, api, boss):
    created = new_link(client, boss["h"])
    assert created["link"].startswith("/join/") and len(created["link"]) > 40
    assert created["status"] == "PENDING" and created["role"] == "WORKER" and created["team_manager_id"] == boss["id"]
    minutes = settings.INVITATION_LINK_MINUTES
    from datetime import datetime
    created_at = datetime.fromisoformat(created["created_at"].replace("Z", "+00:00"))
    expires = datetime.fromisoformat(created["expires_at"].replace("Z", "+00:00"))
    assert abs((expires - created_at).total_seconds() - minutes * 60) < 5

    page = info(client, created["link"])
    assert page.status_code == 200
    assert page.json()["role"] == "WORKER" and page.json()["team_name"]

    r = join(client, created["link"], email="  Arman@WMS.kz ")
    assert r.status_code == 201, r.text
    user = r.json()
    assert user["email"] == "arman@wms.kz" and user["full_name"] == "Arman Bekov" and user["role"] == "WORKER"
    assert user["status"] == "ACTIVE" and user["manager_id"] == boss["id"]
    assert user["employee_code"].startswith("E")  # the employee id he gets right away
    assert PASSWORD not in r.text and "password_hash" not in r.text

    listed = client.get("/api/team/invitations/", headers=boss["h"]).json()
    assert listed[0]["status"] == "ACCEPTED" and listed[0]["joined_email"] == "arman@wms.kz"
    assert listed[0]["joined_employee_code"] == user["employee_code"]
    assert "link" not in listed[0]  # the link is shown once, when it is made

    # Then the Staff app: password works, the new phone waits for the Manager.
    r = staff_login(client, "arman@wms.kz")
    assert r.status_code == 403 and "waiting for" in r.json()["detail"]


def test_a_manager_invites_a_manager_who_gets_his_own_team(client, api, boss):
    created = new_link(client, boss["h"], role="MANAGER")
    assert created["team_manager_id"] is None
    r = join(client, created["link"], email="dana@wms.kz", first="Dana", last="Seitova")
    assert r.status_code == 201 and r.json()["role"] == "MANAGER" and r.json()["manager_id"] is None


def test_a_link_works_once(client, api, boss):
    link = new_link(client, boss["h"])["link"]
    assert join(client, link).status_code == 201
    r = join(client, link, email="second@wms.kz")
    assert r.status_code == 404 and r.json()["detail"] == GONE
    assert info(client, link).status_code == 404


def test_an_expired_link_is_dead(client, api, boss, db):
    link = new_link(client, boss["h"])["link"]
    db.execute(text("UPDATE invitations SET expires_at = now() - interval '1 second'"))
    db.commit()
    assert info(client, link).status_code == 404
    r = join(client, link)
    assert r.status_code == 404 and r.json()["detail"] == GONE
    assert client.get("/api/team/invitations/", headers=boss["h"]).json()[0]["status"] == "EXPIRED"


@pytest.mark.parametrize("link", ["/join/" + "x" * 43, "/join/short", "/join/" + "A" * 43])
def test_an_unknown_link_gets_the_same_answer(client, link):
    assert info(client, link).status_code == 404
    r = join(client, link)
    assert r.status_code == 404 and r.json()["detail"] == GONE


def test_only_the_token_hash_is_stored(client, api, boss, db):
    created = new_link(client, boss["h"])
    token = created["link"].removeprefix("/join/")
    stored = db.execute(text("SELECT token_hash FROM invitations WHERE id = :i"), {"i": created["id"]}).scalar_one()
    assert stored == hashlib.sha256(token.encode()).hexdigest()
    assert token not in str(db.execute(text("SELECT * FROM invitations")).all())


def test_a_registered_email_cannot_join_again_and_the_link_stays_usable(client, api, boss):
    api.customer("taken@mail.kz")
    link = new_link(client, boss["h"])["link"]
    r = join(client, link, email="taken@mail.kz")
    assert r.status_code == 409 and r.json()["detail"] == "This email is already registered"
    assert join(client, link, email="fresh@wms.kz").status_code == 201


@pytest.mark.parametrize("field, value", [
    ("first_name", ""), ("last_name", ""), ("email", "not-an-email"), ("phone", "12345"), ("phone", ""),
    ("password", "short"), ("password", "nodigits_here"), ("password", "noSpecial123"),
])
def test_the_join_form_is_checked(client, api, boss, field, value):
    link = new_link(client, boss["h"])["link"]
    body = {"first_name": "Arman", "last_name": "Bekov", "email": "arman@wms.kz", "phone": "+7 701 111 22 33",
            "password": PASSWORD, field: value}
    assert client.post(f"/api/auth{link}/", json=body).status_code == 422
    assert info(client, link).status_code == 200  # a bad form does not use up the link


def test_two_people_with_the_same_link_make_one_account(client, api, boss):
    """Row lock: the second waits for the first and then finds the link used."""
    import threading

    from fastapi.testclient import TestClient

    from app.main import app
    link = new_link(client, boss["h"])["link"]
    results = []
    start = threading.Barrier(2)

    def go(email):
        with TestClient(app) as c:
            start.wait()
            results.append(join(c, link, email=email).status_code)

    threads = [threading.Thread(target=go, args=(e,)) for e in ("one@wms.kz", "two@wms.kz")]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)
    assert sorted(results) == [201, 404]


# ---------------- who may invite ----------------
@pytest.mark.parametrize("role", ["ADMIN", "CUSTOMER", "SUPERHERO"])
def test_nobody_is_invited_above_manager_or_outside_staff(client, boss, role):
    assert client.post("/api/team/invitations/", headers=boss["h"], json={"role": role}).status_code == 422


def test_only_managers_invite(client, api, boss):
    worker, _ = api.staff("w@wms.kz", "WORKER", boss["id"])
    for headers in (worker, api.customer("c@mail.kz")):
        assert client.post("/api/team/invitations/", headers=headers, json={"role": "WORKER"}).status_code == 403
    assert client.post("/api/team/invitations/", json={"role": "WORKER"}).status_code == 401


def test_admin_invites_only_the_first_manager(client, api):
    admin = api.admin
    assert client.post("/api/admin/invitations/", headers=admin, json={"role": "WORKER"}).status_code == 403
    link = new_link(client, admin, role="MANAGER", url="/api/admin/invitations/")["link"]
    assert join(client, link, email="first@wms.kz").status_code == 201
    r = client.post("/api/admin/invitations/", headers=admin, json={"role": "MANAGER"})
    assert r.status_code == 403 and "only the first Manager" in r.json()["detail"]


def test_admin_cannot_use_the_manager_team_api(client, api, boss):
    assert client.post("/api/team/invitations/", headers=api.admin, json={"role": "WORKER"}).status_code == 403


# ---------------- revoking, seeing ----------------
def test_a_revoked_link_is_dead(client, api, boss):
    created = new_link(client, boss["h"])
    r = client.post(f"/api/team/invitations/{created['id']}/revoke/", headers=boss["h"])
    assert r.status_code == 200 and r.json()["status"] == "REVOKED"
    assert join(client, created["link"]).status_code == 404
    assert client.post(f"/api/team/invitations/{created['id']}/revoke/", headers=boss["h"]).status_code == 409


def test_a_manager_sees_and_touches_only_his_own_links(client, api, boss):
    other, _ = api.staff("other@wms.kz", "MANAGER")
    theirs = new_link(client, other)
    mine = new_link(client, boss["h"])
    ids = [i["id"] for i in client.get("/api/team/invitations/", headers=boss["h"]).json()]
    assert mine["id"] in ids and theirs["id"] not in ids
    assert client.post(f"/api/team/invitations/{theirs['id']}/revoke/", headers=boss["h"]).status_code == 404


def test_admin_sees_every_link_and_can_revoke_it(client, api, boss):
    created = new_link(client, boss["h"])
    admin = api.admin
    rows = client.get("/api/admin/invitations/", headers=admin).json()
    assert created["id"] in [r["id"] for r in rows] and all("link" not in r for r in rows)
    assert client.post(f"/api/admin/invitations/{created['id']}/revoke/", headers=admin).status_code == 200
    assert join(client, created["link"]).status_code == 404


def test_a_link_dies_with_its_inviter(client, api, boss):
    admin = api.admin
    link = new_link(client, boss["h"])["link"]
    boss_user = next(u for u in client.get("/api/admin/users/?search=boss", headers=admin).json())
    assert client.post(f"/api/admin/users/{boss_user['id']}/block/", headers=admin).status_code == 200
    assert join(client, link).status_code == 404


def test_the_old_email_code_endpoint_is_gone(client):
    r = client.post("/api/auth/invite/accept/", json={"email": "a@wms.kz", "code": "123456", "password": PASSWORD})
    assert r.status_code in (404, 405)


# ---------------- the team ----------------
def test_a_manager_sees_only_his_own_workers(client, api, boss):
    other, other_id = api.staff("other@wms.kz", "MANAGER")
    api.staff("mine@wms.kz", "WORKER", boss["id"])
    api.staff("theirs@wms.kz", "WORKER", other_id)
    emails = [m["email"] for m in client.get("/api/team/members/", headers=boss["h"]).json()]
    assert emails == ["mine@wms.kz"]


def test_a_manager_blocks_and_unblocks_only_his_own_workers(client, api, boss):
    other, other_id = api.staff("other@wms.kz", "MANAGER")
    mine_headers, _ = api.staff("mine@wms.kz", "WORKER", boss["id"])
    api.staff("theirs@wms.kz", "WORKER", other_id)
    users = {u["email"]: u["id"] for u in client.get("/api/admin/users/", headers=api.admin).json()}

    r = client.post(f"/api/team/members/{users['mine@wms.kz']}/block/", headers=boss["h"])
    assert r.status_code == 200 and r.json()["status"] == "BLOCKED"
    assert client.get("/api/auth/me/", headers=mine_headers).status_code == 403
    assert client.post(f"/api/team/members/{users['mine@wms.kz']}/unblock/", headers=boss["h"]).status_code == 200

    for email in ("theirs@wms.kz", "other@wms.kz", "boss@wms.kz", "admin001@wms.kz"):
        assert client.post(f"/api/team/members/{users[email]}/block/", headers=boss["h"]).status_code == 404
    assert client.post("/api/team/members/99999/block/", headers=boss["h"]).status_code == 404


def test_a_manager_approves_only_his_own_workers_phones(client, api, boss):
    other, other_id = api.staff("other@wms.kz", "MANAGER")
    api.staff("theirs@wms.kz", "WORKER", other_id)
    staff_login(client, "theirs@wms.kz", phone="theirs second phone")
    theirs = next(d for d in client.get("/api/admin/devices/?status=PENDING", headers=api.admin).json()
                  if d["user_email"] == "theirs@wms.kz")
    assert client.get("/api/team/devices/", headers=boss["h"]).json() == []
    assert client.post(f"/api/team/devices/{theirs['id']}/approve/", headers=boss["h"]).status_code == 404
    assert client.post(f"/api/team/devices/{theirs['id']}/approve/", headers=other).status_code == 200
    assert client.post(f"/api/team/devices/{theirs['id']}/revoke/", headers=boss["h"]).status_code == 404
    assert client.post(f"/api/team/devices/{theirs['id']}/revoke/", headers=other).status_code == 200


def test_moving_a_worker_moves_who_controls_him(client, api, boss):
    other, other_id = api.staff("other@wms.kz", "MANAGER")
    _, worker_emp = api.staff("arman@wms.kz", "WORKER", boss["id"])
    uid = next(u["id"] for u in client.get("/api/admin/users/?search=arman", headers=api.admin).json())
    assert client.patch(f"/api/admin/employees/{worker_emp}/team/", headers=api.admin,
                        json={"manager_id": other_id}).status_code == 200
    assert client.post(f"/api/team/members/{uid}/block/", headers=boss["h"]).status_code == 404
    assert client.post(f"/api/team/members/{uid}/block/", headers=other).status_code == 200


def test_workers_and_customers_have_no_team_api(client, api, boss):
    worker, _ = api.staff("w@wms.kz", "WORKER", boss["id"])
    for headers in (worker, api.customer("c@mail.kz")):
        assert client.get("/api/team/members/", headers=headers).status_code == 403
        assert client.get("/api/team/devices/", headers=headers).status_code == 403
        assert client.get("/api/team/invitations/", headers=headers).status_code == 403


def test_team_actions_and_invitations_are_in_the_audit_log(client, api, boss):
    created = new_link(client, boss["h"])
    assert join(client, created["link"]).status_code == 201
    uid = next(u["id"] for u in client.get("/api/admin/users/?search=arman", headers=api.admin).json())
    client.post(f"/api/team/members/{uid}/block/", headers=boss["h"])
    revoked = new_link(client, boss["h"])
    client.post(f"/api/team/invitations/{revoked['id']}/revoke/", headers=boss["h"])

    rows = client.get("/api/admin/audit/?limit=50", headers=api.admin).json()
    mine = [r for r in rows if r["details"].get("invitation_id") in (created["id"], revoked["id"])
            or r["target_email"] == "arman@wms.kz"]
    actions = [r["action"] for r in mine if r["action"].startswith("INVITE_") or r["action"] == "USER_BLOCKED"]
    assert actions == ["INVITE_REVOKED", "INVITE_SENT", "USER_BLOCKED", "INVITE_ACCEPTED", "INVITE_SENT"]
    by_action = {r["action"]: r for r in mine}
    assert by_action["USER_BLOCKED"]["actor_email"] == "boss@wms.kz"
    assert by_action["INVITE_SENT"]["actor_email"] == "boss@wms.kz"
    assert by_action["INVITE_ACCEPTED"]["actor_email"] == "arman@wms.kz"
    assert "token" not in str(rows) or all("link" not in str(r["details"]) for r in rows)


def test_a_manager_link_dies_with_its_inviter_too(client, api, boss):
    """A MANAGER link has no team to check: the inviter's status is what stops it."""
    admin = api.admin
    link = new_link(client, boss["h"], role="MANAGER")["link"]
    boss_user = next(u for u in client.get("/api/admin/users/?search=boss", headers=admin).json())
    assert client.post(f"/api/admin/users/{boss_user['id']}/block/", headers=admin).status_code == 200
    assert info(client, link).status_code == 404
    assert join(client, link, email="newboss@wms.kz").status_code == 404
