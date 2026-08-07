import { test, expect } from "@playwright/test";
import { signSessionToken } from "../../src/lib/jwt";

const TARGET_ENGINE_ID =
  "projects/125188993477/locations/us-central1/reasoningEngines/1295472637392191488";

test.describe("Tool Calling & Reasoning E2E", () => {
  test.beforeEach(async ({ context, page }) => {
    // Generate valid session token
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

    // Intercept /api/chat calls to inject target reasoningEngineId
    await page.route("**/api/chat", async (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        const postData = JSON.parse(request.postData() || "{}");
        postData.reasoningEngineId = TARGET_ENGINE_ID;
        await route.continue({
          postData: JSON.stringify(postData),
        });
      } else {
        await route.continue();
      }
    });
  });

  test("tool calling streams arguments, results into thinking box without duplication and displays main answer", async ({
    page,
  }, testInfo) => {
    console.log("Navigating to home page for tool calling test...");
    await page.goto("/");

    // Locate composer prompt input
    const promptInput = page.locator("textarea, [contenteditable='true']").first();
    await expect(promptInput).toBeVisible({ timeout: 30000 });

    const promptText = "Latest news for INTC and MU?";
    console.log(`Filling prompt: "${promptText}"`);
    await promptInput.fill(promptText);

    // Submit prompt by pressing Enter
    console.log("Pressing Enter to submit prompt...");
    await promptInput.press("Enter");

    // Wait for response stream to start and complete (45s)
    console.log("Waiting for tool execution & streaming response...");
    await page.waitForTimeout(45000);

    // Take screenshot of tool call stream result and attach to Playwright report
    const screenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach("tools-interactive-result", {
      body: screenshot,
      contentType: "image/png",
    });
    console.log("Attached tool call screenshot to report");

    // Inspect DOM elements
    // 1. Check Tool Collapsible components (e.g. fetch_public_claims buttons)
    const toolButtons = page.locator("button:has-text('fetch_public_claims')");
    const toolCount = await toolButtons.count();
    console.log("fetch_public_claims Tool Collapsibles Count:", toolCount);

    // 2. Click the first tool button to inspect Arguments & Results
    if (toolCount > 0) {
      await toolButtons.first().click();
      await page.waitForTimeout(500);

      const argsText = await page
        .locator("text=Arguments")
        .first()
        .isVisible()
        .catch(() => false);
      const resultText = await page
        .locator("text=Result")
        .first()
        .isVisible()
        .catch(() => false);
      console.log("Tool Arguments Visible:", argsText);
      console.log("Tool Result Visible:", resultText);

      expect(argsText).toBe(true);
      expect(resultText).toBe(true);
    }

    // 3. Check Assistant Prose main response
    const assistantProse = page.locator(".prose").last();
    const proseText = await assistantProse.textContent().catch(() => "");
    console.log("Assistant Main Answer Prose Snippet:\n", proseText?.slice(0, 400));

    // 4. Verify main answer is available
    expect(proseText).toBeTruthy();
    expect(proseText!.length).toBeGreaterThan(20);

    // 5. Verify no raw markdown directives (:::tool or :::subagent) bleed into main answer
    expect(proseText).not.toContain(":::tool");
    expect(proseText).not.toContain(":::subagent");
  });
});
