# Mobile — KeyFive Staff (Android, Kotlin + Jetpack Compose)

The root `CLAUDE.md` rules apply. This file adds what matters inside `mobile/`.

## Build and test
- Open `mobile/` in Android Studio. Debug build: `gradlew assembleDebug`; unit tests: `gradlew testDebugUnitTest`.
- Gradle needs a working local socket; if it fails with "Unable to establish loopback connection", build in
  Android Studio and **say that the change was not built** instead of claiming it works.
- Server address (sign-in screen → Server): emulator + local backend `http://10.0.2.2:8000`; a real phone
  `http://<laptop-ip>:8000` on the same network; default is the Render server. Plain `http` works in debug only.

## Where code goes
- `data/Api.kt` — Retrofit endpoints; `data/Models.kt` — server JSON (`ignoreUnknownKeys`, so extra fields are fine).
- `data/Session.kt` — tokens and the phone secret in EncryptedSharedPreferences, refresh on 401, sign-in steps.
- `data/Flows.kt` — **plain logic without Android** (parsing answers, timers, validation, roles) so it is unit-tested
  on the JVM in `src/test/.../FlowsTest.kt`. Put new decision logic here, not inside Composables.
- `ui/` — screens by area: `auth/`, `admin/`, `manager/`, `warehouse/`, `performance/`; shared parts in `ui/Common.kt`
  (`load`, `LoadedList`, `rememberAction`, `Confirm`, `BarcodeField`, …).
- Menu and routes: `ui/StaffApp.kt` (`SCREENS` list with roles).

## Rules
- **Every text the user sees goes through `t("English text")`** (`kz.keyfive.staff.i18n.t`); add its Russian and
  Kazakh to `i18n/mobile.txt` and run `python i18n/build.py`. `I18nTest` fails otherwise.
- The server decides who may do what; hiding a screen is only convenience.
- Endpoints the app calls repeatedly with the user token must not be under `/api/auth/` (the token refresher skips
  those paths).
- Poll only while the screen is visible (`repeatOnLifecycle(STARTED)`); never in the background.
- Lock timers: count down on the phone from `Retry-After` (`Lock` / `lockMessage`), never poll for them.
- Barcodes: scanning and typing go through the same check (`onScan` in the pick dialog). Ask for camera access
  before scanning; without a camera or access, typing is the way.
- The phone secret and tokens never leave the phone (no backups, no logs). Release builds block screenshots.
