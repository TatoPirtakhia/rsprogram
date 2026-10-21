# Local RS profiles — current application flow

The app opens directly into **RS მომხმარებლები**. There is no application account or login step. The old `/login` URL redirects to this list. Local RS profile management does not use the application's JWT login or seeded demo password.

## Current native iPhone mode: Mac/server backend

The native client now uses `services/api.native.ts` to send requests to the selected server, with its URL and connection key kept in Keychain. The Release app embeds its JavaScript and needs no Metro. Start the Mac API with `iPhone-start.command`. Local HTTP is restricted in client validation to private-network hosts; future hosted endpoints must use HTTPS.

Profiles and RS credentials are stored by the server, and SOAP/portal scraping run there. The prior phone database is retained only for optional profile transfer. Changing the server clears resource caches and rejects late responses from the previous connection. The phone transfer button copies missing usernames only and retains the source phone records.

See [the phone instructions](../iPhone-ინსტრუქცია.md). cPanel production deployment remains a separate step: the current local-only/demo server is not a production endpoint.

## Run the web/server preview

```powershell
npm ci
npm run dev:api
# In another terminal:
npm run dev:mobile
```

Open `http://localhost:8081`. `npm run local -w @biz/api` starts the same local API without source watching. No MySQL server or Docker is needed for this workflow. Node 24 provides the local SQLite driver.

## Use

### iPhone Expo Go preview (SDK 57)

The mobile workspace is aligned to SDK 57 for the installed iPhone Expo Go version. Expo Go uses an in-memory query cache; SQLCipher persistence remains enabled for development/production native builds. Face ID and push notification acceptance still require a development build.

On Windows, run `./scripts/iphone-preview.ps1 -Service setup` once, then run `-Service api` and `-Service expo` in separate terminals. Setup discovers the current LAN address and writes a temporary pairing token to ignored `artifacts/iphone-preview.json` and `apps/mobile/.env.local`. Scan `exp://<computer-LAN-IP>:8081` on the iPhone; both devices must be on the same trusted Wi-Fi. This is a development-only preview, not a public server: the token is included in the development bundle, so it is not protection against other people with access to that bundle. Stop the preview services after testing. Production continues to reject this preview token.

If Windows has denied Node.js inbound access, run `scripts/allow-iphone-preview.ps1` from an Administrator PowerShell window. It allows only this computer's preview ports 8081 and 3001 from the local subnet and adjusts the existing Node TCP denial rule to retain its block on other ports. No general firewall disabling is needed. Local RS routes otherwise remain loopback-only unless the preview environment and matching request token are both present.

1. Click **RS მომხმარებლის დამატება**.
2. Enter a display name, the exact RS username and its password. Usernames do not need to be emails; short nonempty passwords are accepted unchanged.
3. Save and open the profile.
4. Opening the profile automatically sends a read-only request with its saved credentials. **RS-დან ინფორმაციის მიღება** repeats the request manually.
5. Previously received information and its timestamp remain visible. Switch accounts by returning to the profile list. Profile credentials can be replaced or the complete profile deleted.

Saving and opening a profile requests its information. Only the selected profile's credentials are decrypted and used; no global RS username/password exists. Cached results remain visible while a new request is in progress.

### RS inbox push notifications

The local server checks the RS portal inbox („შეტყობინებები“, `/app/Notifications`) every 10 minutes for each profile that has a taxpayer ID. It signs in like the debt lookup, reads the list the page loads from `eapi.rs.ge/Notifications/GrdNotifications`, and sends an Expo push for message IDs it has not seen before. The first successful check only records the existing messages, so old messages never trigger a push. Profiles are checked one at a time. Set `RS_INBOX_POLL=0` to disable this, or `RS_INBOX_INTERVAL_MINUTES` (minimum 5) to change the interval. Frequent logins may make RS ask for SMS/CAPTCHA; that shows up as `inboxError` on the profile.

Pushes need a development build: Expo Go cannot receive remote notifications. Run `eas init` once to add the EAS project ID, then `eas build --profile development --platform ios`. The app registers its push token with `POST /api/v1/local/push-token` on startup, and tapping a notification opens that profile. Delivery only works while this computer runs the server.

## Storage

### Automatic budget debt lookup

Profile settings accept an optional 9- or 11-digit taxpayer identification number. Opening a profile independently calls `POST /api/v1/local/profiles/:uid/debt`. The backend uses Puppeteer in headless mode to sign into the official RS web portal with that profile's stored credentials, verifies the taxpayer identity on MainPage, opens Accounting.aspx („საგადასახადო დავალიანება“) and reads the `hsAccounting.ashx/GetBudgetAccountingInfo` response it loads: `ToBePaid` (shown as the amount to pay), `Balance` (current debt) and `TotalDebt` (tax due in the next 30 days). This is today's payable amount; PayerInfo's recognized balance lags by its as-of date. A negative amount to pay is shown as zero debt, and a missing or malformed amount is an error, never zero. Each session signs out of the portal before closing, since sessions left open made later logins for the same account stall. `PayDecl.aspx?type=2` redirects sub-user accounts to MainPage, so it is not used.

