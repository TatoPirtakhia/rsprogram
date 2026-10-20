import { cents, decimal, localDate, type Receipt } from "@biz/shared";
import { fiscalTotal } from "./finance.js";
export function fiscalSummary(receipts: Receipt[]) {
  const seen = new Set<string>();
  const records = receipts.filter((r) => {
    const key = `${r.businessUid}:${r.source}:${r.externalId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const sales = records.filter((r) => r.status === "sale");
  const daily = new Map<string, Receipt[]>();
  for (const r of records) {
    const day = localDate(new Date(r.occurredAt));
    daily.set(day, [...(daily.get(day) ?? []), r]);
  }
  return {
    netSales: fiscalTotal(records),
    receiptCount: sales.length,
    average: sales.length
      ? decimal(
          sales.reduce((sum, r) => sum + cents(r.amount), 0n) /
            BigInt(sales.length),
        )
      : "0.00",
    refunds: decimal(
      records
        .filter((r) => r.status === "refund")
        .reduce((sum, r) => sum + cents(r.amount), 0n),
    ),
    voidCount: records.filter((r) => r.status === "void").length,
    chart: [...daily]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, rows]) => ({ date, amount: fiscalTotal(rows) })),
  };
}
