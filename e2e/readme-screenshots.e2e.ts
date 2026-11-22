import { test } from "@playwright/test";

import { AUTH_FILE } from "./constants";

// Not a test: re-takes the README screenshots. Skipped in normal runs.
//   bun run screenshots
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to re-take them");

const OUT = "docs/screenshots";

test.use({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 });

// Hides the Next.js dev-mode badge so it isn't in the pictures.
const HIDE_DEV_BADGE = "nextjs-portal { display: none !important; }";

test("home page, light and dark", async ({ page }) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.addStyleTag({ content: HIDE_DEV_BADGE });
    // Just the hero: headline and the sample report.
    await page.screenshot({
      path: `${OUT}/home-${scheme}.png`,
      clip: { x: 0, y: 0, width: 1280, height: 680 },
    });
  }
});

test.describe("signed in", () => {
  test.use({ storageState: AUTH_FILE });

  test("credits and usage", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    for (const path of ["credits", "usage"]) {
      await page.goto(`/${path}`);
      await page.waitForLoadState("networkidle");
      await page.addStyleTag({ content: HIDE_DEV_BADGE });
      await page.screenshot({
        path: `${OUT}/${path}.png`,
        clip: { x: 0, y: 0, width: 1280, height: 640 },
      });
    }
  });
});