Every request starts a fresh isolated browser context and closes it afterward. There is no cached-success shortcut. Profile entry, pull-to-refresh, the top refresh icon and the debt refresh button trigger fresh reads. Only two portal browsers may run concurrently. Credentials and cookies are not returned or logged. No browser authentication state is persisted. SMS/CAPTCHA, changed page layout, identity mismatches and failed login are reported as failures. The last successful snapshot remains with its original timestamp and a previous-data marker. Editing credentials clears snapshots. This portal adapter is separate from the published SOAP APIs, which rejected the selected account despite successful portal login.

Windows uses installed Google Chrome by default. Other hosts use Puppeteer's downloaded Chrome. Set `PUPPETEER_EXECUTABLE_PATH` to an installed compatible browser if needed. If package installation skips lifecycle scripts, run `npx puppeteer browsers install chrome`; Linux hosts also need Chrome's system libraries. Do not disable the Chrome sandbox to work around deployment configuration.

The mobile application only requests the backend; it does not run Puppeteer on the phone. The current no-login server deliberately remains loopback-only. A physical phone or distributed mobile build requires a reachable HTTPS backend with per-user authentication, authorization and account-scoped profile storage before deployment; merely changing the API URL or binding this local service publicly is insufficient. No public hosting or mobile deployment has been performed. Payments update the app after RS itself posts them; the displayed RS as-of date may lag the check time.

- `apps/api/data/rs-profiles.sqlite`: local profile records, encrypted passwords and cached service results.
- `apps/api/data/credentials.key`: server-only AES-256-GCM encryption key, generated once and stored outside the database. Keep this file together with the database when backing up locally; losing it makes the saved passwords unrecoverable.
- These files are excluded from Git. Passwords are never returned by list/detail APIs and are not stored in the mobile token store or browser storage.
- The local no-login routes require loopback connections and validate Host/Origin. The local server binds to `127.0.0.1`. This default is for the computer running the app, not a publicly exposed or shared multi-user service.

## Current fiscal integration

The active method is now **Get_Z_Report_Details**, using the official service at `https://services.rs.ge/taxservice/taxpayerservice.asmx` ([operation description](https://services.rs.ge/taxservice/taxpayerservice.asmx?op=Get_Z_Report_Details)). Its WSDL is available at the same address with `?WSDL`.

The selected profile's credentials are sent as `UserName` and `Password`. Date filters supply `StartDate` at the beginning of the first day and `EndDate` at the end of the last day, in Asia/Tbilisi. Opening a profile always automatically loads the current Tbilisi day, regardless of its previous filter. The period dropdown beside the fiscal amount offers quick ranges and custom dates using the platform's native date picker. The app accepts up to 366 days per request; manual refresh and register filters are also available.

Returned fields are mapped directly: `DeviceNumber`, `ReportDate`, `Quantity`, `PaidAmount`, `PaidCash`, `PaidOther`, and `ZNumber`. These are Z-report fiscal summaries, not individual receipt records or bank settlements. The app displays exact-decimal totals, receipt counts, register counts, a daily chart, cash/other splits explicitly provided by the source, and a report list. Duplicate reports are not double-counted; conflicting duplicates fail validation.

Provider failure codes are mapped from the supplied specification: 0 → system error, 1 → username/password rejected, 2 → no information found for the period. Code 2 is not interpreted as zero tax debt. Failed requests preserve the last successful source snapshot and timestamp. A live request to this endpoint returned code 1 for the selected profile during verification, so successful taxpayer data retrieval has not yet been verified.

The previous `GetTPInfoDebt_RS` endpoint is no longer used by profile synchronization. No invoice/waybill workflows were added from the user's illustrative SOAP helper code. Tax debt, declarations and banking remain separate integrations.

## Previous debt-service investigation (historical)

The client calls only the [published GetTPInfoDebt_RS SOAP operation](https://services.rs.ge/taxservice/taxservice.asmx?op=GetTPInfoDebt_RS), at the fixed HTTPS service address. It XML-escapes the selected username/password, applies a timeout and response-size bound, rejects DTD/entity declarations and does not expose raw SOAP faults containing possible secrets.

The service describes login/password input and Code/DebtAmount output. Whether a given RS website account is permitted to use this service still depends on RS access rules. Saving credentials does not prove authorization. No live taxpayer credentials were used in automated tests.

Returned `Code` and `DebtAmount` are retained as source strings and displayed explicitly as an unmapped service response. The meaning of Code and whether an amount is an assessed debt remain unverified; no aggregation or confirmed tax-debt claim is made. An empty response is not displayed as zero debt. Failed requests keep the last successful response with a visible error and timestamp.

Fiscal receipts, registers, declarations, obligations and banking are marked unavailable on these real profiles until their authorized APIs are implemented. No demo financial data is injected into a saved RS profile. Original demo monitoring APIs and the separate MySQL backend remain in the repository for further integration work.

## Verification

Backend tests cover encrypted persistence/reopening, profile isolation, selected-credential XML requests, loopback/origin checks, preserving stale results and sanitizing SOAP faults. Native component tests cover username/short-password submission and error handling. Browser tests exercise direct no-login entry, adding a profile, selecting it and reopening its persisted record. Tests use mocked RS transport; no live RS requests are made by the test suite.
