# GetTPInfoDebt_RS connection findings

Historical investigation. The user subsequently supplied the correct fiscal service: `https://services.rs.ge/taxservice/taxpayerservice.asmx?WSDL`, method `Get_Z_Report_Details`. Profile synchronization now uses that method and no longer calls the debt endpoint below. The first request to the correct service returned its explicit credential-rejection code 1. See LOCAL_RS.md for the active implementation and date/report mapping.

Further verification: a WSDL-generated SOAP client sent the same credential values and returned the same provider code 1 and the provider's invalid-user/password message. A one-time normal browser login on the official RS portal using the selected profile's stored credentials also displayed “გთხოვთ შეამოწმოთ მომხმარებელი და პაროლი.” No SMS/CAPTCHA bypass or portal scraping integration was implemented; temporary diagnostic sessions were closed and scripts removed. This confirms rejection of the currently saved pair at both entry points; it does not establish which field differs from the user's intended/current credentials.

Checked 2026-10-20 using the selected local profile, without logging usernames, passwords or taxpayer response values.

- SOAP 1.1: HTTP 200, `text/xml; charset=utf-8`, valid XML, operation response present but empty. There is no `GetTPInfoDebt_RSResult` child.
- SOAP 1.2, formatted according to the official operation description: HTTP 200, `application/soap+xml; charset=utf-8`, valid XML, the same empty operation response and no SOAP Fault.
- Consequently the observed failure is not malformed XML, a namespace parsing difference or a SOAP-version mismatch. The service returned no business data in either documented transport format.
- The response alone does not reveal whether credentials are incorrect, the account lacks service access, or the service has no result for another reason. These explanations remain unverified.
- The official operation description documents the XML input/output shape but not eligibility, account provisioning or the meaning of an empty response. Do not present HTTP 200 as successful account authentication.

Next required information: whether the saved credentials are an ordinary RS portal account or credentials specifically issued for this WebService, and the applicable RS integration access/documentation for that account. Do not substitute invoice or waybill service credentials or endpoints as if those products automatically granted access to this debt service.

References:

- https://services.rs.ge/taxservice/taxservice.asmx?op=GetTPInfoDebt_RS
- https://services.rs.ge/taxservice/taxservice.asmx

No credentials or private response payloads are included in this document.
