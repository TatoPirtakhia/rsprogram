import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://localhost:8081",
    viewport: { width: 390, height: 844 },
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run demo -w @biz/api",
      url: "http://localhost:3001/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: "npm run web -w @biz/mobile -- --port 8081",
      url: "http://localhost:8081",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
