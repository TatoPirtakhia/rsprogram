import { XMLParser, XMLValidator } from "fast-xml-parser";
export class RsRequestError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export const parseSoapXml = (xml: string) => {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
    throw new RsRequestError("RS_INVALID_RESPONSE");
  return new XMLParser({
    removeNSPrefix: true,
    parseTagValue: false,
    ignoreAttributes: true,
    processEntities: true,
  }).parse(xml);
};
const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
export async function soapRead(
  transport: typeof fetch,
  options: {
    endpoint: string;
    namespace: string;
    operation: string;
    parameters: Record<string, string>;
  },
) {
  const { endpoint, namespace, operation, parameters } = options;
  if (
    !/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(operation) ||
    Object.keys(parameters).some((k) => !/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(k))
  )
    throw new RsRequestError("RS_INVALID_OPERATION");
  const body = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${operation} xmlns="${escapeXml(namespace)}">${Object.entries(
    parameters,
  )
    .map(([key, value]) => `<${key}>${escapeXml(value)}</${key}>`)
    .join("")}</${operation}></soap:Body></soap:Envelope>`;
  let response: Response;
  try {
    response = await transport(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${namespace.endsWith("/") ? namespace : namespace + "/"}${operation}"`,
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
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const parsed = parseSoapXml(new TextDecoder().decode(bytes));
  const soapBody = parsed.Envelope?.Body;
  if (soapBody?.Fault) throw new RsRequestError("RS_SOAP_FAULT");
  if (!response.ok) throw new RsRequestError("RS_SERVICE_ERROR");
  if (!soapBody || !Object.hasOwn(soapBody, `${operation}Response`))
    throw new RsRequestError("RS_INVALID_RESPONSE");
  return soapBody[`${operation}Response`];
}
