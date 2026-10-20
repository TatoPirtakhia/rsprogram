# Verification and remaining release work

## Executed locally

- Strict TypeScript checks: backend, mobile and shared packages.
- ESLint across the workspace.
- Vitest API tests: session authentication/reuse/revocation, tenant scoping, core routes/OpenAPI, pagination/date validation, unsupported providers, confirmed imports and bank deduplication, exact financial totals/refunds/voids, reconciliation validation, Tbilisi deadlines, retries, credential authentication and validation failures.
- Vitest cache tests: cross-session isolation, expiry and clearing.
- React Native Testing Library/Jest: login input validation and visible server errors.
- Playwright in Chrome at 390×844: onboarding → login → business selection → dashboard → sales → banking → taxes → settings → integration diagnostics/status. Dashboard screenshot: `artifacts/dashboard.png`.
- Expo dependency compatibility check.
- Web, Android and iOS JavaScript/Hermes bundle exports. These do not replace a signed native build or device tests.

## Not executed / not yet enabled

- MySQL was unavailable locally because Docker is not installed. Three repository/schema integration tests are supplied and conditionally run against an empty disposable `TEST_DATABASE_URL`. GitHub Actions provisions MySQL; that remote workflow has not been executed in this session.
- No signed APK/IPA, simulator installation, physical-device test or accessibility audit was performed. iOS signing/builds need macOS/Xcode or the user's EAS and Apple accounts.
- Native SQLCipher behavior, biometric enrollment/lock lifecycle, Dynamic Type, native appearance and APNs/FCM push delivery need device verification. Tests mock native UI services where needed; they do not prove native module behavior.
- RS SOAP and bank adapters are disabled pending documented permissions and verified field semantics. No taxpayer account was queried.
- Excel import is not implemented; CSV export from Excel is supported. Imports accept pasted CSV and require user confirmation; native file picking remains future work.
- Localization covers primary navigation and core labels. Several secondary administrative and descriptive strings remain English. Full Georgian/English translation review is pending.
- Tax category/profile changes require future verified provider support. The demo uses a small-business category only; its deadlines and debt are synthetic.
- Demo fiscal history is 30 days. Longer date filters work but do not invent older records. Manual reconciliation UI shows up to 100 recent source records; server matching candidates are suggestions, not an automatic classifier.
- Production account onboarding/password reset, organization membership management, KMS-backed credential lifecycle, durable distributed jobs, push receipt processing and error monitoring are pending. The current deployment model is one owner/business and one API worker.

## Dependency audit

The final dependency review reported **57 npm advisories (25 moderate, 32 high, zero critical)** across the complete mobile/development tree. This is an unresolved release blocker, not a clean security review. Many are propagated through current Expo/React Native/Jest toolchains and npm's suggested fixes include incompatible SDK downgrades. Direct vulnerable csv-parse, Swagger UI and Vitest versions were upgraded. Do not run `npm audit fix --force` without reviewing the resulting SDK/toolchain changes. Re-run the audit and perform targeted upstream updates before handling real financial data or distributing production builds.

The backend production dependency audit (`npm audit --workspace @biz/api --omit=dev`) separately reported zero advisories. This is dependency-scan evidence only and does not constitute a security audit of the application.

## Review scope

This delivery is a working demo application and integration foundation. It is not a claim that all production gates in the original specification are complete. The live-capability report, deployment notes and these limitations form the handoff for the authorized integration and production-readiness phases.
