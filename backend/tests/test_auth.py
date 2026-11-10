from tests.conftest import ADMIN, OUTBOX, PASSWORD, last_code, signup_code


def register_staff(client, email="new@wms.kz", role="WORKER"):
    return client.post("/api/auth/register-staff/", json={
        "email": email, "code": signup_code(client, email), "password": PASSWORD, "full_name": "New Person", "requested_role": role,
    })


def login(client, email, password=PASSWORD):
    return client.post("/api/auth/login/", data={"username": email, "password": password})


def test_first_admin_is_created_and_can_login(client):
    r = login(client, "Admin001@wms.kz", ADMIN[1])  # email is case-insensitive
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "ADMIN"
    assert r.json()["user"]["employee_code"] == "E001"


def test_pending_staff_cannot_login_until_approved(client, api):
    r = register_staff(client)
    assert r.status_code == 201
    assert r.json()["user"]["status"] == "PENDING"

    r = login(client, "new@wms.kz")
    assert r.status_code == 403
    assert r.json()["detail"] == "Account is waiting for admin approval"

    manager_headers, manager_id = api.staff("boss@wms.kz", "MANAGER")
    user_id = register_staff(client, "second@wms.kz").json()["user"]["id"]
    r = client.post(f"/api/admin/users/{user_id}/approve/", headers=api.admin,
                    json={"role": "WORKER", "manager_id": manager_id})
    assert r.status_code == 200
    assert r.json()["status"] == "ACTIVE"
    assert r.json()["employee"]["manager_id"] == manager_id

    r = login(client, "second@wms.kz")
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "WORKER"


def test_staff_cannot_request_admin_role(client):
    r = register_staff(client, role="ADMIN")
    assert r.status_code == 422


def test_rejected_user_gets_access_denied(client, api):
    user_id = register_staff(client).json()["user"]["id"]
    assert client.post(f"/api/admin/users/{user_id}/reject/", headers=api.admin).status_code == 200
    r = login(client, "new@wms.kz")
    assert r.status_code == 403
    assert r.json()["detail"] == "Access denied"


def test_blocked_user_loses_access_immediately(client, api):
    headers = api.customer("c@mail.kz")
    assert client.get("/api/auth/me/", headers=headers).status_code == 200
    user_id = client.get("/api/auth/me/", headers=headers).json()["id"]

    assert client.post(f"/api/admin/users/{user_id}/block/", headers=api.admin).status_code == 200
    assert client.get("/api/auth/me/", headers=headers).status_code == 403  # old token no longer works
    assert login(client, "c@mail.kz").status_code == 403

    assert client.post(f"/api/admin/users/{user_id}/unblock/", headers=api.admin).status_code == 200
    assert login(client, "c@mail.kz").status_code == 200


def test_customer_signup_logs_in_at_once(client):
    r = client.post("/api/auth/register/", json={
        "email": "Buyer@Mail.kz", "code": signup_code(client, "buyer@mail.kz"), "password": PASSWORD,
        "full_name": "Buyer", "address": "Almaty",
    })
    assert r.status_code == 201
    me = client.get("/api/auth/me/", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).json()
    assert me["email"] == "buyer@mail.kz"
    assert me["role"] == "CUSTOMER"
    assert me["customer_code"] == "C001"


def test_duplicate_email_and_wrong_password(client, api):
    api.customer("dup@mail.kz")
    r = client.post("/api/auth/register/", json={"email": "DUP@mail.kz", "code": "123456",
                                                         "password": PASSWORD, "full_name": "X"})
    assert r.status_code == 409
    assert login(client, "dup@mail.kz", "wrong-password").status_code == 401


def test_worker_must_get_a_real_manager(client, api):
    user_id = register_staff(client).json()["user"]["id"]
    r = client.post(f"/api/admin/users/{user_id}/approve/", headers=api.admin, json={"role": "WORKER"})
    assert r.status_code == 422

    _, worker_id = api.staff("w1@wms.kz", "WORKER", manager_id=api.staff("m1@wms.kz", "MANAGER")[1])
    r = client.post(f"/api/admin/users/{user_id}/approve/", headers=api.admin,
                    json={"role": "WORKER", "manager_id": worker_id})
    assert r.status_code == 422  # manager_id points to a Worker


