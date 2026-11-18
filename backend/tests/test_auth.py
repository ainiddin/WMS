from tests.conftest import ADMIN, OUTBOX, PASSWORD, admin_login, last_code, signup_code, staff_login, two_factor


def login(client, email, password=PASSWORD):
    return client.post("/api/auth/login/", data={"username": email, "password": password})


def test_first_admin_is_created_and_can_login(client):
    r = staff_login(client, "Admin001@wms.kz", ADMIN[1], phone=ADMIN[0])  # email is case-insensitive
    assert r.status_code == 202  # the Admin also needs the email code
    r = two_factor(client, r)
    assert r.json()["user"]["role"] == "ADMIN"
    assert r.json()["user"]["employee_code"] == "E001"


def test_staff_can_no_longer_sign_up_on_their_own(client):
    r = client.post("/api/auth/register-staff/", json={"email": "x@wms.kz", "code": "000000", "password": "password123",
                                                       "full_name": "X", "requested_role": "WORKER"})
    assert r.status_code in (404, 405)


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


def test_only_admin_uses_admin_api(client, api):
    headers, _ = api.staff("m@wms.kz", "MANAGER")
    assert client.get("/api/admin/users/", headers=headers).status_code == 403
    assert client.get("/api/admin/users/").status_code == 401
    assert client.get("/api/admin/users/?status=PENDING", headers=api.admin).status_code == 200


def test_refresh_token(client):
    tokens = admin_login(client).json()
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


def test_send_code_catches_typos_in_popular_domains(client):
    for typo in ("gmial.com", "gmail.con", "gmai.com", "gmaill.com", "gmail.co", "gmail.ru", "mail.rk", "yandx.ru"):
        r = client.post("/api/auth/send-code/", json={"email": f"aliya.n@{typo}"})
        assert r.status_code == 400, typo
        assert "did you mean aliya.n@" in r.json()["detail"]
    r = client.post("/api/auth/send-code/", json={"email": "aliya.n@gmial.com"})
    assert r.json()["detail"] == "Check the email: did you mean aliya.n@gmail.com?"
    for ok in ("gmail.com", "gmx.com", "mail.kz", "kbtu.kz", "company.kz"):
        assert client.post("/api/auth/send-code/", json={"email": f"aliya.n@{ok}"}).status_code == 200, ok


def test_send_code_checks_gmail_name_rules(client):
    for bad in ("abc", "ivan_petrov", "ivan..petrov", ".ivanpetrov", "ivanpetrov.", "a" * 31):
        r = client.post("/api/auth/send-code/", json={"email": f"{bad}@gmail.com"})
        assert r.status_code in (400, 422), bad  # 422: not an email at all (e.g. two dots in a row)
    for ok in ("ivan.petrov", "esirkepainiddin200631", "esirkepainiddin200631+test"):
        assert client.post("/api/auth/send-code/", json={"email": f"{ok}@gmail.com"}).status_code == 200, ok


def test_phone_is_checked_and_normalized(client):
    email = "p@mail.kz"
    code = signup_code(client, email)
    assert register_customer(client, email, code, phone="+7 700 1").status_code == 422
    assert register_customer(client, email, code, phone="+1 202 555 0100").status_code == 422
    r = register_customer(client, email, code, phone="8 (701) 111-22-33")
    assert r.status_code == 201, r.text
    assert r.json()["user"]["phone"] == "+7 701 111 22 33"
