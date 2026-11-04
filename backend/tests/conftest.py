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


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


class Api:
    """Small helper around TestClient for building test scenarios."""

    def __init__(self, client: TestClient):
        self.c = client

    def login(self, email: str, password: str = PASSWORD) -> dict:
        r = self.c.post("/api/auth/login/", data={"username": email, "password": password})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    @property
    def admin(self) -> dict:
        return self.login(*ADMIN)

    def staff(self, email: str, role: str, manager_id: int | None = None) -> tuple[dict, int]:
        """Register + approve a staff member. Returns (auth headers, employee id)."""
        r = self.c.post("/api/auth/register-staff/", json={
            "email": email, "password": PASSWORD, "full_name": email.split("@")[0].title() + " Test",
            "requested_role": role,
        })
        assert r.status_code == 201, r.text
        user_id = r.json()["user"]["id"]
        r = self.c.post(f"/api/admin/users/{user_id}/approve/", headers=self.admin,
                        json={"role": role, "manager_id": manager_id})
        assert r.status_code == 200, r.text
        return self.login(email), r.json()["employee"]["id"]

    def customer(self, email: str) -> dict:
        r = self.c.post("/api/auth/register/", json={
            "email": email, "password": PASSWORD, "full_name": "Customer " + email.split("@")[0],
            "address": "Almaty, Abay 1",
        })
        assert r.status_code == 201, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

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
    product = api.product(m_headers, "Kettle", price=1500, min_quantity=3, barcode="4870000000017")
    assert api.stock_in(w_headers, product["id"], 10).status_code == 201
    c_headers = api.customer("buyer@mail.kz")
    return {"manager": m_headers, "manager_id": m_id, "worker": w_headers, "worker_id": w_id,
            "product": product, "customer": c_headers}
