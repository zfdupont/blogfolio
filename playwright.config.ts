import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:3000" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Same-origin API so the mocked routes below need no CORS/preflight, and
    // no running pokerbot-web service is required (CI-friendly).
    command: "NEXT_PUBLIC_POKER_API=http://127.0.0.1:3000 pnpm dev",
    url: "http://127.0.0.1:3000/poker",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
