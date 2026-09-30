import { defineConfig } from "vitest/config";

// Node environment: only the pure helpers in app/poker/logic.ts are unit
// tested (no DOM). Component behavior is covered by the manual e2e smoke.
export default defineConfig({
  test: { environment: "node" },
});
