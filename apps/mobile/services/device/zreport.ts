import { z } from "zod";
import { cents, decimal, localDate } from "@biz/shared";
import { soapRead, RsRequestError } from "./soap";
import type {
  RsZReportResponse,
  ZReport,
} from "../../features/rs-profiles/types";
export const RS_TAXPAYER_SERVICE =
  "https://services.rs.ge/taxservice/taxpayerservice.asmx";
export interface ZReportRange {
  from: string;
  to: string;
}
export const zReportRangeSchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine((v) => v.from <= v.to, "Invalid date range")
  .refine(
    (v) => Date.parse(v.to) - Date.parse(v.from) <= 365 * 86400000,
    "Date range exceeds 366 days",
  );
export function defaultReportRange(now = new Date()): ZReportRange {
  const to = localDate(now);
  return { from: to, to };
}
function money(value: unknown): string {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value))
    throw new RsRequestError("RS_INVALID_RESPONSE");
  const [whole, fraction = ""] = value.split(".");
  if (whole.length > 16 || /[1-9]/.test(fraction.slice(2)))
    throw new RsRequestError("RS_UNSUPPORTED_PRECISION");
  return `${BigInt(whole)}.${fraction.slice(0, 2).padEnd(2, "0")}`;
}
export class RsZReportClient {
  constructor(private transport: typeof fetch = fetch) {}
  async getProfileInformation(
    credentials: { username: string; password: string },
    range: ZReportRange = defaultReportRange(),
  ): Promise<RsZReportResponse> {
    const { from, to } = zReportRangeSchema.parse(range);
    const node = await soapRead(this.transport, {
      endpoint: RS_TAXPAYER_SERVICE,
      namespace: "services.rs.ge",
      operation: "Get_Z_Report_Details",
      parameters: {
        UserName: credentials.username,
        Password: credentials.password,
        StartDate: `${from}T00:00:00+04:00`,
        EndDate: `${to}T23:59:59.999+04:00`,
      },
    });
    const result = node?.Get_Z_Report_DetailsResult;
    if (!result || typeof result !== "object")
      throw new RsRequestError("RS_NO_DATA");
    const status = String(result.ResponseStatus ?? "").toLowerCase();
    if (!["true", "false", "1", "0"].includes(status))
      throw new RsRequestError("RS_INVALID_RESPONSE");
    const code = String(result.Error?.ErrorCode ?? "");
    const success = status === "true" || status === "1";
    if (!success && code !== "2")
      throw new RsRequestError(
        code === "1"
          ? "RS_INVALID_CREDENTIALS"
          : code === "0"
            ? "RS_REMOTE_SYSTEM_ERROR"
            : "RS_REMOTE_ERROR",
      );
    const raw = success ? result.ZreportDetailsData?.ZreportDetails : undefined;
    const rows =
      raw === undefined || raw === "" ? [] : Array.isArray(raw) ? raw : [raw];
    const reports: ZReport[] = [];
    const seen = new Map<string, string>();
    for (const row of rows) {
      const deviceNumber = String(row.DeviceNumber ?? "");
      const reportDate = String(row.ReportDate ?? "");
      const quantity = Number(row.Quantity);
      const zNumber = String(row.ZNumber ?? "");
      if (
        !deviceNumber ||
        deviceNumber.length > 191 ||
        !/^\d+$/.test(zNumber) ||
        !/^\d+$/.test(String(row.Quantity ?? "")) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(reportDate) ||
        !Number.isFinite(Date.parse(reportDate)) ||
        !Number.isSafeInteger(quantity) ||
        quantity < 0
      )
        throw new RsRequestError("RS_INVALID_RESPONSE");
      const normalizedDate = /Z$|[+-]\d{2}:\d{2}$/.test(reportDate)
        ? reportDate
        : reportDate + "+04:00";
      if (!z.iso.datetime({ offset: true }).safeParse(normalizedDate).success)
        throw new RsRequestError("RS_INVALID_RESPONSE");
      const report: ZReport = {
        deviceNumber,
        reportDate: normalizedDate,
        quantity,
        zNumber,
        paidAmount: money(row.PaidAmount),
        paidCash: money(row.PaidCash),
        paidOther: money(row.PaidOther),
      };
      const date = localDate(new Date(normalizedDate));
      if (date < from || date > to)
        throw new RsRequestError("RS_RESPONSE_OUT_OF_RANGE");
      const key = `${deviceNumber}:${zNumber}:${normalizedDate}`;
      const text = JSON.stringify(report);
      if (seen.has(key)) {
        if (seen.get(key) !== text)
          throw new RsRequestError("RS_CONFLICTING_RECORDS");
        continue;
      }
      seen.set(key, text);
      reports.push(report);
    }
    reports.sort((a, b) => b.reportDate.localeCompare(a.reportDate));
    const total = (field: "paidAmount" | "paidCash" | "paidOther") =>
      decimal(reports.reduce((sum, r) => sum + cents(r[field]), 0n));
    const daily = new Map<string, bigint>();
    for (const r of reports) {
      const date = localDate(new Date(r.reportDate));
      daily.set(date, (daily.get(date) ?? 0n) + cents(r.paidAmount));
    }
    const quantity = reports.reduce((sum, r) => sum + r.quantity, 0);
    if (!Number.isSafeInteger(quantity))
      throw new RsRequestError("RS_INVALID_RESPONSE");
    return {
      fetchedAt: new Date().toISOString(),
      operation: "Get_Z_Report_Details",
      from,
      to,
      outcome: reports.length ? "ok" : "no_records",
      reports,
      summary: {
        paidAmount: total("paidAmount"),
        paidCash: total("paidCash"),
        paidOther: total("paidOther"),
        quantity,
        registerCount: new Set(reports.map((r) => r.deviceNumber)).size,
        reportCount: reports.length,
      },
      chart: [...daily]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, amount]) => ({ date, amount: decimal(amount) })),
    };
  }
}
