# Task 9 — database project (reference)

Original SQL from Task 9 (PostgreSQL), kept as reference. The web platform does **not** run these files:
its schema is created by Alembic from the SQLAlchemy models in `backend/app/models/`, which carry the same rules.

| File | Content | Where it lives in the platform now |
|---|---|---|
| `01_schema.sql` | 4 tables, PK / FK / CHECK, indexes | `backend/app/models/` + `backend/alembic/versions/` |
| `02_sample_data.sql` | small sample data set | `backend/app/seed.py --demo` |
| `03_queries.sql` | restock, history, monthly usage, top customers, reconciliation | `backend/app/services/report_service.py` |
| `04_transaction.sql` | `record_movement()` — IN/OUT in one transaction | `backend/app/services/movement_service.py` |
| `05_roles.sql` | DB roles for manager / worker, views | `require_role()` in `backend/app/core/deps.py` |
| `06_tests.sql` | tests: invalid data is rejected | `backend/tests/` (pytest) |
| `07_improvement_product_suppliers.sql` | PRODUCT_SUPPLIERS (M:N) improvement | not used yet |
| `ERD_task09.png` | ERD of Task 9 | ERD v2 (with ORDERS / ORDER_ITEMS) is a separate deliverable |

Run all (on an empty test database): `psql -U postgres -d task9_db -f run_all.sql`
