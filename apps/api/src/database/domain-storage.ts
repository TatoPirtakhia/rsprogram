import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { randomUUID } from "node:crypto";
import type { Dataset } from "@biz/shared";
type Connection = Pool | PoolConnection;
const collections = {
  registers: "cash_registers",
  receipts: "fiscal_receipts",
  accounts: "bank_accounts",
  transactions: "bank_transactions",
  settlements: "merchant_settlements",
  debts: "tax_debts",
  obligations: "tax_obligations",
  declarations: "tax_declarations",
  integrations: "integrations",
  notifications: "notifications",
  reconciliations: "transaction_reconciliations",
  logs: "integration_sync_logs",
} as const;
type Key = keyof typeof collections;
const timestamp = (value: unknown) =>
  typeof value === "string" ? new Date(value) : null;
export async function readDataset(
  c: Connection,
  businessUid: string,
): Promise<Dataset | null> {
  const [businesses] = await c.execute<RowDataPacket[]>(
    "SELECT * FROM businesses WHERE uid=?",
    [businessUid],
  );
  const b = businesses[0];
  if (!b) return null;
  const d = {
    business: {
      uid: b.uid,
      name: b.name,
      taxId: b.tax_id,
      owner: b.owner_name,
      taxProfile:
        typeof b.tax_profile === "string"
          ? JSON.parse(b.tax_profile)
          : b.tax_profile,
    },
  } as Dataset;
  for (const [key, table] of Object.entries(collections)) {
    // Table names are compile-time constants, never user input.
    const [rows] = await c.execute<RowDataPacket[]>(
      `SELECT payload,amount FROM ${table} WHERE business_uid=? ORDER BY created_at,uid`,
      [businessUid],
    );
    (d as unknown as Record<string, unknown>)[key] = rows.map((row) => {
      const value =
        typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
      if ("amount" in value) value.amount = row.amount;
      if (key === "accounts") value.balance = row.amount;
      return value;
    });
  }
  const [preferences] = await c.execute<RowDataPacket[]>(
    "SELECT payload FROM notification_preferences WHERE business_uid=? LIMIT 1",
    [businessUid],
  );
  d.preferences = preferences[0]
    ? typeof preferences[0].payload === "string"
      ? JSON.parse(preferences[0].payload)
      : preferences[0].payload
    : {
        language: "ka",
        theme: "system",
        reminders: [7, 3, 1, 0],
        detailedNotifications: false,
        pushEnabled: false,
        salesChangePercent: 30,
      };
  return d;
}
export async function writeDataset(
  c: PoolConnection,
  businessUid: string,
  d: Dataset,
) {
  await c.execute(
    "UPDATE businesses SET name=?,owner_name=?,tax_profile=? WHERE uid=?",
    [
      d.business.name,
      d.business.owner,
      JSON.stringify(d.business.taxProfile),
      businessUid,
    ],
  );
  // Registers and accounts precede their dependent records; all writes share the caller's transaction.
  for (const key of [
    "registers",
    "accounts",
    "receipts",
    "transactions",
    "settlements",
    "debts",
    "obligations",
    "declarations",
    "integrations",
    "notifications",
    "reconciliations",
    "logs",
  ] as Key[]) {
    const table = collections[key];
    for (const item of d[key]) {
      const r = item as unknown as Record<string, unknown>;
      const columns: Record<string, unknown> = {
        uid: r.uid,
        business_uid: businessUid,
        external_id: r.externalId ?? null,
        source: r.source ?? "demo",
        amount: r.amount ?? null,
        currency: r.currency ?? "GEL",
        source_at: timestamp(r.occurredAt ?? r.sourceAt ?? r.createdAt ?? r.at),
        synced_at: timestamp(
          r.syncedAt ?? r.lastSuccessAt ?? r.createdAt ?? r.at,
        ),
        payload: JSON.stringify(r),
      };
      if (key === "registers")
        Object.assign(columns, { register_name: r.name, status: r.status });
      if (key === "receipts")
        Object.assign(columns, {
          register_uid: r.registerUid,
          receipt_status: r.status,
          payment_method: r.paymentMethod,
        });
      if (key === "accounts")
        Object.assign(columns, {
          amount: r.balance,
          bank_name: r.bank,
          iban: r.iban,
        });
      if (key === "transactions")
        Object.assign(columns, {
          account_uid: r.accountUid,
          direction: r.direction,
          category: r.category,
          description: r.description,
        });
      if (key === "settlements")
        Object.assign(columns, { transaction_uid: r.transactionUid });
      if (key === "debts")
        Object.assign(columns, {
          tax_type: r.taxType,
          credit: r.credit,
          confirmed: r.confirmed,
        });
      if (key === "obligations")
        Object.assign(columns, {
          tax_type: r.taxType,
          reporting_period: r.period,
          due_date: r.dueDate,
          estimated: r.estimated,
          status: r.status,
          kind: r.kind,
        });
      if (key === "declarations")
        Object.assign(columns, {
          tax_type: r.taxType,
          reporting_period: r.period,
          due_date: r.dueDate,
          status: r.status,
          submitted_at: timestamp(r.submittedAt),
        });
      if (key === "integrations")
        Object.assign(columns, {
          provider_name: r.name,
          state: r.state,
          capability: r.capability,
          last_success_at: timestamp(r.lastSuccessAt),
        });
      if (key === "notifications")
        Object.assign(columns, { event_key: r.eventKey, is_read: r.read });
      if (key === "reconciliations")
        Object.assign(columns, {
          receipt_uid: r.receiptUid,
          transaction_uid: r.transactionUid,
          note: r.note,
        });
      if (key === "logs")
        Object.assign(columns, {
          integration_uid: r.integrationUid,
          state: r.state,
          message: r.message,
        });
      const fields = Object.keys(columns);
      await c.execute(
        `INSERT INTO ${table} (${fields.join(",")}) VALUES (${fields.map(() => "?").join(",")}) ON DUPLICATE KEY UPDATE ${fields
          .filter((f) => !["uid", "business_uid"].includes(f))
          .map((f) => `${f}=VALUES(${f})`)
          .join(",")}`,
        Object.values(columns) as (string | number | boolean | Date | null)[],
      );
    }
  }
  await c.execute("DELETE FROM notification_preferences WHERE business_uid=?", [
    businessUid,
  ]);
  await c.execute(
    "INSERT INTO notification_preferences(uid,business_uid,payload) VALUES (?,?,?)",
    [randomUUID(), businessUid, JSON.stringify(d.preferences)],
  );
}
