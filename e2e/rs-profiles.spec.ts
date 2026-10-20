import { test, expect } from "@playwright/test";
import { localDate } from "@biz/shared";
test("opens local RS profiles directly, saves a short password and reopens persisted data", async ({
  page,
}) => {
  const username = `e2e-${Date.now()}`;
  const renderErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      message.text().includes("Unexpected text node")
    )
      renderErrors.push(message.text());
  });
  let uid = "";
  // Keep all test credentials local; simulate a verified-format Z-report at the browser boundary.
  let syncRequests = 0;
  const requested: { from: string; to: string }[] = [];
  const today = localDate();
  await page.route("**/api/v1/local/profiles/*/sync", async (route) => {
    syncRequests++;
    const period = route.request().postDataJSON();
    requested.push(period);
    const profileUrl = route
      .request()
      .url()
      .replace(/\/sync$/, "");
    const saved = await page.request.get(profileUrl);
    const result = await saved.json();
    await route.fulfill({
      json: {
        ...result,
        data: {
          ...result.data,
          connectionState: "received",
          errorCode: null,
          lastAttemptAt: new Date().toISOString(),
          lastSuccessAt: new Date().toISOString(),
          response: {
            operation: "Get_Z_Report_Details",
            fetchedAt: new Date().toISOString(),
            from: period.from,
            to: period.to,
            outcome: "ok",
            reports: [
              {
                deviceNumber: "TEST-REGISTER",
                reportDate: period.to + "T12:00:00+04:00",
                quantity: 3,
                zNumber: "1",
                paidAmount: "125.50",
                paidCash: "25.50",
                paidOther: "100.00",
              },
            ],
            summary: {
              paidAmount: "125.50",
              paidCash: "25.50",
              paidOther: "100.00",
              quantity: 3,
              registerCount: 1,
              reportCount: 1,
            },
            chart: [{ date: period.to, amount: "125.50" }],
          },
        },
      },
    });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/profiles/);
  await expect(
    page.getByText("აპში ცალკე ავტორიზაცია საჭირო არ არის.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "+ RS მომხმარებლის დამატება", exact: true })
    .click();
  await page.getByLabel("Profile name").fill("E2E local profile");
  await page.getByLabel("RS username").fill(username);
  await page.getByLabel("RS password").fill("1");
  await page.getByRole("button", { name: "შენახვა", exact: true }).click();
  await expect(page).toHaveURL(/rs-profile\//);
  uid = page.url().split("/").at(-1)!;
  try {
    await expect(
      page
        .getByText("E2E local profile", { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
    await expect.poll(() => syncRequests).toBeGreaterThan(0);
    expect(requested[0]).toEqual({ from: today, to: today });
    await expect(
      page.getByText("ფისკალური თანხა", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("3 ჩეკი · 1 სალარო · 1 Z-რეპორტი", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "RS-დან ინფორმაციის მიღება",
        exact: true,
      }),
    ).toBeVisible();
    const periodSelect = page.getByRole("combobox", { name: "სწრაფი პერიოდი" });
    await expect(periodSelect).toBeEnabled();
    await expect(periodSelect).toHaveValue("today");
    await page.screenshot({
      path: "artifacts/rs-profile-mobile.png",
      fullPage: true,
    });
    await periodSelect.selectOption("week");
    const weekStart = localDate(
      new Date(Date.parse(today + "T12:00:00+04:00") - 6 * 86400000),
    );
    await expect
      .poll(() => requested.at(-1))
      .toEqual({ from: weekStart, to: today });
    await expect(periodSelect).toBeEnabled();
    await periodSelect.selectOption("custom");
    await page.getByLabel("საწყისი თარიღი", { exact: true }).fill(weekStart);
    await page.getByLabel("საბოლოო თარიღი", { exact: true }).fill(weekStart);
    await page.screenshot({
      path: "artifacts/rs-profile-custom-dates.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "პერიოდის ჩვენება", exact: true })
      .click();
    await expect
      .poll(() => requested.at(-1))
      .toEqual({ from: weekStart, to: weekStart });
    await expect(periodSelect).toBeEnabled();
    await page.getByRole("button", { name: "‹ RS მომხმარებლების სია" }).click();
    const beforeReentry = syncRequests;
    await page.getByRole("button", { name: new RegExp(username) }).click();
    await expect.poll(() => syncRequests).toBeGreaterThan(beforeReentry);
    expect(requested.at(-1)).toEqual({ from: today, to: today });
    await expect(periodSelect).toHaveValue("today");
    await expect(periodSelect).toBeEnabled();
    const previousCount = syncRequests;
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(() => syncRequests).toBeGreaterThan(previousCount);
    expect(requested.at(-1)).toEqual({ from: today, to: today });
    await expect(periodSelect).toHaveValue("today");
    expect(renderErrors).toEqual([]);
    await page.getByRole("button", { name: "‹ RS მომხმარებლების სია" }).click();
    await expect(
      page.getByRole("button", { name: new RegExp(username) }),
    ).toBeVisible();
  } finally {
    if (uid)
      await page.request.delete(
        `http://localhost:3001/api/v1/local/profiles/${uid}`,
        { headers: { Origin: "http://localhost:8081" } },
      );
  }
});
