import puppeteer, { type Page } from "puppeteer";
import { localDate } from "@biz/shared";
import { RsRequestError } from "./soap-transport.js";
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
let active = 0;
// Signs into eservices.rs.ge in a fresh, isolated headless browser, verifies
// the taxpayer identity on MainPage and runs `read` on the signed-in page.
// The browser and its cookies are always discarded afterwards.
export async function withPortalSession<T>(
  credentials: { username: string; password: string },
  taxpayerId: string,
  read: (page: Page) => Promise<T>,
): Promise<T> {
  if (active >= 2) throw new RsRequestError("RS_PORTAL_BUSY");
  active++;
  let browser;
  let signedIn: Page | undefined;
  try {
    browser = await puppeteer.launch({
      headless: true,
      ...(process.env.PUPPETEER_EXECUTABLE_PATH
        ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
        : process.platform === "win32"
          ? { channel: "chrome" as const }
          : {}),
    });
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    await page.goto("https://eservices.rs.ge/Login.aspx", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page
      .locator('#authorization input[type="text"]')
      .fill(credentials.username);
    await page
      .locator('#authorization input[type="password"]')
      .fill(credentials.password);
    try {
      await Promise.all([
        page.waitForNavigation({
          waitUntil: "domcontentloaded",
          timeout: 30000,
        }),
        page.locator("#btnLogin").click(),
      ]);
      if (new URL(page.url()).pathname !== "/MainPage.aspx")
        throw new Error("Login incomplete");
    } catch {
      throw new RsRequestError("RS_PORTAL_LOGIN_REQUIRED");
    }
    signedIn = page;
    // Never accept data from a different taxpayer's session.
    const identity = await page.$eval("body", (el) => el.innerText);
    if (!new RegExp(`(?<!\\d)${taxpayerId}(?!\\d)`).test(identity))
      throw new RsRequestError("RS_PORTAL_ID_MISMATCH");
    return await read(page);
  } catch (error) {
    if (error instanceof RsRequestError) throw error;
    throw new RsRequestError("RS_PORTAL_UNAVAILABLE");
  } finally {
    // Leaving a portal session open makes later logins for the same
    // account stall, so sign out before discarding the browser.
    if (signedIn) await logout(signedIn).catch(() => {});
    await browser?.close().catch(() => {});
    active--;
  }
}
async function logout(page: Page) {
  const hasLogout = () =>
    typeof (window as unknown as { handleLogout?: unknown }).handleLogout ===
    "function";
  if (!(await page.evaluate(hasLogout)))
    await page.goto("https://eservices.rs.ge/MainPage.aspx", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10000 }),
    page.evaluate(() =>
      (window as unknown as { handleLogout: () => void }).handleLogout(),
    ),
  ]);
}
export class RsPortalDebtClient {
  async getDebt(
    credentials: { username: string; password: string },
    taxpayerId: string,
  ): Promise<PortalDebt> {
    return withPortalSession(credentials, taxpayerId, async (page) => {
      // Awaited together so a timeout in either never goes unhandled.
      const [result] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.request().method() === "POST" &&
            new URL(r.url()).pathname ===
              "/WebServices/hsAccounting.ashx/GetBudgetAccountingInfo",
          { timeout: 45000 },
        ),
        page.goto("https://eservices.rs.ge/Accounting.aspx", {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        }),
      ]);
      if (!result.ok()) throw new RsRequestError("RS_PORTAL_UNAVAILABLE");
      return {
        ...parseBudgetAccounting(await result.json(), localDate()),
        source: "RS_PORTAL" as const,
        sourceUrl: "https://eservices.rs.ge/Accounting.aspx",
        checkedAt: new Date().toISOString(),
      };
    });
  }
}
