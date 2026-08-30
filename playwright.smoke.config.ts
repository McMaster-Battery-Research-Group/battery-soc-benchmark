import { defineConfig } from "@playwright/test";

/**
 * Render smoke test: catches what tsc/eslint cannot — client-side crashes (missing context
 * providers, hydration failures), 5xx pages, "Application error" screens. Run with `npm run smoke`
 * (builds first) or let the pre-push hook do it when UI files changed. Uses the production build
 * and the production env (read-only page loads; nothing is submitted or mutated).
 */
export default defineConfig({
  testDir: "tests/smoke",
  timeout: 60_000,
  retries: 0,
  workers: 2,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3105", viewport: { width: 1280, height: 900 } },
  webServer: {
    command: "npx next start -p 3105",
    url: "http://localhost:3105",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
