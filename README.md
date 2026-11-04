# KeyFive WMS

Warehouse Management System for an online household-goods shop — course **Basics of Information Systems**, KBTU, autumn 2026.

- `backend/` — FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL
- `frontend/` — React + TypeScript + Vite + MUI
- `sql/` — schema, queries and tests from Task 9 (reference)

## Requirements

- Python 3.12+ (tested on 3.14)
- PostgreSQL 16 or 17
- Node.js 20+ (for the frontend)

## Backend: first run

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows  (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt

# 1. Database
psql -U postgres -c "CREATE DATABASE keyfive_wms"
psql -U postgres -c "CREATE DATABASE wms_test"      # only for pytest

# 2. Settings: copy and fill in JWT_SECRET, ADMIN_PASSWORD, DEMO_PASSWORD
copy .env.example .env          # macOS/Linux: cp .env.example .env

# 3. Tables
alembic upgrade head

# 4. Data (choose one)
python -m app.seed                   # only the first admin
python -m app.seed --demo            # + demo shop with one year of history
python -m app.seed --demo --reset    # wipe everything and recreate the demo

# 5. Run
uvicorn app.main:app --reload
```

- API: http://localhost:8000 · Swagger: **http://localhost:8000/docs** (button *Authorize* → email + password)
- The first admin `Admin001@wms.kz` is created automatically on start; its password is `ADMIN_PASSWORD` from `.env`.

### Tests

```bash
cd backend
pytest -q
```

Tests use the separate `wms_test` database (`TEST_DATABASE_URL`) and wipe it on every test.

### Demo users (`--demo`, password = `DEMO_PASSWORD`)

| Role | Logins |
|---|---|
| Admin | `Admin001@wms.kz` (password = `ADMIN_PASSWORD`) |
| Manager | `dauren@wms.kz`, `aigerim@wms.kz`, `nurlan@wms.kz` — one team each |
| Worker | Team Dauren: `arman@`, `dana@`, `yerlan@` · Team Aigerim: `madina@`, `timur@` · Team Nurlan: `asel@`, `bekzat@` (all `@wms.kz`) |
| Customer | `aliya@mail.kz`, `ruslan@mail.kz`, `saule@mail.kz` … (12 in total) |
| Pending staff | `ayan@wms.kz` (Worker), `dilnaz@wms.kz` (Manager) — waiting for admin approval |

The demo year is simulated through the real services (orders → approve → ship, daily restock), so stock always
matches the history (`/api/reports/reconciliation/`). At the end some products are below minimum and some orders
wait in the PENDING / APPROVED queues.

## Frontend: first run

The backend must be running on port 8000 (Vite forwards `/api` to it).

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

- `npm run build` — type-check + production build into `dist/`
- `npm run dev:https` — HTTPS on the local network (`https://<laptop-ip>:5173`), needed for the camera barcode
  scanner on a phone. Accept the self-signed certificate warning once. Typing the barcode always works too.

Print barcode labels for the demo products: **Products → Barcode labels** (PDF, EAN-13).

### Pages by role

| Role | Pages |
|---|---|
| Visitor / Customer | Home, Catalog (search, category, price, in stock), Product, Cart, Checkout, My orders, Profile |
| Worker | My performance, Leaderboard, Stock, Stock IN (scanner), Orders to ship (scan → Ship), Movement history |
| Manager | + Dashboard, Team performance, Orders (approve / reject), Products, Categories, Suppliers, Customers, Restock list, Reports + Excel/PDF |
| Admin | + Performance of all teams, Pending approvals (role + team), Users (role, team, block) |

The React route guards only hide pages; every permission is checked again by FastAPI.

```
frontend/src/
├── api/          axios client (JWT + automatic refresh), endpoint functions, response types
├── auth/         AuthContext, ProtectedRoute
├── cart/         cart in localStorage
├── components/   layouts, barcode scanner, charts, shared UI
└── pages/        auth, customer, staff (warehouse + performance), manager, admin
```

## Backend structure

```
backend/app/
├── main.py            app, CORS, DB error handler, routers, first-admin on startup
├── core/              config (.env), security (JWT, bcrypt), deps (get_db, current user, require_role)
├── db/session.py      engine, session, Base
├── models/            9 tables: users, categories, suppliers, products, employees, customers,
│                      orders, order_items, stock_movements (all CHECK / UNIQUE / RESTRICT rules)
├── schemas/           Pydantic request / response models
├── services/          movement_service (record_movement), order_service, user_service,
│                      report_service, performance_service, export_service
├── routers/           auth, admin, catalog, customers, movements, orders, reports, performance
└── seed.py            first admin + demo data
```

### Main rules (enforced in PostgreSQL and in the API)

1. `quantity >= 0` for products, `> 0` for movements and order lines.
2. OUT always has a customer, IN never (`chk_customer_for_out`).
3. Rows with history cannot be deleted (`ON DELETE RESTRICT` → HTTP 409); use `is_active = false`.
4. Approve checks that every line fits in stock.
5. Ship is one transaction: OUT for every line + SHIPPED; any shortage rolls everything back.
6. Order line price is frozen at order time; 7. the total is calculated by the server.
8. Only `ACTIVE` accounts can log in (checked on every request, so blocking works at once).
9. A Worker always has a Manager (`chk_employees_manager`); a team = Manager + his Workers.

Codes like `P001`, `O0001`, `M0001` are PostgreSQL generated columns built from the integer id, so they never collide.

### Leaderboard

Points = orders shipped × 10 + orders approved × 2 + stock IN × 1 (constants in `services/performance_service.py`).
Periods: last 7 / 30 / 90 / 365 days (`?period=week|month|quarter|year`).
