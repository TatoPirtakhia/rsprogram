# Local RS profiles — current application flow

The app opens directly into **RS მომხმარებლები**. There is no application account or login step. The old `/login` URL redirects to this list. Local RS profile management does not use the application's JWT login or seeded demo password.

## Run

```powershell
npm ci
npm run dev:api
# In another terminal:
npm run dev:mobile
```

Open `http://localhost:8081`. `npm run local -w @biz/api` starts the same local API without source watching. No MySQL server or Docker is needed for this workflow. Node 24 provides the local SQLite driver.

## Use

1. Click **RS მომხმარებლის დამატება**.
2. Enter a display name, the exact RS username and its password. Usernames do not need to be emails; short nonempty passwords are accepted unchanged.
3. Save and open the profile.
4. Opening the profile automatically sends a read-only request with its saved credentials. **RS-დან ინფორმაციის მიღება** repeats the request manually.
5. Previously received information and its timestamp remain visible. Switch accounts by returning to the profile list. Profile credentials can be replaced or the complete profile deleted.

Saving and opening a profile requests its information. Only the selected profile's credentials are decrypted and used; no global RS username/password exists. Cached results remain visible while a new request is in progress.

## Storage

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
