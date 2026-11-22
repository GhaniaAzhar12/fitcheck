import { execFileSync } from "node:child_process";

/** Creates the test user with a finished Set up, and a signed-in cookie. */
export default function globalSetup() {
  execFileSync("bun", ["e2e/test-user.ts", "setup"], { stdio: "inherit" });
}
