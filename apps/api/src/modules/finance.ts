import {
  cents,
  decimal,
  localDate,
  type Dataset,
  type Dashboard,
  type Receipt,
  type RecordQuery,
  type Page,
} from "@biz/shared";
export function fiscalTotal(records: Receipt[]) {
  const seen = new Set<string>();
  let total = 0n;
  for (const r of records) {
    const key = `${r.businessUid}:${r.source}:${r.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.status === "sale") total += cents(r.amount);
    if (r.status === "refund") total -= cents(r.amount);
  }
  return decimal(total);
}
export function paginate<T extends { uid: string; occurredAt: string }>(
  records: T[],
  q: RecordQuery,
): Page<T> {
  const filtered = records
    .filter(
      (r) =>
        (!q.from || localDate(new Date(r.occurredAt)) >= q.from) &&
        (!q.to || localDate(new Date(r.occurredAt)) <= q.to) &&
        JSON.stringify(r).toLowerCase().includes(q.search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        (q.sort === "asc" ? 1 : -1) * a.occurredAt.localeCompare(b.occurredAt),
    );
  return {
    items: filtered.slice((q.page - 1) * q.limit, q.page * q.limit),
    total: filtered.length,
    page: q.page,
    limit: q.limit,
  };
}
export function dashboard(d: Dataset, now = new Date()): Dashboard {
  const today = localDate(now);
  const shift = (n: number) =>
    localDate(
      new Date(new Date(today + "T12:00:00+04:00").getTime() + n * 86400000),
    );
  const forDay = (day: string) =>
    d.receipts.filter((r) => localDate(new Date(r.occurredAt)) === day);
  const receipts = forDay(today);
  const chart = Array.from({ length: 30 }, (_, i) => ({
    date: shift(i - 29),
    amount: fiscalTotal(forDay(shift(i - 29))),
  }));
  const bank = d.transactions.filter(
    (t) => localDate(new Date(t.occurredAt)) === today,
  );
  const count = receipts.filter((r) => r.status === "sale").length;
  const sales = fiscalTotal(receipts);
  return {
    business: d.business,
    sales,
    receiptCount: count,
    refunds: decimal(
      receipts
        .filter((r) => r.status === "refund")
        .reduce((s, r) => s + cents(r.amount), 0n),
    ),
    average: count ? decimal(cents(sales) / BigInt(count)) : "0.00",
    bankIncoming: decimal(
      bank
        .filter((t) => t.direction === "incoming")
        .reduce((s, t) => s + cents(t.amount), 0n),
    ),
    bankOutgoing: decimal(
      bank
        .filter((t) => t.direction === "outgoing")
        .reduce((s, t) => s + cents(t.amount), 0n),
    ),
    taxDebt: d.debts.some((t) => t.amount === null)
      ? null
      : decimal(d.debts.reduce((s, t) => s + cents(t.amount!), 0n)),
    nextObligation:
      d.obligations
        .filter((o) => o.status === "upcoming")
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null,
    chart,
    comparisons: {
      yesterday: fiscalTotal(forDay(shift(-1))),
      previous7Days: fiscalTotal(
        d.receipts.filter(
          (r) =>
            localDate(new Date(r.occurredAt)) >= shift(-7) &&
            localDate(new Date(r.occurredAt)) < today,
        ),
      ),
      previousMonth: fiscalTotal(
        d.receipts.filter(
          (r) =>
            localDate(new Date(r.occurredAt)).slice(0, 7) ===
            localDate(
              new Date(
                Date.parse(today.slice(0, 7) + "-01T12:00:00+04:00") - 86400000,
              ),
            ).slice(0, 7),
        ),
      ),
    },
    alerts: d.obligations
      .filter((o) => o.status === "overdue")
      .map((o) => `DEMO · ${o.taxType} · ${o.dueDate}`),
    updatedAt:
      d.integrations.find((i) => i.uid === "rs-demo")?.lastSuccessAt ?? null,
  };
}
export function reconcile(
  d: Dataset,
  receiptUid: string,
  transactionUid: string,
  note: string,
) {
  const r = d.receipts.find((r) => r.uid === receiptUid);
  const t = d.transactions.find((t) => t.uid === transactionUid);
  if (!r || !t) throw new Error("RECORD_NOT_FOUND");
  if (r.source !== t.source) throw new Error("SOURCE_MISMATCH");
  if (
    d.reconciliations.some(
      (l) => l.receiptUid === receiptUid || l.transactionUid === transactionUid,
    )
  )
    throw new Error("ALREADY_LINKED");
  if (r.status !== "sale" || t.direction !== "incoming")
    throw new Error("INVALID_LINK");
  return { receiptUid, transactionUid, note };
}
