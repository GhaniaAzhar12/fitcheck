import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against the running app. They need .env (database and
// auth secret) and sign in as a throwaway test user, never a real account.
// Run with `bun run e2e`; the dev server is started if it isn't running.

const PORT = 3005;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // One shared test user, so run in order.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bun run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
