// Shared by the tests and the test-user script. No imports, so Playwright
// can load it without the app's server code.

export const TEST_USER = {
  id: "e2e-test-user",
  name: "E2E Tester",
  email: "e2e-tester@fitcheck.test",
} as const;

/** Where the signed-in browser state is saved for the tests to reuse. */
export const AUTH_FILE = "e2e/.auth/user.json";
