import { RsRequestError } from "./soap-transport.js";
import { months, withPortalSession } from "./rs-portal-debt-client.js";
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
export class RsPortalInboxClient {
  async getMessages(
    credentials: { username: string; password: string },
    taxpayerId: string,
  ): Promise<PortalMessage[]> {
    return withPortalSession(credentials, taxpayerId, async (page) => {
      // Awaited together so a timeout in either never goes unhandled.
      const [result] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.request().method() === "POST" &&
            new URL(r.url()).host === "eapi.rs.ge" &&
            new URL(r.url()).pathname === "/Notifications/GrdNotifications",
          { timeout: 45000 },
        ),
        page.goto("https://eservices.rs.ge/app/Notifications", {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        }),
      ]);
      if (!result.ok()) throw new RsRequestError("RS_PORTAL_UNAVAILABLE");
      return parsePortalMessages(await result.json());
    });
  }
}
