import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { RsEmployee, RsEmployeesResult } from "@biz/shared";
import { RsRequestError } from "./soap-transport.js";

const envelope = z.object({
  STATUS: z.object({ ID: z.number() }),
  DATA: z.unknown(),
});
const grid = z.object({
  Data: z.object({
    Fields: z.array(z.string()),
    Rows: z.array(z.array(z.unknown())),
  }),
  Summary: z.object({ _Count: z.number().int().nonnegative() }),
});
const record = z.object({
  ID: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]),
  TIN: z.string().min(1),
  ORG_TIN: z.string().min(1),
  FULLNAME: z.string(),
  STATUS: z.union([
    z.literal(-1),
    z.literal(0),
    z.literal(1),
    z.literal("-1"),
    z.literal("0"),
    z.literal("1"),
  ]),
  WORK_TYPE_TXT: z.string().nullable().optional(),
  ACTIVATE_DATE: z.string().nullable().optional(),
});

// Employee_API 1.0.1, /Employees/ListEmployees. Salary is not a registry field.
export function parseEmployees(data: unknown, taxpayerId: string) {
  const parsed = grid.safeParse(data);
  if (!parsed.success) throw new RsRequestError("RS_INVALID_RESPONSE");
  const {
    Data: { Fields, Rows },
    Summary,
  } = parsed.data;
  if (new Set(Fields).size !== Fields.length || Summary._Count < Rows.length)
    throw new RsRequestError("RS_INVALID_RESPONSE");
  const ids = new Set<string>();
  const employees: RsEmployee[] = Rows.map((values) => {
    if (values.length !== Fields.length)
      throw new RsRequestError("RS_INVALID_RESPONSE");
    const item = record.safeParse(
      Object.fromEntries(Fields.map((key, i) => [key, values[i]])),
    );
    if (!item.success) throw new RsRequestError("RS_INVALID_RESPONSE");
    const row = item.data;
    if (row.ORG_TIN !== taxpayerId)
      throw new RsRequestError("RS_PORTAL_ID_MISMATCH");
    const id = String(row.ID);
    if (ids.has(id)) throw new RsRequestError("RS_INVALID_RESPONSE");
    ids.add(id);
    return {
      id,
      tin: row.TIN,
      name: row.FULLNAME,
      status: Number(row.STATUS) as -1 | 0 | 1,
      workType: row.WORK_TYPE_TXT ?? "",
      activatedAt: row.ACTIVATE_DATE || null,
      salary: null,
    };
  });
  return {
    employees,
    total: Summary._Count,
    truncated: Summary._Count > employees.length,
  };
}

export class RsEmployeesClient {
  private challenges = new Map<
    string,
    { uid: string; token: string; expires: number }
  >();
  constructor(private transport: typeof fetch = fetch) {}
  private async request(
    path: string,
    body: unknown,
    token?: string,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.transport(`https://eapi.rs.ge${path}`, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(20000),
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new RsRequestError("RS_CONNECTION_FAILED");
    }
    if (response.status === 401 || response.status === 403)
      throw new RsRequestError("RS_ACCESS_DENIED");
    if (!response.ok) throw new RsRequestError("RS_SERVICE_ERROR");
    const reader = response.body?.getReader();
    if (!reader) throw new RsRequestError("RS_INVALID_RESPONSE");
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 8_000_000) {
        await reader.cancel();
        throw new RsRequestError("RS_RESPONSE_TOO_LARGE");
      }
      chunks.push(part.value);
    }
    let parsed: z.infer<typeof envelope>;
    try {
      parsed = envelope.parse(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
      );
    } catch {
      throw new RsRequestError("RS_INVALID_RESPONSE");
    }
    if (parsed.STATUS.ID !== 0)
      throw new RsRequestError(
        parsed.STATUS.ID === -104
          ? "RS_ACCESS_DENIED"
          : "RS_EMPLOYEES_REJECTED",
      );
    return parsed.DATA;
  }
  async getEmployees(
    uid: string,
    credentials: { username: string; password: string },
    taxpayerId: string,
    verification?: { challengeId: string; pin: string },
  ): Promise<RsEmployeesResult> {
    for (const [id, value] of this.challenges)
      if (value.expires < Date.now()) this.challenges.delete(id);
    let auth: unknown;
    if (verification) {
      const challenge = this.challenges.get(verification.challengeId);
      if (!challenge || challenge.uid !== uid)
        throw new RsRequestError("RS_EMPLOYEES_PIN_EXPIRED");
      this.challenges.delete(verification.challengeId);
      auth = await this.request("/Users/AuthenticatePin", {
        PIN_TOKEN: challenge.token,
        PIN: verification.pin,
        DEVICE_CODE: null,
      });
    } else {
      auth = await this.request("/Users/Authenticate", {
        USERNAME: credentials.username,
        PASSWORD: credentials.password,
        DEVICE_CODE: null,
      });
    }
    const session = z
      .object({
        ACCESS_TOKEN: z.string().min(1).optional(),
        PIN_TOKEN: z.string().min(1).optional(),
        MASKED_MOBILE: z.string().optional(),
      })
      .safeParse(auth);
    if (!session.success) throw new RsRequestError("RS_INVALID_RESPONSE");
    const token = session.data.ACCESS_TOKEN;
    if (!token) {
      if (!session.data.PIN_TOKEN || verification)
        throw new RsRequestError("RS_INVALID_RESPONSE");
      for (const [id, value] of this.challenges)
        if (value.uid === uid) this.challenges.delete(id);
      if (this.challenges.size >= 100)
        throw new RsRequestError("RS_PORTAL_BUSY");
      const challengeId = randomUUID();
      this.challenges.set(challengeId, {
        uid,
        token: session.data.PIN_TOKEN,
        expires: Date.now() + 5 * 60000,
      });
      return {
        state: "pin_required",
        challengeId,
        mobile: session.data.MASKED_MOBILE ?? "",
      };
    }
    try {
      const rows = parseEmployees(
        await this.request(
          "/Employees/ListEmployees",
          { MAXIMUM_ROWS: 10000 },
          token,
        ),
        taxpayerId,
      );
      return {
        state: "ready",
        ...rows,
        checkedAt: new Date().toISOString(),
        salaryAvailable: false,
      };
    } finally {
      await this.request("/Users/SignOut", {}, token).catch(() => {});
    }
  }
}
