import { expect, test } from "@playwright/test";

import { AUTH_FILE, TEST_USER } from "./constants";

// Signed in as the throwaway test user made in global-setup.ts.
test.use({ storageState: AUTH_FILE });

test.describe("signed in", () => {
  test("the dashboard greets you and the header shows the app's pages", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page.getByText(`Hi, ${TEST_USER.name}`)).toBeVisible();
    await expect(page.getByText("1 evidence repo")).toBeVisible();

    const nav = page.getByRole("navigation", { name: "Main" });
    for (const name of ["Dashboard", "New job", "Usage", "Credits"]) {
      await expect(nav.getByRole("link", { name })).toBeVisible();
    }
  });

  test("a job sent by the bookmarklet opens filled in, and leaves the address bar", async ({
    page,
  }) => {
    const job = {
      v: 1,
      url: "https://jobs.example.com/frontend-engineer",
      title: "Frontend Engineer",
      text: "Frontend Engineer at Example Co. You'll build our React and TypeScript web app. Must have 3+ years of React.",
    };
    await page.goto(`/jobs/import#${encodeURIComponent(JSON.stringify(job))}`);

    await expect(page).toHaveURL("/jobs/new?import=1");
    await expect(page.getByText("jobs.example.com")).toBeVisible();
    await expect(page.locator('input[name="url"]')).toHaveValue(job.url);
    await expect(page.locator('textarea[name="text"]')).toHaveValue(job.text);
    // The job text must not stay in the URL or browser history.
    expect(page.url()).not.toContain("#");
  });

  test("credits are labelled as a test-mode demo and start at zero", async ({
    page,
  }) => {
    await page.goto("/credits");
    await expect(page.getByText("Test mode – demo.")).toBeVisible();
    await expect(page.getByText("4242 4242 4242 4242")).toBeVisible();
    await expect(page.getByText("credits left")).toBeVisible();
    await expect(page.getByText("0", { exact: true }).first()).toBeVisible();

    await page.goto("/usage");
    await expect(
      page.getByText(/0 of 3 used in the last 24 hours/),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Buy credits (test mode)" }),
    ).toBeVisible();
  });
});
