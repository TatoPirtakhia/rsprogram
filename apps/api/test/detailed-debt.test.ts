import { it, expect, vi } from "vitest";
import { RsDetailedDebtClient } from "../src/providers/rs-detailed-debt-client.js";
const credentials = { username: "fixture", password: "secret<&" };
const client = (content: string) =>
  new RsDetailedDebtClient(
    vi.fn(async (_url, options) => {
      expect(String(options?.body)).toContain("secret&lt;&amp;");
      expect(String(options?.body)).toContain(
        "<IdenificationNumber>60003008009</IdenificationNumber>",
      );
      return new Response(
        `<Envelope><Body><IsPersonDebtorDetailedResponse><IsPersonDebtorDetailedResult>${content}</IsPersonDebtorDetailedResult></IsPersonDebtorDetailedResponse></Body></Envelope>`,
      );
    }) as typeof fetch,
  );
const row = (amount: string, id = "60003008009") =>
  `<DebtorInfoDetailedDebt><TaxPayerId>${id}</TaxPayerId><TreasuryCode>101001000</TreasuryCode><TaxPayerDebt>${amount}</TaxPayerDebt></DebtorInfoDetailedDebt>`;
it("normalizes source decimals without floating point arithmetic", async () => {
  const result = await client(`<DebtList>${row("12.3")}</DebtList>`).getDebt(
    credentials,
    "60003008009",
  );
  expect(result.total).toBe("12.30");
  expect(result.rows[0].treasuryCode).toBe("101001000");
});
it("does not turn empty or undocumented responses into a zero balance", async () => {
  await expect(
    client("<Status>unknown</Status><DebtList />").getDebt(
      credentials,
      "60003008009",
    ),
  ).rejects.toMatchObject({ code: "RS_DEBT_NOT_CONFIRMED" });
});
it("rejects another taxpayer, duplicate records and sub-cent amounts", async () => {
  for (const rows of [
    row("1", "123456789"),
    row("1") + row("1"),
    row("1.001"),
  ]) {
    await expect(
      client(`<DebtList>${rows}</DebtList>`).getDebt(
        credentials,
        "60003008009",
      ),
    ).rejects.toThrow();
  }
});
