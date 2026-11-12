# KeyFive WMS

Warehouse Management System for an online household-goods shop — course **Basics of Information Systems**, KBTU, autumn 2026.

- `backend/` — FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL
- `frontend/` — the shop website for customers: React + TypeScript + Vite + MUI
- `mobile/` — **KeyFive Staff**, the Android app for Workers, Managers and Admins: Kotlin + Jetpack Compose
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

- API: http://localhost:8000 · Swagger: **http://localhost:8000/docs** (*Authorize* signs in customers only; staff get tokens from `POST /api/auth/staff/login/`)
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

Staff logins work only in the KeyFive Staff app, and only on a phone the Admin has approved (see below).

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
### Pages

Home, Catalog (search, category, price, in stock), Product, Cart, Checkout, My orders, My account (balance), Profile.
The website is for customers only: `/api/auth/login/` refuses staff accounts.

```
frontend/src/
├── api/          axios client (JWT + automatic refresh), endpoint functions, response types
├── auth/         AuthContext, ProtectedRoute
├── cart/         cart in localStorage
├── components/   shop layout, order parts, shared UI
└── pages/        auth, customer
```

## Staff app (Android, `mobile/`)

Workers, Managers and Admins work only in **KeyFive Staff**. It is a separate program from the shop, so a customer
never gets the warehouse screens, and a staff password that leaks is not enough to get in:

1. The app makes a random 32-byte secret on its first start and keeps it in `EncryptedSharedPreferences`
   (key in the Android Keystore, excluded from backups). The server stores only its SHA-256 hash (`staff_devices`).
2. `POST /api/auth/staff/login/` needs the right password **and** an approved phone. A new phone is saved as
   PENDING and refused; the Admin approves or blocks it in **Staff phones**. The first Admin phone is approved
   automatically (otherwise nobody could approve anything).
3. Staff tokens carry the phone id (`dev`). Every request checks that the phone is still approved, so blocking a
   phone (lost, stolen, unknown request) signs it out at once. A token without a phone gives no staff access.
4. Release builds forbid screenshots (`FLAG_SECURE`) and plain `http`.

| Role | Screens |
|---|---|
| Worker | Orders to ship (scan every unit → Ship), Stock IN (scanner), Stock, Movement history, My performance, Leaderboard |
| Manager | + Dashboard, Orders (approve / reject / cancel, workload, rebalance), Restock list, Reports + Excel/PDF, Products, Categories, Suppliers, Customers, My team |
| Admin | + All teams performance, Staff requests (role + team), Staff phones, Users (role, team, block) |

Build (JDK 17 and the Android SDK; Android Studio can simply open `mobile/`):

```bash
cd mobile
gradlew assembleDebug      # app/build/outputs/apk/debug/app-debug.apk   (allows http, e.g. http://10.0.2.2:8000)
gradlew assembleRelease    # app/build/outputs/apk/release/app-release.apk (https only, no screenshots)
```

The app talks to https://keyfive-wms.onrender.com by default; **Server** on the sign-in screen changes it
(emulator + local backend: `http://10.0.2.2:8000`, debug build only). The barcode scanner is the Google Play
services scanner, so the phone needs Google Play services; typing the code always works too.

Install the APK only on work phones. Staff sign up in the app too (email code → request → Admin approves the
account → first sign in → Admin approves the phone).

## Deploy (Render)

**Live:** https://keyfive-wms.onrender.com · API docs: https://keyfive-wms.onrender.com/docs

`render.yaml` describes everything: one Docker web service (FastAPI serves the API **and** the built React site)
plus a free PostgreSQL database, region Frankfurt.

1. render.com → sign in with GitHub → **New → Blueprint** → choose `ainiddin/WMS`.
2. Fill the two secret values Render asks for: `ADMIN_PASSWORD` and `DEMO_PASSWORD`. `JWT_SECRET` is generated.
3. **Apply**. The first build takes ~5 min. On start the container runs `alembic upgrade head`, creates the first
   admin and (because `SEED_DEMO=true`) fills an empty database with the demo shop.
4. Every push to `main` redeploys automatically.

Free plan limits: the service sleeps after 15 min without visits (the first request then takes ~1 min), and the
free database expires after 30 days — create a new one and the demo seed runs again.

Run the same image locally: `docker build -t keyfive-wms .` and
`docker run -p 8000:8000 -e DATABASE_URL=... -e JWT_SECRET=... -e ADMIN_PASSWORD=... keyfive-wms`.

## Backend structure

```
backend/app/
├── main.py            app, CORS, DB error handler, routers, first-admin on startup
├── core/              config (.env), security (JWT, bcrypt), deps (get_db, current user, require_role)
├── db/session.py      engine, session, Base
├── models/            12 tables: users, categories, suppliers, products, employees, customers,
│                      orders, order_items, stock_movements, accounts, account_transactions,
│                      email_verifications (all CHECK / UNIQUE / RESTRICT rules)
├── schemas/           Pydantic request / response models
├── services/          movement_service (record_movement), order_service (auto-approval + stock queue),
│                      assignment_service (least loaded Worker, rebalance), eta_service (expected wait),
│                      account_service (top-up / payment / refund), user_service, email_service,
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
