import { cents, decimal } from "@biz/shared";
import { soapRead, RsRequestError } from "./soap-transport.js";

export class RsDetailedDebtClient {
  constructor(private transport: typeof fetch = fetch) {}
  async getDebt(
    credentials: { username: string; password: string },
    taxpayerId: string,
  ) {
    const node = await soapRead(this.transport, {
      endpoint: "https://services.rs.ge/taxservice/taxservice.asmx",
      namespace: "services.rs.ge",
      operation: "IsPersonDebtorDetailed",
      parameters: {
        login: credentials.username,
        password: credentials.password,
        IdenificationNumber: taxpayerId,
        PersonalNumber: "",
        Name: "",
        Surname: "",
        DoB: "",
      },
    });
    const result = node?.IsPersonDebtorDetailedResult;
    if (!result || typeof result !== "object")
      throw new RsRequestError("RS_NO_DATA");
    const raw = result.DebtList?.DebtorInfoDetailedDebt;
    const values = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
    // An undocumented status or empty list must never establish a zero balance.
    if (!values.length) throw new RsRequestError("RS_DEBT_NOT_CONFIRMED");
    const seen = new Set<string>();
    const rows = values.map((row: Record<string, unknown>) => {
      const id = String(row.TaxPayerId ?? "");
      const treasuryCode = String(row.TreasuryCode ?? "");
      const amount = String(row.TaxPayerDebt ?? "");
      if (
        id !== taxpayerId ||
        !/^\d{1,20}$/.test(treasuryCode) ||
        !/^\d{1,16}(?:\.\d{1,2}0*)?$/.test(amount)
      )
        throw new RsRequestError("RS_INVALID_RESPONSE");
      const key = `${id}:${treasuryCode}`;
      if (seen.has(key)) throw new RsRequestError("RS_CONFLICTING_RECORDS");
      seen.add(key);
      const [whole, fraction = ""] = amount.split(".");
      const normalized = `${whole}.${fraction.slice(0, 2).padEnd(2, "0")}`;
      return {
        treasuryCode,
        treasuryCodeName: String(row.TreasuryCodeName ?? "").slice(0, 500),
        amount: decimal(cents(normalized)),
      };
    });
    return {
      fetchedAt: new Date().toISOString(),
      operation: "IsPersonDebtorDetailed" as const,
      status: String(result.Status ?? "").slice(0, 100),
      rows,
      total: decimal(rows.reduce((sum, row) => sum + cents(row.amount), 0n)),
    };
  }
}
