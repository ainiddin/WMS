# Frontend (React + TypeScript + Vite + MUI)

The root `CLAUDE.md` rules apply. This file adds what matters inside `frontend/`.

## Run and test
```bash
npm run dev
```
```bash
npm test
```
```bash
npm run build
```
- `npm run dev -- --host` to open it from other devices on the same network.
- Vite proxies `/api` to the backend on port 8000 (`vite.config.ts`).
- `npm run build` also type-checks (`tsc -b`); it must pass before saying "done".

## Three websites in one app
- **Shop** (customers): `/`, `/catalog`, `/cart`, `/checkout`, `/my-orders`, `/account`. Sign in at `/login`.
- **Admin panel** `/admin/*` and **Manager panel** `/manage/*`: sign in at `/staff/login` (password, then
  confirmation on the phone, or the sign in code). Both are lazy-loaded so shop visitors never download them.
- The pages hide what a role cannot do, but **the server is the real protection** — never rely on the UI for it.

## Where code goes
- `src/api/client.ts` — axios, token refresh, `errorMessage`, `retryAfter`, `sessionEndsAt`.
- `src/api/endpoints.ts` — shop and auth calls; `src/api/staff.ts` — Manager panel calls and staff types.
- `src/pages/admin/` — Admin pages, staff sign-in, shared staff parts (`parts.tsx`: StatCard, formatClock, lockMessage…).
- `src/pages/manager/` — Manager pages; `src/pages/customer/` — shop pages.
- Reuse `components/common.tsx` (PageHeader, QueryState, ConfirmDialog, EmptyState) before writing new ones.

## Rules
- **Timers and waits are counted in the browser** from one server value (`Retry-After`, `seconds`), never by asking
  the server every second. Poll the server only while really waiting (staff sign-in: every 2 s, stops at the answer).
- Show server errors with `errorMessage(e)`; a 429 with `Retry-After` shows a live countdown.
- Never put secrets or tokens in URLs. Never collect a full card number in a form that posts to our API.
- Data from the server (names, user agents, audit details) is shown as text, never as HTML.

## Tests (Vitest + Testing Library)
- Mock the API module (`vi.spyOn(adminApi, 'users')`), render with `renderAt(path, routes)` from `src/test/render.tsx`.
- Fake timers: `vi.useFakeTimers({ shouldAdvanceTime: true })`; move time in small steps (helper `tick(ms)` in
  `AdminLoginPage.test.tsx`) so React renders in between; let effects start before measuring.
- MUI marks required labels with " *": match labels with a regex (`/^Password/`).
- Pin real values in tests (e.g. polling every 2000 ms), not the constant itself, or a wrong constant goes unnoticed.
