# RS comparison act request verification — 2026-10-20

Official operation: https://services.rs.ge/taxservice/taxpayerservice.asmx?op=Get_comp_act_new

Formal schema: https://services.rs.ge/taxservice/taxpayerservice.asmx?WSDL

The live WSDL was fetched and confirmed these case-sensitive request fields:

| Field      | XML type                   | Source used                                         |
| ---------- | -------------------------- | --------------------------------------------------- |
| userName   | string, optional in schema | Selected local profile's stored RS username         |
| password   | string, optional in schema | Selected profile's decrypted password; never logged |
| saidCode   | string, optional in schema | User-supplied taxpayer ID `60003008009`             |
| start_date | dateTime, required         | `2026-01-01T00:00:00+04:00`                         |
| end_date   | dateTime, required         | `2026-10-20T23:59:59+04:00`                         |

POST endpoint: `https://services.rs.ge/taxservice/taxpayerservice.asmx`

SOAPAction: `"services.rs.ge/Get_comp_act_new"`

The date range is an application choice (current year through current Tbilisi day), not a service requirement discovered in documentation. The published schema does not explain credential eligibility, allowed date ranges, balance sign conventions, or a payable-total calculation.

A live read-only request using those parameters returned:

```json
{
  "Get_comp_act_newResult": {
    "ResponseStatus": "false",
    "Error": {
      "ErrorCode": "0",
      "ErrorDescription": "მომხმარებელი ან პაროლი არ არის სწორი!"
    }
  }
}
```

This operation's code 0 is the observed authentication rejection, not the system-error interpretation used by the separate Z-report operation. It does not establish that the taxpayer has no debt or that their website login is invalid. No debt amount was returned. An account authorized for this specific service is needed to continue verifying the balance fields.

RS documentation for waybill service accounts describes creating service users, but that is a different API and does not establish that those accounts work with Get_comp_act_new. Do not change username formats, create accounts, or infer this service's permission model from the waybill documentation.

## Other methods and portal verification

Additional live read-only checks with the same saved account:

- `Get_QuickCash_Info`: ResponseStatus false; error -1, username/password rejected.
- `Get_comp_act_old`: ResponseStatus false; error 0, username/password rejected.
- `GetTPInfoDebt_RS`: empty operation response.

Signing in through the official RS website with the same saved credentials succeeded. The UI identifies this login as a sub-user. This proves the saved credentials work for the web portal, while it does not explain the SOAP authorization rules.

On `https://eservices.rs.ge/PayerInfo.aspx`, Basic Information → Budget Settlement showed recognized liability balance **-1290.56 (debt)** and consolidated balance **-1290.56 (debt)**, both as of **2026-10-19**. Therefore the displayed debt amount is **1290.56 GEL**, according to the portal's explicit debt label. This is a single total, not two amounts to sum.

The portal snapshot is persisted separately in the selected local profile (`portalDebt`) with its source URL, as-of date, and verification timestamp. A subsequent implementation replaced the one-time observation with a headless Puppeteer adapter. Each debt request signs into a fresh browser context, verifies the taxpayer ID, reads PayerInfo and persists the new amount. The user interface requests a fresh read on profile entry and manual refresh. Failed reads preserve the last success with a stale marker. No portal cookies or session tokens are copied into the mobile application. The local backend is not deployed for phone access; see LOCAL_RS.md for that remaining deployment boundary.