def test_only_admin_uses_admin_api(client, api):
    headers, _ = api.staff("m@wms.kz", "MANAGER")
    assert client.get("/api/admin/users/", headers=headers).status_code == 403
    assert client.get("/api/admin/users/").status_code == 401
    assert client.get("/api/admin/users/?status=PENDING", headers=api.admin).status_code == 200


def test_refresh_token(client):
    tokens = login(client, *ADMIN).json()
    r = client.post("/api/auth/refresh/", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200
    # An access token cannot be used as a refresh token.
    r = client.post("/api/auth/refresh/", json={"refresh_token": tokens["access_token"]})
    assert r.status_code == 401


def test_hosting_database_url_gets_psycopg_driver():
    from app.core.config import Settings

    for url in ("postgres://u:p@host:5432/db", "postgresql://u:p@host:5432/db"):
        assert Settings(DATABASE_URL=url).DATABASE_URL == "postgresql+psycopg://u:p@host:5432/db"


def register_customer(client, email="buyer@mail.kz", code="000000", **extra):
    return client.post("/api/auth/register/", json={
        "email": email, "code": code, "password": PASSWORD, "full_name": "Buyer", **extra,
    })


def test_sign_up_needs_the_code_from_the_email(client):
    assert register_customer(client).status_code == 400  # no code was requested

    assert client.post("/api/auth/send-code/", json={"email": "Buyer@Mail.kz"}).status_code == 200
    code = last_code("buyer@mail.kz")
    wrong = "000000" if code != "000000" else "111111"
    r = register_customer(client, code=wrong)
    assert r.status_code == 400
    assert r.json()["detail"] == "Wrong confirmation code"

    r = register_customer(client, code=code)
    assert r.status_code == 201
    # The code is single-use and the email is now taken.
    assert client.post("/api/auth/send-code/", json={"email": "buyer@mail.kz"}).status_code == 409


def test_code_resend_is_limited_and_wrong_attempts_are_counted(client):
    assert client.post("/api/auth/send-code/", json={"email": "a@mail.kz"}).status_code == 200
    assert client.post("/api/auth/send-code/", json={"email": "a@mail.kz"}).status_code == 429
    assert len(OUTBOX["a@mail.kz"]) == 1

    code = last_code("a@mail.kz")
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        assert register_customer(client, "a@mail.kz", wrong).status_code == 400
    r = register_customer(client, "a@mail.kz", code)  # even the right code is refused now
    assert r.status_code == 400
    assert "Too many" in r.json()["detail"]


def test_send_code_refuses_registered_email(client):
    r = client.post("/api/auth/send-code/", json={"email": "admin001@wms.kz"})
    assert r.status_code == 409
    assert "admin001@wms.kz" not in OUTBOX


def test_send_code_refuses_domain_without_mail_server(client, monkeypatch):
    monkeypatch.setattr("app.services.email_service.has_mail_server", lambda domain: domain != "sfas.com")
    r = client.post("/api/auth/send-code/", json={"email": "safdsf@sfas.com"})
    assert r.status_code == 400
    assert "does not accept mail" in r.json()["detail"]
    assert "safdsf@sfas.com" not in OUTBOX


def test_phone_is_checked_and_normalized(client):
    email = "p@mail.kz"
    code = signup_code(client, email)
    assert register_customer(client, email, code, phone="+7 700 1").status_code == 422
    assert register_customer(client, email, code, phone="+1 202 555 0100").status_code == 422
    r = register_customer(client, email, code, phone="8 (701) 111-22-33")
    assert r.status_code == 201, r.text
    assert r.json()["user"]["phone"] == "+7 701 111 22 33"
