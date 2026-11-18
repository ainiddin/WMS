"""Staff join only by invitation; a Manager runs only his own team."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.models import Invitation
from tests.conftest import OUTBOX, PASSWORD, last_code, staff_login


def accept(client, email, code, password=PASSWORD, **extra):
    return client.post("/api/auth/invite/accept/", json={"email": email, "code": code, "password": password, **extra})


def wrong(code: str) -> str:
    return f"{(int(code) + 1) % 1_000_000:06d}"


def age_invitations(db, seconds: int):
    db.execute(text("UPDATE invitations SET code_sent_at = code_sent_at - make_interval(secs => :s)"), {"s": seconds})
    db.commit()


@pytest.fixture
def boss(api):
    headers, emp_id = api.staff("boss@wms.kz", "MANAGER")
    return {"h": headers, "id": emp_id}


# ---------------- inviting and joining ----------------
def test_manager_invites_a_worker_into_his_own_team(client, api, boss):
    OUTBOX.clear()
    r = api.invite(boss["h"], "Arman@WMS.kz", "WORKER", "Arman Seitov")
    assert r.status_code == 201, r.text
    inv = r.json()
    assert inv["email"] == "arman@wms.kz" and inv["status"] == "PENDING" and inv["team_manager_id"] == boss["id"]
    assert set(OUTBOX) == {"arman@wms.kz"}  # the code goes to the invitee, nobody else
    assert "Boss Test" in OUTBOX["arman@wms.kz"][0]
    assert last_code("arman@wms.kz") not in r.text

    r = accept(client, "ARMAN@wms.kz", last_code("arman@wms.kz"), phone="8 701 111 22 33")
    assert r.status_code == 201, r.text
    user = r.json()
    assert user["role"] == "WORKER" and user["status"] == "ACTIVE" and user["manager_id"] == boss["id"]
    assert user["full_name"] == "Arman Seitov" and user["phone"] == "+7 701 111 22 33"

    # First sign in: the phone waits, and his Manager (not the Admin) approves it.
    assert staff_login(client, "arman@wms.kz").status_code == 403
    device = client.get("/api/team/devices/?status=PENDING", headers=boss["h"]).json()[0]
    assert device["user_email"] == "arman@wms.kz"
    assert client.post(f"/api/team/devices/{device['id']}/approve/", headers=boss["h"]).status_code == 200
    assert staff_login(client, "arman@wms.kz").status_code == 200

    rows = client.get("/api/team/invitations/", headers=boss["h"]).json()
    assert rows[0]["status"] == "ACCEPTED"


def test_manager_invites_a_manager_who_gets_his_own_team(client, api, boss):
    assert api.invite(boss["h"], "second@wms.kz", "MANAGER").status_code == 201
    r = api.accept("second@wms.kz")
    assert r.status_code == 201
    assert r.json()["role"] == "MANAGER" and r.json()["manager_id"] is None
    # A new Manager is not a member of the inviting Manager's team, so his phone is not in that team's list.
    staff_login(client, "second@wms.kz")
    assert client.get("/api/team/devices/", headers=boss["h"]).json() == []


@pytest.mark.parametrize("role", ["ADMIN", "CUSTOMER", "boss", ""])
def test_nobody_is_invited_above_manager_or_outside_staff(api, boss, role):
    assert api.invite(boss["h"], "x@wms.kz", role).status_code == 422


def test_only_managers_invite(client, api, boss):
    worker, _ = api.staff("w@wms.kz", "WORKER", boss["id"])
    customer = api.customer("c@mail.kz")
    for headers in (worker, customer):
        assert api.invite(headers, "x@wms.kz", "WORKER").status_code == 403
    assert client.post("/api/team/invitations/", json={"email": "x@wms.kz", "role": "WORKER", "full_name": "X"}).status_code == 401


def test_admin_invites_only_the_first_manager(client, api):
    assert api.invite(None, "first@wms.kz", "WORKER").status_code == 403  # a Worker needs a team
    assert api.invite(None, "first@wms.kz", "MANAGER").status_code == 201
    api.accept("first@wms.kz")
    r = api.invite(None, "another@wms.kz", "MANAGER")
    assert r.status_code == 403  # now Managers do it
    assert "first Manager" in r.json()["detail"]


def test_admin_cannot_use_the_manager_team_api(client, api, boss):
    assert client.get("/api/team/members/", headers=api.admin).status_code == 403
    assert api.invite(api.admin, "x@wms.kz", "WORKER").status_code == 403


def test_registered_or_already_invited_emails_are_refused(client, api, boss):
    api.customer("buyer@mail.kz")
    assert api.invite(boss["h"], "buyer@mail.kz", "WORKER").status_code == 409
    assert api.invite(boss["h"], "new@wms.kz", "WORKER").status_code == 201
    r = api.invite(boss["h"], "NEW@wms.kz", "WORKER")
    assert r.status_code == 409 and "open invitation" in r.json()["detail"]


def test_an_expired_invitation_is_replaced_by_a_new_one(client, api, boss, db):
    assert api.invite(boss["h"], "late@wms.kz", "WORKER").status_code == 201
    old_code = last_code("late@wms.kz")
    db.execute(text("UPDATE invitations SET expires_at = now() - interval '1 second'"))
    db.commit()
    assert api.invite(boss["h"], "late@wms.kz", "WORKER").status_code == 201
    statuses = sorted(i["status"] for i in client.get("/api/team/invitations/", headers=boss["h"]).json())
    assert statuses == ["PENDING", "REVOKED"]
    new_code = last_code("late@wms.kz")
    if old_code != new_code:
        assert accept(client, "late@wms.kz", old_code).status_code == 400
    assert accept(client, "late@wms.kz", new_code).status_code == 201


def test_the_database_allows_one_open_invitation_per_email(db, api, boss):
    api.invite(boss["h"], "dup@wms.kz", "WORKER")
    with pytest.raises(IntegrityError):
        db.execute(text("INSERT INTO invitations (email, full_name, role, team_manager_id, invited_by_id, code_hash, "
                        "code_sent_at, expires_at) SELECT email, full_name, role, team_manager_id, invited_by_id, "
                        "code_hash, now(), now() + interval '1 day' FROM invitations"))
    db.rollback()


# ---------------- the code ----------------
def test_unknown_email_and_wrong_code_get_the_same_answer(client, api, boss):
    api.invite(boss["h"], "arman@wms.kz", "WORKER")
    a = accept(client, "nobody@wms.kz", "123456")
    b = accept(client, "arman@wms.kz", wrong(last_code("arman@wms.kz")))
    assert a.status_code == b.status_code == 400
    assert a.json() == b.json()


def test_five_wrong_codes_burn_the_invitation_until_it_is_sent_again(client, api, boss, db):
    inv = api.invite(boss["h"], "arman@wms.kz", "WORKER").json()
    code = last_code("arman@wms.kz")
    for _ in range(settings.INVITATION_MAX_ATTEMPTS):
        assert accept(client, "arman@wms.kz", wrong(code)).status_code == 400
    from app.core import rate_limit

    rate_limit.clear_login_timer("arman@wms.kz")  # look at the invitation rule alone, not the login limit
    assert accept(client, "arman@wms.kz", code).status_code == 400  # burnt: the right code no longer works

    age_invitations(db, 61)
    assert client.post(f"/api/team/invitations/{inv['id']}/resend/", headers=boss["h"]).status_code == 200
    assert accept(client, "arman@wms.kz", last_code("arman@wms.kz")).status_code == 201


def test_wrong_codes_also_count_as_failed_logins(client, api, boss):
    api.invite(boss["h"], "arman@wms.kz", "WORKER")
    code = last_code("arman@wms.kz")
    for _ in range(settings.LOGIN_MAX_FAILS_PER_EMAIL - 1):
        accept(client, "arman@wms.kz", wrong(code))
    accept(client, "nobody@x.kz", "000000")
    r = accept(client, "arman@wms.kz", wrong(code))
    assert r.status_code == 400
    r = accept(client, "arman@wms.kz", code)
    assert r.status_code == 429  # even the right code waits now


def test_an_expired_invitation_says_so_only_to_whoever_has_the_code(client, api, boss, db):
    api.invite(boss["h"], "arman@wms.kz", "WORKER")
    code = last_code("arman@wms.kz")
    db.execute(text("UPDATE invitations SET expires_at = now() - interval '1 second'"))
    db.commit()
    assert "expired" not in accept(client, "arman@wms.kz", wrong(code)).json()["detail"]
    r = accept(client, "arman@wms.kz", code)
    assert r.status_code == 400 and "expired" in r.json()["detail"]


def test_an_accepted_invitation_cannot_be_used_again(client, api, boss):
    api.invite(boss["h"], "arman@wms.kz", "WORKER")
    code = last_code("arman@wms.kz")
    assert accept(client, "arman@wms.kz", code).status_code == 201
    assert accept(client, "arman@wms.kz", code, password="another-pass-1").status_code == 400
    assert api.invite(boss["h"], "arman@wms.kz", "WORKER").status_code == 409  # registered now


@pytest.mark.parametrize("extra,status", [({"password": "short"}, 422), ({"code": "12345"}, 422),
                                          ({"code": "abcdef"}, 422), ({"phone": "12"}, 422)])
def test_accept_input_is_checked(client, api, boss, extra, status):
    api.invite(boss["h"], "arman@wms.kz", "WORKER")
    body = {"email": "arman@wms.kz", "code": last_code("arman@wms.kz"), "password": PASSWORD, **extra}
    assert client.post("/api/auth/invite/accept/", json=body).status_code == status


def test_codes_are_stored_only_as_hashes(api, boss, db):
    api.invite(boss["h"], "arman@wms.kz", "WORKER")
    row = db.query(Invitation).filter_by(email="arman@wms.kz").one()
    assert row.code_hash.startswith("$2") and last_code("arman@wms.kz") not in row.code_hash


# ---------------- resend and revoke ----------------
def test_resend_once_a_minute_and_the_old_code_stops_working(client, api, boss, db):
    inv = api.invite(boss["h"], "arman@wms.kz", "WORKER").json()
    old = last_code("arman@wms.kz")
    r = client.post(f"/api/team/invitations/{inv['id']}/resend/", headers=boss["h"])
    assert r.status_code == 429 and int(r.headers["Retry-After"]) <= 60
    age_invitations(db, 61)
    assert client.post(f"/api/team/invitations/{inv['id']}/resend/", headers=boss["h"]).status_code == 200
    new = last_code("arman@wms.kz")
    if old != new:
        assert accept(client, "arman@wms.kz", old).status_code == 400
    assert accept(client, "arman@wms.kz", new).status_code == 201


def test_revoked_invitation_is_dead(client, api, boss):
    inv = api.invite(boss["h"], "arman@wms.kz", "WORKER").json()
    code = last_code("arman@wms.kz")
    r = client.post(f"/api/team/invitations/{inv['id']}/revoke/", headers=boss["h"])
    assert r.status_code == 200 and r.json()["status"] == "REVOKED"
    assert accept(client, "arman@wms.kz", code).status_code == 400
    assert client.post(f"/api/team/invitations/{inv['id']}/revoke/", headers=boss["h"]).status_code == 409
    assert client.post(f"/api/team/invitations/{inv['id']}/resend/", headers=boss["h"]).status_code == 409
    assert api.invite(boss["h"], "arman@wms.kz", "WORKER").status_code == 201  # a new one is possible


def test_a_manager_sees_and_touches_only_his_own_invitations(client, api, boss):
    other, _ = api.staff("other@wms.kz", "MANAGER")
    mine = api.invite(boss["h"], "mine@wms.kz", "WORKER").json()
    theirs = api.invite(other, "theirs@wms.kz", "WORKER").json()
    emails = {i["email"] for i in client.get("/api/team/invitations/", headers=boss["h"]).json()}
    assert "mine@wms.kz" in emails and "theirs@wms.kz" not in emails
    assert client.post(f"/api/team/invitations/{theirs['id']}/revoke/", headers=boss["h"]).status_code == 404
    assert client.post(f"/api/team/invitations/{theirs['id']}/resend/", headers=boss["h"]).status_code == 404
    assert client.post(f"/api/team/invitations/{mine['id']}/revoke/", headers=other).status_code == 404


def test_admin_sees_every_invitation_and_can_step_in(client, api, boss, db):
    other, _ = api.staff("other@wms.kz", "MANAGER")
    a = api.invite(boss["h"], "a@wms.kz", "WORKER").json()
    api.invite(other, "b@wms.kz", "WORKER")
    rows = client.get("/api/admin/invitations/", headers=api.admin).json()
    assert {"a@wms.kz", "b@wms.kz"} <= {r["email"] for r in rows}
    assert {r["email"] for r in client.get("/api/admin/invitations/?status=PENDING", headers=api.admin).json()} \
        == {"a@wms.kz", "b@wms.kz"}
    assert client.get("/api/admin/invitations/?status=WHATEVER", headers=api.admin).status_code == 422
    r = client.post(f"/api/admin/invitations/{a['id']}/revoke/", headers=api.admin)
    assert r.status_code == 200 and r.json()["status"] == "REVOKED"
    assert client.get("/api/admin/invitations/", headers=boss["h"]).status_code == 403


def test_invitation_dies_with_its_inviter_or_team(client, api, boss):
    admin = api.admin
    api.invite(boss["h"], "arman@wms.kz", "WORKER")
    code = last_code("arman@wms.kz")
    boss_user = next(u for u in client.get("/api/admin/users/?search=boss", headers=admin).json())
    assert client.post(f"/api/admin/users/{boss_user['id']}/block/", headers=admin).status_code == 200
    r = accept(client, "arman@wms.kz", code)
    assert r.status_code == 409 and "no longer valid" in r.json()["detail"]


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


def test_team_actions_and_invitations_are_in_the_audit_log(client, api, boss, db):
    inv = api.invite(boss["h"], "arman@wms.kz", "WORKER").json()
    code = last_code("arman@wms.kz")
    accept(client, "arman@wms.kz", wrong(code))
    age_invitations(db, 61)
    client.post(f"/api/team/invitations/{inv['id']}/resend/", headers=boss["h"])
    accept(client, "arman@wms.kz", last_code("arman@wms.kz"))
    uid = next(u["id"] for u in client.get("/api/admin/users/?search=arman", headers=api.admin).json())
    client.post(f"/api/team/members/{uid}/block/", headers=boss["h"])

    rows = client.get("/api/admin/audit/?limit=50", headers=api.admin).json()
    rows = [r for r in rows if "arman@wms.kz" in (r["target_email"], r["details"].get("email"))]
    actions = [r["action"] for r in rows if r["action"].startswith("INVITE_") or r["action"] == "USER_BLOCKED"]
    assert actions == ["USER_BLOCKED", "INVITE_ACCEPTED", "INVITE_RESENT", "INVITE_CODE_FAILED", "INVITE_SENT"]
    by_action = {r["action"]: r for r in rows}
    assert by_action["USER_BLOCKED"]["actor_email"] == "boss@wms.kz"
    assert by_action["INVITE_SENT"]["actor_email"] == "boss@wms.kz"
    assert by_action["INVITE_SENT"]["details"]["email"] == "arman@wms.kz"
    assert by_action["INVITE_CODE_FAILED"]["details"]["attempt"] == 1
