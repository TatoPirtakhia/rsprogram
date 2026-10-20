# External capability readiness

Reviewed 2026-10-20. The default and only enabled provider environment is `demo`. Changing `PROVIDER_MODE` to `live` is rejected until an authorized deployment path is implemented. The mobile client never accepts bank or RS website passwords.

| Capability                                                   | Status                 | Evidence / requirement                                                                            |
| ------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------- |
| Simulated fiscal receipts, registers, tax debt, declarations | VERIFIED_AVAILABLE     | Local demo implementation and API tests; simulated only                                           |
| Simulated banking accounts, transactions and settlements     | VERIFIED_AVAILABLE     | Local demo implementation and API tests; simulated only                                           |
| User-initiated CSV receipt / bank import                     | VERIFIED_AVAILABLE     | Validation, preview, explicit confirmation and deduplication tests                                |
| Excel workbook import                                        | UNSUPPORTED            | Export workbook to UTF-8 CSV; no Excel parser is enabled                                          |
| Published RS GetTPInfoDebt_RS operation description          | VERIFIED_AVAILABLE     | Official description exists; existence does not verify taxpayer access                            |
| Authorized RS debt retrieval                                 | NOT_VERIFIED           | Eligibility, agreement, service-account permissions, Code meaning and debt semantics unresolved   |
| RS own-business fiscal receipts / registers                  | NOT_VERIFIED           | No verified permitted API mapped                                                                  |
| RS obligations / declaration history                         | NOT_VERIFIED           | No verified permitted API mapped                                                                  |
| Tax calendar website                                         | VERIFIED_AVAILABLE     | Official public page exists; no API or legal deadline rules imported                              |
| Machine-readable tax-calendar integration                    | NOT_VERIFIED           | No documented API or holiday-adjustment logic verified                                            |
| TBC bank / merchant integration                              | REQUIRES_AUTHORIZATION | Approved product documentation, account-specific scopes and test credentials required             |
| Bank of Georgia bank / merchant integration                  | REQUIRES_AUTHORIZATION | Approved product documentation, account-specific scopes and test credentials required             |
| Other Georgian banks                                         | UNSUPPORTED            | Adapter not implemented                                                                           |
| Transfers, payments and declaration filing                   | UNSUPPORTED            | Monitoring-only v1 scope                                                                          |
| Push delivery on a configured EAS project/device             | REQUIRES_AUTHORIZATION | User consent, Expo project and FCM/APNs credentials; code implemented, delivery not verified here |

## Official RS evidence

- [Service landing page](https://services.rs.ge/taxservice/taxservice.asmx)
- [GetTPInfoDebt_RS SOAP request/response description](https://services.rs.ge/taxservice/taxservice.asmx?op=GetTPInfoDebt_RS)
- [WSDL](https://services.rs.ge/taxservice/taxservice.asmx?WSDL)
- [Public tax calendar](https://rs.ge/TaxCalendar)

The operation page shows SOAP action `services.rs.ge/GetTPInfoDebt_RS`, login/password fields, and a repeated `TPInfoDebt_RS` response containing Code and DebtAmount. DebtAmount is declared as double on the wire; conversion must use an explicitly verified decimal rounding policy and retain the original payload under appropriate protection. The page does not establish that the login is an ordinary RS website account or define Code as a taxpayer ID, result code or tax type. We do not guess. WSDL retrieval through the research tool failed with a server error during this session.

`RsSoapProvider` consequently returns a typed `UNSUPPORTED` failure for data methods. It deliberately sends no request and stores no credentials. Do not describe it as a completed SOAP client. The provider interface and authenticated encryption utility are ready for a future verified client.

## Required verification before enabling a live adapter

1. Obtain the official product contract and operation documentation from RS or the bank.
2. Confirm eligible account type, taxpayer ownership, agreement and read-only scopes.
3. Identify exact authentication mechanism and credential lifecycle; website credentials are not presumed sufficient.
4. Confirm response status meanings, timestamps, amount sign/currency/precision and pagination.
5. Confirm refunds, corrections, settlement delays, duplicate identifiers and applicable rate limits.
6. Store credentials encrypted on the server using a key outside MySQL; bind ciphertext to business/integration identity and key version.
7. Add schema-validated normalization, fixtures and failure tests, then test only explicitly authorized sandbox or taxpayer accounts.
8. Deploy into an isolated live database/environment. Never merge demo records into live totals.

No browser scraping, CAPTCHA bypass, invented OAuth endpoints or live credential collection is included.
