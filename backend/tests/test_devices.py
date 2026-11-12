"""Staff work only in the KeyFive Staff app, and only on a phone an Admin approved."""

from tests.conftest import ADMIN, PASSWORD, staff_login


def devices(client, api, status=None):
    url = "/api/admin/devices/" + (f"?status={status}" if status else "")
    return client.get(url, headers=api.admin).json()


def test_staff_cannot_sign_in_on_the_website(client, api):
    api.staff("w@wms.kz", "MANAGER")
    for email, password in (ADMIN, ("w@wms.kz", PASSWORD)):
        r = client.post("/api/auth/login/", data={"username": email, "password": password})
        assert r.status_code == 403
        assert "KeyFive Staff app" in r.json()["detail"]
    # A wrong password still says "wrong password", it does not reveal that the account is staff.
    r = client.post("/api/auth/login/", data={"username": "w@wms.kz", "password": "wrong-password"})
    assert r.status_code == 401


def test_customers_cannot_use_the_staff_app(client, api):
    api.customer("c@mail.kz")
    r = staff_login(client, "c@mail.kz")
    assert r.status_code == 403
    assert r.json()["detail"] == "This app is for warehouse staff only"


def test_leaked_password_is_useless_without_an_approved_phone(client, api):
    headers, _ = api.staff("m@wms.kz", "MANAGER")  # signed in on own phone
    assert client.get("/api/orders/", headers=headers).status_code == 200

    # Someone else knows the email and password and tries from another phone.
    r = staff_login(client, "m@wms.kz", phone="stranger")
    assert r.status_code == 403
    assert "waiting for admin approval" in r.json()["detail"]
    pending = devices(client, api, "PENDING")
    assert [d["user_email"] for d in pending] == ["m@wms.kz"]

    # The Admin does not know this phone and blocks it: it can never sign in.
    assert client.post(f"/api/admin/devices/{pending[0]['id']}/revoke/", headers=api.admin).status_code == 200
    r = staff_login(client, "m@wms.kz", phone="stranger")
    assert r.status_code == 403
    assert r.json()["detail"] == "This phone is blocked for your account"
    # The real phone still works.
    assert staff_login(client, "m@wms.kz").status_code == 200


def test_blocking_a_phone_ends_its_session_at_once(client, api):
    headers, _ = api.staff("w@wms.kz", "MANAGER")
    tokens = staff_login(client, "w@wms.kz").json()
    device = next(d for d in devices(client, api) if d["user_email"] == "w@wms.kz")
    assert client.post(f"/api/admin/devices/{device['id']}/revoke/", headers=api.admin).status_code == 200

    assert client.get("/api/auth/me/", headers=headers).status_code == 403
    assert client.post("/api/auth/refresh/", json={"refresh_token": tokens["refresh_token"]}).status_code == 403


def test_token_without_a_phone_cannot_act_as_staff(client, api):
    """A website token never carries a phone, so even a valid staff user id in it gives no staff access."""
    from app.core.security import create_token

    admin_tokens = staff_login(client, *ADMIN).json()
    forged = create_token(admin_tokens["user"]["id"], "ADMIN", "access")  # same user, no phone in the token
    r = client.get("/api/admin/users/", headers={"Authorization": f"Bearer {forged}"})
    assert r.status_code == 403
    assert r.json()["detail"] == "Staff access is allowed only from an approved phone"


def test_only_the_first_admin_phone_is_approved_automatically(client, api):
    assert staff_login(client, *ADMIN).status_code == 200
    r = staff_login(client, *ADMIN, phone="second admin phone")
    assert r.status_code == 403
    me = [d for d in devices(client, api) if d["current"]]
    assert len(me) == 1 and me[0]["status"] == "APPROVED"
    r = client.post(f"/api/admin/devices/{me[0]['id']}/revoke/", headers=api.admin)
    assert r.status_code == 409  # cannot lock yourself out


def test_device_secret_must_be_random_looking(client):
    r = client.post("/api/auth/staff/login/", json={
        "email": ADMIN[0], "password": ADMIN[1], "device_secret": "123", "device_name": "Phone",
    })
    assert r.status_code == 422
