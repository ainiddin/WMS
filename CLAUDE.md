# KeyFive WMS — rules for Claude (whole repository)

Warehouse system for a household-goods shop (KBTU course project):
- `backend/` — FastAPI + PostgreSQL; **all business rules live here** → see `backend/CLAUDE.md`
- `frontend/` — React website: shop, Admin panel `/admin`, Manager panel `/manage` → see `frontend/CLAUDE.md`
- `mobile/` — KeyFive Staff, Android app for Workers, Managers, Admins → see `mobile/CLAUDE.md`

## Engineering approach
Work as a senior backend engineer who will maintain this code next year:
- **Design for the change that is likely, not every possible one.** Business rules here change often (who approves
  what, limits, texts). Keep each rule in one place (a service function or a setting), so changing it is one edit.
- **SOLID where it pays:** one reason to change per module; depend on small interfaces at the edges (email,
  payments, notifications) so a new channel is a new class, not an edit everywhere.
- **Open-closed: extend, don't rewrite.** Add new behaviour next to working code (new service, new endpoint,
  new strategy) instead of reshaping code that works and is tested. Fix bugs in place, minimally.
- **Patterns only with a reason.** Name the second concrete use before adding an abstraction (rule of three).
  No speculative layers, factories or generic frameworks "for later". If the task does not need it, don't build it.
- **Do not touch unrelated or legacy code** in a feature change. Refactoring is its own commit/branch, agreed first.
- Prefer boring, readable code over clever code; short functions with names that say the business meaning.

## How we work (the team agreed on these)
- **Never invent business rules.** Unclear who approves / who sees / limits / user-facing texts → ask in chat first,
  listing open questions with a suggested default each.
- **One branch per feature**; small atomic commits, one commit = one feature with its tests.
  Prefixes `feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:` (scope allowed: `feat(auth): …`).
- **Do not push** until asked: every push to `main` redeploys Render. Before pushing: `git fetch`,
  rebase/merge `origin/main`, resolve conflicts, rerun all tests.
- **Real tests with edge cases**; a test must fail when the code it guards is broken.
- **Near a demo or defence: change nothing risky**, only what blocks the demo.
- Report honestly what was tested and what was not (e.g. the Android app if it could not be built).

## Security invariants (never break)
- Staff join **only by invitation**; a Manager invites up to his own rank (never ADMIN).
- A Manager sees and manages **only his own team**.
- Admins and Managers sign in with two factors: on the website the approved phone confirms, or the sign in code
  (goes to the owner: Telegram or `ADMIN_2FA_EMAIL`, never to the person); in the app the code once per phone, and
  a Manager's new phone is approved by that code. Workers use only the app; their phones wait for approval.
- Website sessions: Admin ends hard after 4 hours; Manager lasts `REFRESH_TOKEN_DAYS`, renewed by refresh.
- Every security-relevant action goes to the append-only `audit_log`.
- **A full card number never reaches our server** — payments only via a gateway's own page + signed webhook.
- Secrets (passwords, codes, tokens) only hashed; never returned or logged.

## Before saying "done"
```bash
cd backend && python -m pytest -q
```
```bash
cd frontend && npm test && npm run build
```
Android: build and `gradlew testDebugUnitTest` in Android Studio (say so if you could not run it).

Full business and security rules: `README.md`, section "Main rules (enforced in PostgreSQL and in the API)".
Team tasks: `team-tasks.md`; check them with `/task-check` (review only).
