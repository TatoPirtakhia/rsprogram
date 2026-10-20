import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { RsDebtResponse } from "../modules/local-profiles.js";
export const RS_SERVICE_URL =
  "https://services.rs.ge/taxservice/taxservice.asmx";
export const RS_SOAP_ACTION = "services.rs.ge/GetTPInfoDebt_RS";
const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
export class RsRequestError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export class RsSoapClient {
  constructor(private transport: typeof fetch = fetch) {}
  async getDebtResponse(credentials: {
    username: string;
    password: string;
  }): Promise<RsDebtResponse> {
    const body = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetTPInfoDebt_RS xmlns="services.rs.ge"><login>${escapeXml(credentials.username)}</login><password>${escapeXml(credentials.password)}</password></GetTPInfoDebt_RS></soap:Body></soap:Envelope>`;
    let response: Response;
    try {
      response = await this.transport(RS_SERVICE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: `"${RS_SOAP_ACTION}"`,
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new RsRequestError("RS_CONNECTION_FAILED");
    }
    if (response.status === 401 || response.status === 403)
      throw new RsRequestError("RS_ACCESS_DENIED");
    if (Number(response.headers.get("content-length") ?? 0) > 1_000_000)
      throw new RsRequestError("RS_RESPONSE_TOO_LARGE");
    const reader = response.body?.getReader();
    if (!reader) throw new RsRequestError("RS_INVALID_RESPONSE");
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 1_000_000) {
        await reader.cancel();
        throw new RsRequestError("RS_RESPONSE_TOO_LARGE");
      }
      chunks.push(chunk.value);
    }
    const xml = Buffer.concat(chunks).toString("utf8");
    if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
      throw new RsRequestError("RS_INVALID_RESPONSE");
    const parsed = new XMLParser({
      removeNSPrefix: true,
      parseTagValue: false,
      ignoreAttributes: true,
      processEntities: false,
    }).parse(xml);
    const soapBody = parsed.Envelope?.Body;
    if (soapBody?.Fault) throw new RsRequestError("RS_SOAP_FAULT");
    if (!response.ok) throw new RsRequestError("RS_SERVICE_ERROR");
    const payload = soapBody?.GetTPInfoDebt_RSResponse;
    if (payload === "" || payload === null)
      throw new RsRequestError("RS_NO_DATA");
    if (!payload || !Object.hasOwn(payload, "GetTPInfoDebt_RSResult"))
      throw new RsRequestError("RS_INVALID_RESPONSE");
    const values = payload.GetTPInfoDebt_RSResult?.TPInfoDebt_RS;
    const rows =
      values === undefined ? [] : Array.isArray(values) ? values : [values];
    const result = rows.map((row: Record<string, unknown>) => {
      const code = String(row.Code ?? "");
      const debtAmount = String(row.DebtAmount ?? "");
      if (
        !/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(debtAmount) ||
        code.length > 254 ||
        debtAmount.length > 100
      )
        throw new RsRequestError("RS_INVALID_RESPONSE");
      return { code, debtAmount };
    });
    // Preserve wire values; Code semantics and assessment status are not inferred.
    return {
      fetchedAt: new Date().toISOString(),
      operation: "GetTPInfoDebt_RS",
      mappingStatus: "NOT_VERIFIED",
      rows: result,
    };
  }
}
