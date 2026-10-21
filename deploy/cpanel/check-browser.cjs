(async () => {
  require("dotenv").config({ quiet: true });
  const puppeteer = await import("puppeteer");
  let browser;
  try {
    browser = await puppeteer.default.launch({
      headless: true,
      ...(process.env.PUPPETEER_EXECUTABLE_PATH
        ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
        : {}),
    });
    const page = await browser.newPage();
    await page.goto("about:blank");
    console.log("Chrome launch: OK");
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
