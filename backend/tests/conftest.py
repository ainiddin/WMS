"""Tests run against a separate PostgreSQL database (TEST_DATABASE_URL), which is wiped before every test."""

import os

from dotenv import dotenv_values

_env = dotenv_values(os.path.join(os.path.dirname(__file__), "..", ".env"))
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or _env.get("TEST_DATABASE_URL") or (
    "postgresql+psycopg://postgres@localhost:5432/wms_test"
)
os.environ["ADMIN_EMAIL"] = "Admin001@wms.kz"
os.environ["ADMIN_PASSWORD"] = "admin-test-pass"
os.environ["BCRYPT_ROUNDS"] = "4"  # fast hashing, tests only
os.environ["JWT_SECRET"] = "test-secret-" + "x" * 40

import base64  # noqa: E402
import hashlib  # noqa: E402
import re  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db.session import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402

ADMIN = ("admin001@wms.kz", "admin-test-pass")
PASSWORD = "password123"


@pytest.fixture(scope="session", autouse=True)
def schema():
    assert "test" in str(engine.url), "Refusing to run tests on a non-test database"
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture(autouse=True)
def clean_db():
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    yield


# Emails "sent" during a test: {address: [text, ...]}. Real delivery is never used in tests.
OUTBOX: dict[str, list[str]] = {}


@pytest.fixture(autouse=True)
def outbox(monkeypatch):
    OUTBOX.clear()
    monkeypatch.setattr("app.services.email_service.send_email",
                        lambda to, subject, text: OUTBOX.setdefault(to, []).append(text))
    # No DNS lookups in tests: every domain "accepts mail".
    monkeypatch.setattr("app.services.email_service.has_mail_server", lambda domain: True)
    return OUTBOX


def last_code(email: str) -> str:
    return re.search(r"code: (\d{6})", OUTBOX[email][-1]).group(1)


def signup_code(client, email: str) -> str:
    r = client.post("/api/auth/send-code/", json={"email": email})
    assert r.status_code == 200, r.text
    return last_code(email)


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


def phone_secret(name: str) -> str:
    """A fixed fake "phone" per name: the device secret the Staff app would send."""
    return base64.urlsafe_b64encode(hashlib.sha256(name.encode()).digest()).decode().rstrip("=")


def staff_login(client, email: str, password: str = PASSWORD, phone: str | None = None):
    return client.post("/api/auth/staff/login/", json={
        "email": email, "password": password, "device_secret": phone_secret(phone or email), "device_name": "Test phone",
    })


class Api:
    """Small helper around TestClient for building test scenarios."""

    def __init__(self, client: TestClient):
        self.c = client

    def login(self, email: str, password: str = PASSWORD) -> dict:
        """Website login (customers)."""
        r = self.c.post("/api/auth/login/", data={"username": email, "password": password})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    def staff_login(self, email: str, password: str = PASSWORD) -> dict:
        """Staff app login. A new phone waits for the Admin, so the Admin approves it and the login is repeated."""
        r = staff_login(self.c, email, password)
        if r.status_code == 403 and "waiting for admin approval" in r.text:
            pending = self.c.get("/api/admin/devices/?status=PENDING", headers=self.admin).json()
            device = next(d for d in pending if d["user_email"] == email.lower())
            assert self.c.post(f"/api/admin/devices/{device['id']}/approve/", headers=self.admin).status_code == 200
            r = staff_login(self.c, email, password)
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    @property
    def admin(self) -> dict:
        # The first Admin phone is approved automatically.
        r = staff_login(self.c, *ADMIN)
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    def staff(self, email: str, role: str, manager_id: int | None = None) -> tuple[dict, int]:
        """Register + approve a staff member. Returns (auth headers, employee id)."""
        r = self.c.post("/api/auth/register-staff/", json={
            "email": email, "code": signup_code(self.c, email), "password": PASSWORD, "full_name": email.split("@")[0].title() + " Test",
            "requested_role": role,
        })
        assert r.status_code == 201, r.text
        user_id = r.json()["user"]["id"]
        r = self.c.post(f"/api/admin/users/{user_id}/approve/", headers=self.admin,
                        json={"role": role, "manager_id": manager_id})
        assert r.status_code == 200, r.text
        return self.staff_login(email), r.json()["employee"]["id"]

    def customer(self, email: str, money: int = 100_000) -> dict:
        """A signed-up customer whose account already has `money` KZT (orders are paid from it)."""
        r = self.c.post("/api/auth/register/", json={
            "email": email, "code": signup_code(self.c, email), "password": PASSWORD, "full_name": "Customer " + email.split("@")[0],
            "address": "Almaty, Abay 1",
        })
        assert r.status_code == 201, r.text
        headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
        if money:
            assert self.top_up(headers, money).status_code == 201
        return headers

    def top_up(self, headers: dict, amount: int):
        return self.c.post("/api/account/top-up/", headers=headers, json={"amount": amount})

    def balance(self, headers: dict) -> float:
        return self.c.get("/api/account/", headers=headers).json()["balance"]

    def product(self, headers: dict, name: str = "Kettle", price: float = 1000, min_quantity: int = 5,
                barcode: str | None = None) -> dict:
        cat = self.c.post("/api/categories/", headers=headers, json={"name": f"Cat {name}"}).json()
        sup = self.c.post("/api/suppliers/", headers=headers,
                          json={"supplier_name": f"Supplier {name}", "phone": "+7 700 000 0000"}).json()
        r = self.c.post("/api/products/", headers=headers, json={
            "product_name": name, "category_id": cat["id"], "supplier_id": sup["id"], "unit_price": price,
            "min_quantity": min_quantity, "barcode": barcode,
        })
        assert r.status_code == 201, r.text
        return r.json()

    def stock_in(self, headers: dict, product_id: int, quantity: int):
        return self.c.post("/api/movements/in/", headers=headers, json={"product_id": product_id, "quantity": quantity})

    def order(self, headers: dict, items: list[tuple[int, int]]):
        return self.c.post("/api/orders/", headers=headers,
                           json={"items": [{"product_id": p, "quantity": q} for p, q in items]})


@pytest.fixture
def client():
    with TestClient(app) as c:  # runs the lifespan -> first admin is created
        yield c


@pytest.fixture
def api(client) -> Api:
    return Api(client)


@pytest.fixture
def team(api):
    """A Manager with one Worker, plus a product with 10 units in stock and a customer."""
    m_headers, m_id = api.staff("manager@wms.kz", "MANAGER")
    w_headers, w_id = api.staff("worker@wms.kz", "WORKER", manager_id=m_id)
    product = api.product(m_headers, "Kettle", price=1500, min_quantity=3, barcode="4870000000012")
    assert api.stock_in(w_headers, product["id"], 10).status_code == 201
    c_headers = api.customer("buyer@mail.kz")
    return {"manager": m_headers, "manager_id": m_id, "worker": w_headers, "worker_id": w_id,
            "product": product, "customer": c_headers}
