from tests.conftest import ADMIN, PASSWORD


def register_staff(client, email="new@wms.kz", role="WORKER"):
    return client.post("/api/auth/register-staff/", json={
        "email": email, "password": PASSWORD, "full_name": "New Person", "requested_role": role,
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
        "email": "Buyer@Mail.kz", "password": PASSWORD, "full_name": "Buyer", "address": "Almaty",
    })
    assert r.status_code == 201
    me = client.get("/api/auth/me/", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).json()
    assert me["email"] == "buyer@mail.kz"
    assert me["role"] == "CUSTOMER"
    assert me["customer_code"] == "C001"


def test_duplicate_email_and_wrong_password(client, api):
    api.customer("dup@mail.kz")
    r = client.post("/api/auth/register/", json={"email": "DUP@mail.kz", "password": PASSWORD, "full_name": "X"})
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
