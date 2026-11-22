import { execFileSync } from "node:child_process";

/** Deletes the test user and everything it owns, and the saved cookie. */
export default function globalTeardown() {
  execFileSync("bun", ["e2e/test-user.ts", "teardown"], { stdio: "inherit" });
}
