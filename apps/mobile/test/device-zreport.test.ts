import { describe, it, expect, vi } from "vitest";
import {
  RsZReportClient,
  RS_TAXPAYER_SERVICE,
  zReportRangeSchema,
  defaultReportRange,
} from "../services/device/zreport";
const wrap = (inner: string, prefix = "s") =>
  `<${prefix}:Envelope xmlns:${prefix}="http://schemas.xmlsoap.org/soap/envelope/"><${prefix}:Body><Get_Z_Report_DetailsResponse xmlns="services.rs.ge"><Get_Z_Report_DetailsResult>${inner}</Get_Z_Report_DetailsResult></Get_Z_Report_DetailsResponse></${prefix}:Body></${prefix}:Envelope>`;
const row = (amount = "125.50") =>
  `<ZreportDetails><DeviceNumber>REG-1</DeviceNumber><ReportDate>2026-10-20T14:30:00</ReportDate><Quantity>3</Quantity><PaidAmount>${amount}</PaidAmount><PaidCash>25.50</PaidCash><PaidOther>100.00</PaidOther><ZNumber>14</ZNumber></ZreportDetails>`;
const range = { from: "2026-10-20", to: "2026-10-20" };
describe("verified Z-report service", () => {
  it("defaults to the current Tbilisi day across UTC midnight", () => {
    expect(defaultReportRange(new Date("2026-10-20T21:30:00Z"))).toEqual({
      from: "2026-10-21",
      to: "2026-10-21",
    });
  });
  it("uses the taxpayer endpoint and documented credential/date parameter names", async () => {
    const transport = vi.fn(
      async () =>
        new Response(
          wrap(
            `<ResponseStatus>true</ResponseStatus><ZreportDetailsData>${row()}${row()}</ZreportDetailsData>`,
          ),
          { status: 200 },
        ),
    );
    const value = await new RsZReportClient(
      transport as typeof fetch,
    ).getProfileInformation({ username: "owner<&", password: "x<&" }, range);
    const request = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(request[0]).toBe(RS_TAXPAYER_SERVICE);
    expect(request[1].headers).toMatchObject({
      SOAPAction: '"services.rs.ge/Get_Z_Report_Details"',
    });
    expect(request[1].body).toContain(
      '<Get_Z_Report_Details xmlns="services.rs.ge">',
    );
    expect(request[1].body).toContain("<UserName>owner&lt;&amp;</UserName>");
    expect(request[1].body).toContain("<Password>x&lt;&amp;</Password>");
    expect(request[1].body).toContain(
      "<StartDate>2026-10-20T00:00:00+04:00</StartDate>",
    );
    expect(request[1].body).toContain(
      "<EndDate>2026-10-20T23:59:59.999+04:00</EndDate>",
    );
    expect(value.reports).toHaveLength(1);
    expect(value.summary).toMatchObject({
      paidAmount: "125.50",
      paidCash: "25.50",
      paidOther: "100.00",
      quantity: 3,
      registerCount: 1,
    });
    expect(value.reports[0].reportDate.endsWith("+04:00")).toBe(true);
  });
  it.each([
    ["0", "RS_REMOTE_SYSTEM_ERROR"],
    ["1", "RS_INVALID_CREDENTIALS"],
    ["9", "RS_REMOTE_ERROR"],
  ])("maps provider error %s without echoing secrets", async (code, error) => {
    const client = new RsZReportClient(
      vi.fn(
        async () =>
          new Response(
            wrap(
              `<ResponseStatus>false</ResponseStatus><Error><ErrorCode>${code}</ErrorCode><ErrorDescription>private source description</ErrorDescription></Error>`,
            ),
            { status: 200 },
          ),
      ) as typeof fetch,
    );
    await expect(
      client.getProfileInformation({ username: "u", password: "p" }, range),
    ).rejects.toMatchObject({ code: error, message: error });
  });
  it("treats error 2 as no records, never a tax debt result", async () => {
    const client = new RsZReportClient(
      vi.fn(
        async () =>
          new Response(
            wrap(
              "<ResponseStatus>false</ResponseStatus><Error><ErrorCode>2</ErrorCode></Error>",
            ),
            { status: 200 },
          ),
      ) as typeof fetch,
    );
    const result = await client.getProfileInformation(
      { username: "u", password: "p" },
      range,
    );
    expect(result.outcome).toBe("no_records");
    expect(result.reports).toEqual([]);
    expect(result).not.toHaveProperty("taxDebt");
  });
  it("preserves exact decimals above JS integer precision", async () => {
    const client = new RsZReportClient(
      vi.fn(
        async () =>
          new Response(
            wrap(
              `<ResponseStatus>true</ResponseStatus><ZreportDetailsData>${row("90071992547409.91")}</ZreportDetailsData>`,
            ),
            { status: 200 },
          ),
      ) as typeof fetch,
    );
    const result = await client.getProfileInformation(
      { username: "u", password: "p" },
      range,
    );
    expect(result.summary.paidAmount).toBe("90071992547409.91");
  });
  it("rejects conflicting duplicate reports instead of adding both", async () => {
    const client = new RsZReportClient(
      vi.fn(
        async () =>
          new Response(
            wrap(
              `<ResponseStatus>true</ResponseStatus><ZreportDetailsData>${row("125.50")}${row("126.50")}</ZreportDetailsData>`,
            ),
            { status: 200 },
          ),
      ) as typeof fetch,
    );
    await expect(
      client.getProfileInformation({ username: "u", password: "p" }, range),
    ).rejects.toMatchObject({ code: "RS_CONFLICTING_RECORDS" });
  });
  it("validates dates and rejects unsupported monetary precision", async () => {
    expect(
      zReportRangeSchema.safeParse({ from: "2026-10-21", to: "2026-10-20" })
        .success,
    ).toBe(false);
    const client = new RsZReportClient(
      vi.fn(
        async () =>
          new Response(
            wrap(
              `<ResponseStatus>true</ResponseStatus><ZreportDetailsData>${row("125.501")}</ZreportDetailsData>`,
            ),
            { status: 200 },
          ),
      ) as typeof fetch,
    );
    await expect(
      client.getProfileInformation({ username: "u", password: "p" }, range),
    ).rejects.toMatchObject({ code: "RS_UNSUPPORTED_PRECISION" });
  });
});
