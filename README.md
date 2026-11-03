# KeyFive WMS — Warehouse Management System

**Course:** Basics of Information Systems · KBTU · Autumn 2026  
**Team:** Ainiddin Yessirkep, Aibar Naimankhan, Ayaulym Boshay, Ryskulbekova Diana, Alua Korganbek

---

## Tech Stack

| Layer | Technology |
|---|---|
| Database | PostgreSQL 16 |
| Backend | Django 6 + Django REST Framework |
| Auth | JWT (djangorestframework-simplejwt) |
| Frontend | Angular 21 + Angular Material |
| Charts | Chart.js + ng2-charts |

---

## Quick start with Docker (recommended)

The only requirement is [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose v2).

From the project root (the folder with `docker-compose.yml`):

```bash
docker compose up --build -d
```

This builds and starts three containers:

| Container | What it does | URL on host |
|---|---|---|
| `wms_postgres` | PostgreSQL 16 with database `wms_db` (data kept in volume `postgres_data`) | `localhost:5433` |
| `wms_backend` | Django API, runs `migrate` + `seed.py` automatically on start | http://localhost:8000/api/ |
| `wms_frontend` | Angular production build served by nginx | **http://localhost:4200** |

Open **http://localhost:4200** and log in with one of the demo users below (password `wms1234!`).

> The frontend is served on port **4200** (not 80) because it calls the API at
> `http://localhost:8000/api` and the backend CORS whitelist only allows
> `http://localhost:4200`.

Useful commands:

```bash
docker compose logs -f backend      # follow backend logs
docker compose ps                   # container status
docker compose down                 # stop containers (DB data is kept)
docker compose down -v              # stop and wipe the database volume
docker compose up --build -d        # rebuild after code changes
docker compose exec backend python manage.py createsuperuser
```

Connect to the database from pgAdmin/DBeaver: host `localhost`, port `5433`, user `postgres`, password `postgres`, database `wms_db`.

> **WSL users:** if `docker` is not found inside WSL, enable
> *Settings → Resources → WSL integration* in Docker Desktop.

---

## Manual setup (without Docker)

### Prerequisites

- Python 3.12+ (required by Django 6)
- Node.js 20.19+ / 22.12+
- PostgreSQL 16

---

## Setup

### 1. Create the database

Open psql or pgAdmin and run:
```sql
CREATE DATABASE wms_db;
```

### 2. Backend

```bash
cd backend

# Copy environment file and edit DB credentials if needed
copy .env.example .env

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Seed demo data
python seed.py

# Start backend (port 8000)
python manage.py runserver
```

**Default demo users** (password `wms1234!`):

| Username | Role |
|---|---|
| `admin` | Admin |
| `manager` | Manager |
| `worker` | Worker |
| `customer` | Customer |

### 3. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start dev server (port 4200)
npm start
```

Open **http://localhost:4200**

---

## Role-based navigation

| Role | Start page | Key features |
|---|---|---|
| Admin | Dashboard | All features + User management |
| Manager | Dashboard | Products, Suppliers, Orders (approve/reject), Reports, Export |
| Worker | Orders | Stock IN, Ship orders, Movement history |
| Customer | Catalog | Browse products, add to cart, place orders, track status |

---

## Project Structure

```
keyfive-wms/
├── backend/
│   ├── accounts/       # User model, JWT auth, roles
│   ├── inventory/      # Supplier, Product, Employee, Customer, StockMovement
│   ├── sales/          # Order, OrderItem, order workflow
│   ├── reports/        # Dashboard, reports, Excel export
│   ├── config/         # Django settings, URLs
│   ├── seed.py         # Demo data
│   └── requirements.txt
├── frontend/
│   └── src/app/
│       ├── core/       # AuthService, ApiService, interceptor, guards
│       ├── auth/       # Login, Register
│       ├── shared/     # Shell layout, 403/404
│       ├── catalog/    # Customer: catalog, cart, orders
│       ├── inventory/  # Products, Suppliers, Stock IN, Movements
│       ├── orders/     # Order management
│       ├── reports/    # Dashboard, reports
│       └── admin/      # User management
└── README.md
```

---

## Order Workflow

```
Customer creates order (PENDING)
        ↓
Manager approves (APPROVED) or rejects (REJECTED)
        ↓
Worker ships (SHIPPED) — stock decremented atomically
        ↓
Either party can cancel PENDING/APPROVED → CANCELLED
```

---

## API Endpoints

```
POST  /api/auth/register/           Customer sign up
POST  /api/auth/login/              JWT login
POST  /api/auth/refresh/            Token refresh
GET   /api/auth/me/                 Current user

GET/POST  /api/suppliers/
GET/POST  /api/products/
GET       /api/products/by-barcode/<code>/
GET/POST  /api/movements/
POST      /api/movements/in/

GET/POST  /api/orders/
POST      /api/orders/<id>/approve/
POST      /api/orders/<id>/reject/
POST      /api/orders/<id>/ship/
POST      /api/orders/<id>/cancel/

GET  /api/dashboard/
GET  /api/reports/restock/          ?format=xlsx
GET  /api/reports/monthly-usage/    ?format=xlsx
GET  /api/reports/top-customers/
GET  /api/reports/reconciliation/
```
