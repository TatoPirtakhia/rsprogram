# BizMonitor GE

React Native / Expo SDK 58 application with a Fastify REST API. **The current default flow is local RS profile management without an application login.** Add RS usernames/passwords, select a profile, and retrieve its service response using that profile's credentials. Profiles persist in local SQLite with encrypted passwords. See [the current local RS guide](docs/LOCAL_RS.md).

The original demo monitoring modules and MySQL backend remain available as integration infrastructure. No hosted build or live taxpayer verification has been performed.

## Quick demo without MySQL

Node.js 24 LTS and npm are required. From the repository root:

```powershell
npm ci
npm run demo -w @biz/api
```

In another terminal:

```powershell
npm run dev:mobile
```

Press `w` for the web preview. The app opens directly to the RS profile list; no application username/password is required. Saved RS profiles remain after restarting. Native controls require a **development build**, not Expo Go. Legacy demo financial data is isolated from the saved RS profiles.

## Persistent MySQL backend

```powershell
Copy-Item .env.example .env
```

Replace `JWT_SECRET` with a random secret (at least 32 characters) and `CREDENTIAL_KEY` with 32 random bytes encoded as 64 hex characters. Example generation:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
docker compose up -d --wait
npm run db:migrate
npm run db:seed
npm run dev:mysql -w @biz/api
```

The seed runs once and rejects duplicate business IDs; it does not overwrite existing financial records. MySQL is required for the normal backend. MySQL is bound to local port 3306 by Compose; change the sample development passwords before deploying. Migrations execute in lexical order with a database advisory lock. MySQL DDL is not transactional: inspect and repair a partially applied migration before rerunning it.

Open `http://localhost:3001/docs` for interactive API documentation and `/docs/json` for OpenAPI. `/health` is a process health endpoint; startup checks database connectivity.

## Mobile network configuration

Create `apps/mobile/.env.local`:

```dotenv
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:3001
```

Android emulators can use `http://10.0.2.2:3001`. iOS simulators and the web preview use `http://localhost:3001`. Physical devices need the computer's LAN address and firewall access. Restart Metro after changing environment variables. Release builds reject non-HTTPS API URLs; use a trusted TLS endpoint for device previews of release builds. `.env` at the root configures the API; the mobile workspace has its own environment file.

## Android testing

Install Android Studio, Android SDK and JDK 17+ as required by the current Expo toolchain. Start an emulator, then:

```powershell
cd apps/mobile
npx expo run:android
```

For an EAS development build, authenticate with your own Expo account and configure the project:

```powershell
npx eas-cli login
npx eas-cli init
npx eas-cli build --profile development --platform android
npx expo start --dev-client
```

## iOS testing

Local simulator builds require macOS and Xcode:

```sh
cd apps/mobile
npx expo run:ios
```

From Windows, use EAS with your Apple developer credentials and a registered physical device:

```powershell
cd apps/mobile
npx eas-cli build --profile development --platform ios
npx expo start --dev-client
```

Enable Face ID / Touch ID enrollment in the simulator or device before testing biometric lock. Native builds must include the SQLCipher plugin configuration; changing native plugins requires rebuilding.

## Build and updates

```sh
cd apps/mobile
npx eas-cli build --profile preview --platform android
npx eas-cli build --profile production --platform all
npx eas-cli update:configure
npx eas-cli update --branch production --message "Release description"
```

EAS project identity, update runtime policy, credentials and distribution channels must be configured for your account before publishing. No builds or updates have been submitted automatically.

## Implemented flows

- Onboarding, validated login, business selection, five main tabs, logout, session clearing and account deletion.
- Dashboard: exact-decimal net fiscal turnover, receipt count, refunds, daily trend, historical comparisons, separate bank activity and simulated tax position, sync times and quick actions.
- Sales: date ranges, native date selection, register filter, search, sorting, pagination, aggregate analytics, chart, receipts and source-rich details.
- Banking: masked accounts, balances, date/search filtering, settlements, separate imported records, manual reconciliation links and notes, and matching candidate API.
- Tax monitoring: demo small-business profile, debt versus credit, estimated obligations versus filings, overdue items, calendar and draft/submitted declarations. Sample deadlines are not legal advice or verified statutory dates.
- Settings: business name, language/theme, reminders, notification detail consent, biometrics, export, diagnostics and integration status.
- Server demo sync with retries, in-process concurrency control, last successful timestamps, sanitized logs and deduplicated deadline reminders.
- CSV preview, validation, duplicate detection, explicit confirmation and import-specific containers. Demo and imported transaction lists are separate; imports do not affect demo dashboard totals.
- JWT access tokens, rotating hashed refresh tokens, reuse revocation, Argon2id password hashing, tenant-scoped parameterized SQL and AES-256-GCM credential utility with tenant AAD.
- Native SecureStore sessions and SQLCipher query cache, session-bound cache validation, 24-hour cache age, cache clearing on logout. Web preview keeps credentials and cache only in memory.
- Expo push-device registration and server delivery adapter with generic lock-screen bodies by default. Configure EAS/FCM/APNs and enable notifications on a physical device to exercise delivery.

## Project layout

```text
apps/mobile/app/            Expo Router screens and platform-specific native tabs
apps/mobile/components/     Reusable financial UI, native controls and charts
apps/mobile/services/       REST client, token rotation, secure cache, push registration
apps/mobile/localization/   Georgian/English labels and presentation preferences
apps/api/src/               Fastify app, authentication/authorization and route controllers
apps/api/src/modules/       Finance, imports, credential encryption and push services
apps/api/src/providers/     Demo, import, disabled RS SOAP and bank adapters
apps/api/src/database/      MySQL repositories, migrations runner, seed and test repository
apps/api/src/jobs/          Demo synchronization, retry and deadline reminders
apps/api/migrations/        Identity, financial domain tables and tenant-safe relationships
packages/shared/src/       Zod schemas, API types, money and Tbilisi date utilities
docs/                      Integration findings, security/deployment and verification notes
```

## Validation

```powershell
npm run typecheck
npm run lint
npm test
npm run test:native -w @biz/mobile
cd apps/mobile
npx expo install --check
npx expo export --platform web
npx expo export --platform android
```

MySQL integration tests run only when `TEST_DATABASE_URL` points to an **empty disposable database**. They apply the schema and delete their own fixture business. Never point these tests at a production database.

See [integration readiness](docs/INTEGRATIONS.md), [deployment and security](docs/DEPLOYMENT.md), and [verification and limitations](docs/VERIFICATION.md). Native runtime/device acceptance and authorized live connections remain separate release gates.
