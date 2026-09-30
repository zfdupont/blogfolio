import { defineConfig } from "vitest/config";

// Node environment: only the pure helpers in app/**/*.test.ts are unit tested
// (no DOM). The include glob is restricted to app/ so Vitest does not pick up
// the Playwright specs under e2e/ (which use Playwright's own test runner).
export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.{ts,tsx}"],
  },
});
