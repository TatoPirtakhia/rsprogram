(async () => {
  require("dotenv").config({ quiet: true });
  const puppeteer = await import("puppeteer");
  const token = process.env.BROWSERLESS_TOKEN;
  let browser;
  try {
    if (token) {
      const endpoint = new URL(
        process.env.BROWSERLESS_URL || "wss://production-sfo.browserless.io",
      );
      endpoint.searchParams.set("token", token);
      browser = await puppeteer.default.connect({
        browserWSEndpoint: endpoint.toString(),
      });
    } else {
      browser = await puppeteer.default.launch({
        headless: true,
        ...(process.env.PUPPETEER_EXECUTABLE_PATH
          ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
          : {}),
      });
    }
    const page = await browser.newPage();
    await page.goto("about:blank");
    console.log(token ? "Browserless connect: OK" : "Chrome launch: OK");
    await page.goto("https://eservices.rs.ge/Login.aspx", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    console.log("RS page: OK");
  } catch (error) {
    console.error("Browser/RS check failed:", error.message);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
})();
