import { z } from "zod";
export type { RsEmployee, RsEmployeesResult } from "./employees.js";
export const moneySchema = z.string().regex(/^-?\d{1,16}\.\d{2}$/);
export type Money = z.infer<typeof moneySchema>;
export const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required").max(254),
  password: z.string().min(1, "Password is required").max(128),
});
export const querySchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    search: z.string().max(100).default(""),
    register: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    sort: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, "Invalid date range");
export type RecordQuery = z.infer<typeof querySchema>;
export type Capability =
  | "VERIFIED_AVAILABLE"
  | "REQUIRES_AUTHORIZATION"
  | "NOT_VERIFIED"
  | "UNSUPPORTED";
export type Source = "demo" | "import" | "live";
export interface Provenance {
  source: Source;
  sourceAt: string;
  syncedAt: string;
}
export interface Business {
  uid: string;
  name: string;
  taxId: string;
  taxProfile: string[];
  owner: string;
}
export interface CashRegister extends Provenance {
  uid: string;
  name: string;
  externalId: string;
  status: string;
}
export interface Receipt extends Provenance {
  uid: string;
  businessUid: string;
  externalId: string;
  registerUid: string;
  occurredAt: string;
  amount: Money;
  currency: "GEL";
  status: "sale" | "refund" | "void";
  paymentMethod: string | null;
}
export interface BankAccount extends Provenance {
  uid: string;
  bank: string;
  iban: string;
  balance: Money | null;
  currency: "GEL";
}
export interface BankTransaction extends Provenance {
  uid: string;
  businessUid: string;
  accountUid: string;
  externalId: string;
  occurredAt: string;
  amount: Money;
  currency: "GEL";
  description: string;
  category: string;
  direction: "incoming" | "outgoing";
}
export interface MerchantSettlement extends Provenance {
  uid: string;
  amount: Money;
  settledAt: string;
  transactionUid: string;
}
export interface TaxDebt extends Provenance {
  uid: string;
  taxType: string;
  amount: Money | null;
  credit: Money | null;
  confirmed: boolean;
}
export interface TaxObligation extends Provenance {
  uid: string;
  taxType: string;
  period: string;
  dueDate: string;
  amount: Money | null;
  estimated: boolean;
  status: "upcoming" | "overdue" | "completed";
  kind: "filing" | "payment";
}
export interface Declaration extends Provenance {
  uid: string;
  taxType: string;
  period: string;
  dueDate: string;
  status: "draft" | "submitted";
  submittedAt: string | null;
  amount: Money | null;
}
export interface IntegrationStatus {
  uid: string;
  name: string;
  source: Source;
  state: "connected" | "error" | "unsupported";
  capability: Capability;
  lastSuccessAt: string | null;
  message: string;
}
export interface Notice {
  uid: string;
  title: string;
  body: string;
  read: boolean;
  eventKey: string;
  createdAt: string;
}
export interface Reconciliation {
  uid: string;
  receiptUid: string;
  transactionUid: string;
  note: string;
  createdAt: string;
}
export interface Preferences {
  language: "ka" | "en";
  theme: "system" | "light" | "dark";
  reminders: number[];
  detailedNotifications: boolean;
  pushEnabled: boolean;
  salesChangePercent: number;
}
export const preferencesSchema = z.object({
  language: z.enum(["ka", "en"]),
  theme: z.enum(["system", "light", "dark"]),
  reminders: z
    .array(z.union([z.literal(7), z.literal(3), z.literal(1), z.literal(0)]))
    .max(4),
  detailedNotifications: z.boolean(),
  pushEnabled: z.boolean(),
  salesChangePercent: z.number().min(1).max(100),
});
export interface Dataset {
  business: Business;
  registers: CashRegister[];
  receipts: Receipt[];
  accounts: BankAccount[];
  transactions: BankTransaction[];
  settlements: MerchantSettlement[];
  debts: TaxDebt[];
  obligations: TaxObligation[];
  declarations: Declaration[];
  integrations: IntegrationStatus[];
  notifications: Notice[];
  reconciliations: Reconciliation[];
  preferences: Preferences;
  logs: {
    uid: string;
    integrationUid: string;
    at: string;
    state: string;
    message: string;
  }[];
}
export interface ApiResult<T> {
  data: T;
  error: null | { code: string; message: string };
  meta: {
    source: Source;
    updatedAt: string | null;
    integrationState: string;
    pagination?: { page: number; limit: number; total: number };
  };
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
export interface Dashboard {
  business: Business;
  sales: Money;
  receiptCount: number;
  refunds: Money;
  average: Money;
  bankIncoming: Money;
  bankOutgoing: Money;
  taxDebt: Money | null;
  nextObligation: TaxObligation | null;
  chart: { date: string; amount: Money }[];
  comparisons: { yesterday: Money; previous7Days: Money; previousMonth: Money };
  alerts: string[];
  updatedAt: string | null;
}
export const gel = (value: Money | null, language = "ka") =>
  value === null
    ? language === "ka"
      ? "მიუწვდომელია"
      : "Unavailable"
    : new Intl.NumberFormat(language === "ka" ? "ka-GE" : "en-GB", {
        style: "currency",
        currency: "GEL",
      }).format(Number(value));
const tbilisiFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tbilisi",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export const localDate = (date = new Date()) => tbilisiFormatter.format(date);
export function cents(amount: Money): bigint {
  const negative = amount.startsWith("-");
  const [whole, fraction] = amount.replace("-", "").split(".");
  const value = BigInt(whole) * 100n + BigInt(fraction);
  return negative ? -value : value;
}
export function decimal(value: bigint): Money {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}
