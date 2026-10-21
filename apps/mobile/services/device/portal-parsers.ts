import { RsRequestError } from "./soap";
export interface PortalDebt {
  // Amount to pay now: current debt plus tax due in the next 30 days.
  total: string;
  // Current tax debt.
  balance: string;
  // Tax due in the next 30 days.
  upcoming?: string;
  asOf: string;
  checkedAt: string;
  source: "RS_PORTAL";
  sourceUrl: string;
}
export const months = [
  "იან",
  "თებ",
  "მარ",
  "აპრ",
  "მაი",
  "ივნ",
  "ივლ",
  "აგვ",
  "სექ",
  "ოქტ",
  "ნოე",
  "დეკ",
];
function money(value: unknown): string {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) >= 1e12 ||
    Math.abs(Math.round(value * 100) - value * 100) > 1e-6
  )
    throw new RsRequestError("RS_PORTAL_FORMAT_CHANGED");
  const fixed = (Math.round(value * 100) / 100).toFixed(2);
  return fixed === "-0.00" ? "0.00" : fixed;
}
// Parses hsAccounting.ashx/GetBudgetAccountingInfo, the data behind
// Accounting.aspx "საგადასახადო დავალიანება": Balance is the current debt,
// TotalDebt the tax due in the next 30 days and ToBePaid what has to be paid
// now including both. A negative amount to pay is never shown as debt.
export function parseBudgetAccounting(
  body: unknown,
  today: string,
): Omit<PortalDebt, "checkedAt" | "source" | "sourceUrl"> {
  const d = (body as { d?: Record<string, unknown> } | null)?.d;
  if (!d) throw new RsRequestError("RS_PORTAL_FORMAT_CHANGED");
  const toBePaid = money(d.ToBePaid);
  return {
    total: toBePaid.startsWith("-") ? "0.00" : toBePaid,
    balance: money(d.Balance),
    upcoming: money(d.TotalDebt),
    asOf: today,
  };
}

export interface PortalMessage {
  id: string;
  subject: string;
  sentAt: string;
  read: boolean;
  preview: string;
  text: string;
}
// "15-ოქტ-2026 10:05:45" (Tbilisi time) -> ISO timestamp.
export function parsePortalDate(value: string): string {
  const match = value.match(
    /^(\d{1,2})-([ა-ჰ]+)-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/,
  );
  const month = match ? months.indexOf(match[2]) : -1;
  if (!match || month < 0) throw new RsRequestError("RS_PORTAL_FORMAT_CHANGED");
  const [, day, , year, h, m, s] = match;
  const iso = `${year}-${String(month + 1).padStart(2, "0")}-${day.padStart(2, "0")}T${h}:${m}:${s}+04:00`;
  if (Number.isNaN(Date.parse(iso)))
    throw new RsRequestError("RS_PORTAL_FORMAT_CHANGED");
  return new Date(iso).toISOString();
}
// Notice HTML -> plain text, keeping paragraph and line breaks.
function plain(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 20000);
}
// Parses the eapi.rs.ge/Notifications/GrdNotifications JSON the portal's
// "შეტყობინებები" page loads.
export function parsePortalMessages(body: unknown): PortalMessage[] {
  const value = body as {
    STATUS?: { ID?: number };
    DATA?: { data?: { Rows?: Record<string, unknown>[] } };
  };
  const rows = value?.DATA?.data?.Rows;
  if (value?.STATUS?.ID !== 0 || !Array.isArray(rows))
    throw new RsRequestError("RS_PORTAL_FORMAT_CHANGED");
  return rows.map((row) => {
    const id = row.NOTIF_ID;
    if (
      typeof id !== "number" ||
      !Number.isInteger(id) ||
      typeof row.NOTIF_SUBJ !== "string" ||
      typeof row.NOTIF_DATE !== "string"
    )
      throw new RsRequestError("RS_PORTAL_FORMAT_CHANGED");
    const text =
      typeof row.NOTIF_TEXT === "string" ? plain(row.NOTIF_TEXT) : "";
    return {
      id: String(id),
      subject: row.NOTIF_SUBJ.trim(),
      sentAt: parsePortalDate(row.NOTIF_DATE),
      read: typeof row.READ_DATE === "string" && !!row.READ_DATE,
      preview: text.replace(/\s+/g, " ").slice(0, 160),
      text,
    };
  });
}
