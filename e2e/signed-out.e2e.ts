import { expect, test } from "@playwright/test";

test.describe("signed out", () => {
  test("the home page explains Fitcheck and shows a sample report", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Find out if you fit the job before you apply.",
      }),
    ).toBeVisible();
    // The sample report shows proof with a source and an honest gap.
    await expect(
      page.getByText("A sample report for a made-up job."),
    ).toBeVisible();
    await expect(page.getByText("Nothing in your CV or repos")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in with GitHub" }).first(),
    ).toBeVisible();
  });

  test("private pages send you home, and sign-in goes to GitHub", async ({
    page,
  }) => {
    for (const path of ["/dashboard", "/credits", "/usage"]) {
      await page.goto(path);
      await expect(page).toHaveURL("/");
    }

    // Stop at GitHub's door: the test only checks where sign-in leads.
    await page.route("https://github.com/**", (route) => route.abort());
    // The button only works once React has loaded the page.
    await page.waitForLoadState("networkidle");
    const toGitHub = page.waitForRequest((r) =>
      r.url().startsWith("https://github.com/login/oauth/authorize"),
    );
    await page
      .getByRole("button", { name: "Sign in with GitHub" })
      .first()
      .click();
    const url = new URL((await toGitHub).url());
    expect(url.searchParams.get("client_id")).toBeTruthy();
    expect(url.searchParams.get("redirect_uri")).toContain(
      "/api/auth/callback/github",
    );
  });
});
