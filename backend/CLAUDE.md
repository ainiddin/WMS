# Backend (FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL)

The root `CLAUDE.md` rules apply. This file adds what matters inside `backend/`.

## Run and test (Windows)
```bash
.venv\Scripts\activate
```
```bash
alembic upgrade head
```
```bash
uvicorn app.main:app --reload --port 8000
```
- `--host 0.0.0.0` to reach it from phones / other laptops on the same network.
- `.env`: `DATABASE_URL` must point to the PostgreSQL that runs (here usually port **5432**). `ADMIN_2FA_EMAIL`
  must be set, otherwise no Admin can sign in (503). Demo: with `TG_BOT_TOKEN` + `TG_OWNER_CHAT_ID` Admin codes
  go to the owner's Telegram chat instead (`telegram_service`; the token is in the URL, never log it). Without `BREVO_API_KEY` / `SMTP_HOST` no email is sent:
  Admin codes and invitation codes are printed in the server log.
- Demo data: `python -m app.seed --demo` (`--reset` wipes everything first).
- Tests: `python -m pytest -q`. They need `TEST_DATABASE_URL` (a database whose name contains "test"; wiped on
  every test).

## Where code goes (keep the layers)
- `app/routers/` — HTTP only: parse input, pick the dependency (role), call a service, commit, return a schema.
  No business rules here.
- `app/services/` — business rules. One module per area (`invitation_service`, `two_factor_service`,
  `web_login_service`, `order_service`, …). A rule that may change lives in **one** function or a setting.
- `app/models/` — tables and DB constraints (CHECK, partial unique indexes, triggers) for rules the DB can enforce.
- `app/schemas/` — Pydantic input/output; validation of formats (EAN-13, phone, 6-digit codes) lives here.
- `app/core/` — settings (`config.py`), auth dependencies (`deps.py`), JWT (`security.py`), limits (`rate_limit.py`).
- New external channel (email, Telegram, payment gateway): an adapter behind a small interface in `services/`,
  chosen by a setting. Do not call the provider from business code directly.

## Rules that are easy to break
- **Audit:** every state-changing admin/team/auth security action calls `audit_service.log(...)` in the same
  transaction. `audit_log` is append-only (trigger); never add UPDATE/DELETE. `tests/test_audit.py` fails if a new
  admin endpoint does not log.
- **Roles are checked in the API**, not trusted from the client: `require_role(...)`, and for Managers the
  team scope (`/api/team/*` answers 404 for anything outside his team).
- **Limits** (`core/rate_limit.py`, in memory, per process): a right password/code clears the counter, wrong
  ones never do. Remember they reset on restart.
- **Secrets:** bcrypt for passwords and codes, SHA-256 for random tokens. Never return or log them.
- **Errors a wrong guess can see:** unknown email and wrong code get the same answer (no probing who exists).
- **Time:** use `utcnow()` / `utcnow_seconds()` from the app (not the DB clock) when comparing with JWT `iat`.
- **Money and cards:** never accept a full card number in the shop API; cards are typed only on the gateway's
  page (`app/fakepay/`, CardPay Fake). Money moves only by inserting into `account_transactions`
  (`account_service._record`); PostgreSQL triggers refuse any other change of a balance. Credit a top-up only
  from the gateway's signed webhook (`payment_service.handle_webhook`), never from the browser's return.
- **CardPay Fake** imports nothing from the shop; the shop talks to it only through
  `services/payment_gateway.py` (a real gateway = a new adapter there). Tests deliver its webhooks in-process
  (`fakepay_webhooks` fixture); `api.top_up(headers, amount)` goes the whole way.

## Schema changes
Every model change needs an Alembic migration in `alembic/versions/` (one head only). Check
`alembic upgrade head`, `alembic downgrade -1`, `alembic upgrade head` on a scratch database. Data the app needs
(e.g. backfills) goes into the migration, not into startup code.

## Tests
- Helpers in `tests/conftest.py`: `api.staff(email, role, manager_id)` (joins by invitation, signs in on a phone),
  `api.invite`, `api.accept`, `api.customer`, `api.admin` (passes the email code), `admin_web_login`,
  `last_code(email)` reads codes from the in-memory `OUTBOX` (no real email in tests).
- Cover the edge cases: expired, reused, foreign, malformed, other team, wrong role, over the limit.
- Move time by editing rows (e.g. `code_sent_at`) instead of sleeping.
- For a security rule, check the test fails when the rule is removed.
