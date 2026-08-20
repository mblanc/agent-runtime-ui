import { test, expect } from "@playwright/test";
import { signSessionToken } from "../../src/lib/jwt";

test.describe("A2UI Generative Micro-UIs E2E", () => {
  test.beforeEach(async ({ context }) => {
    const token = await signSessionToken({
      sub: "playwright-test",
      email: "playwright-test@example.com",
      name: "Playwright Test",
    });

    await context.addCookies([
      {
        name: "llm_session",
        value: token,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);
  });

  test("requests cluster dashboard, renders A2UI card & form, submits form action, and verifies resolution", async ({
    page,
  }) => {
    await page.goto("/");

    // Wait for chat interface to load
    const promptInput = page.locator("textarea, [contenteditable='true']").first();
    await expect(promptInput).toBeVisible({ timeout: 15000 });

    // Send prompt triggering mock A2UI micro-UI
    await promptInput.fill("Show cluster status with a2ui micro-ui");
    await promptInput.press("Enter");

    // Wait for the A2UI Card to render
    const cardTitle = page
      .locator("text=Google Cloud Agent Runtime - Cluster Status")
      .first();
    await expect(cardTitle).toBeVisible({ timeout: 15000 });

    // Verify A2UI StatMetric and Table components
    await expect(page.locator("text=Active Invocations").first()).toBeVisible();
    await expect(page.locator("text=2,840").first()).toBeVisible();
    await expect(page.locator("text=agent-runtime-gateway").first()).toBeVisible();

    // Fill form inputs
    const replicasInput = page.locator("input[name='targetReplicas']").first();
    await expect(replicasInput).toBeVisible();
    await replicasInput.fill("12");

    const strategySelect = page.locator("select[name='trafficStrategy']").first();
    await expect(strategySelect).toBeVisible();
    await strategySelect.selectOption("blue_green");

    // Submit form action
    const submitBtn = page.locator("button:has-text('Apply Cluster Scaling')").first();
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Verify user action chip rendered and agent responded with action confirmation
    await expect(page.locator("text=scale_cluster").first()).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.locator("text=Processed interactive A2UI action").first()
    ).toBeVisible({
      timeout: 15000,
    });
  });
});
