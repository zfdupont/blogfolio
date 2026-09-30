import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Dedicated port AND build dir so a running `pnpm dev` on :3000 is never
    // reused or corrupted. Same-origin API so the mocked routes need no
    // CORS/preflight and no running pokerbot-web service is required.
    command: `PORT=${PORT} NEXT_DIST_DIR=.next-e2e NEXT_PUBLIC_POKER_API=http://127.0.0.1:${PORT} pnpm dev`,
    url: `http://127.0.0.1:${PORT}/poker`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
