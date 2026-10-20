import { parse } from "csv-parse/sync";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  moneySchema,
  type Dataset,
  type Receipt,
  type BankTransaction,
} from "@biz/shared";
const common = {
  externalId: z.string().min(1).max(191),
  occurredAt: z.iso.datetime({ offset: true }),
  amount: moneySchema.refine(
    (v) => !v.startsWith("-"),
    "Use positive amounts and explicit status/direction",
  ),
};
const receiptSchema = z.object({
  ...common,
  registerUid: z.uuid(),
  status: z.enum(["sale", "refund", "void"]),
});
const transactionSchema = z.object({
  ...common,
  accountUid: z.uuid(),
  direction: z.enum(["incoming", "outgoing"]),
  description: z.string().max(300),
  category: z.string().max(100),
});
export interface ImportPreview {
  uid: string;
  kind: "receipts" | "transactions";
  rows: (Receipt | BankTransaction)[];
  duplicates: number;
  createdAt: string;
  confirmed: boolean;
}
export function previewCsv(
  csv: string,
  kind: "receipts" | "transactions",
  data: Dataset,
): ImportPreview {
  const raw: unknown[] = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    max_record_size: 4096,
  });
  if (raw.length > 1000) throw new Error("IMPORT_TOO_LARGE");
  const rows: ImportPreview["rows"] = [];
  const keys = new Set(
    (kind === "receipts" ? data.receipts : data.transactions)
      .filter((r) => r.source === "import")
      .map((r) => r.externalId),
  );
  let duplicates = 0;
  const now = new Date().toISOString();
  for (const row of raw) {
    const parsed =
      kind === "receipts"
        ? receiptSchema.parse(row)
        : transactionSchema.parse(row);
    if (keys.has(parsed.externalId)) {
      duplicates++;
      continue;
    }
    keys.add(parsed.externalId);
    const base = {
      ...parsed,
      uid: randomUUID(),
      businessUid: data.business.uid,
      currency: "GEL" as const,
      source: "import" as const,
      sourceAt: parsed.occurredAt,
      syncedAt: now,
    };
    if ("registerUid" in parsed) {
      if (
        !data.registers.some(
          (r) => r.uid === parsed.registerUid && r.source === "import",
        )
      )
        throw new Error("IMPORT_REGISTER_REQUIRED");
      rows.push({ ...base, paymentMethod: null } as Receipt);
    } else {
      if (
        !data.accounts.some(
          (a) => a.uid === parsed.accountUid && a.source === "import",
        )
      )
        throw new Error("IMPORT_ACCOUNT_REQUIRED");
      rows.push(base as BankTransaction);
    }
  }
  return {
    uid: randomUUID(),
    kind,
    rows,
    duplicates,
    createdAt: now,
    confirmed: false,
  };
}
