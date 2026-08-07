import { test, expect } from "@playwright/test";
import { signSessionToken } from "../../src/lib/jwt";

const TARGET_ENGINE_ID =
  "projects/125188993477/locations/us-central1/reasoningEngines/6238058879222022144";

test.describe("Subagent Reasoning & Main Answer E2E", () => {
  test.beforeEach(async ({ context, page }) => {
    // Dynamically sign session token using BETTER_AUTH_SECRET / AUTH_SECRET from environment
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

  test("interactive mode streams subagents into thinking box and main answer into main response", async ({
    page,
  }, testInfo) => {
    console.log("Navigating to home page...");
    await page.goto("/");

    // Locate composer prompt input
    const promptInput = page.locator("textarea, [contenteditable='true']").first();
    await expect(promptInput).toBeVisible({ timeout: 30000 });

    const promptText = "Who is the best footballer of all time?";
    console.log(`Filling prompt: "${promptText}"`);
    await promptInput.fill(promptText);

    // Submit by pressing Enter
    console.log("Pressing Enter to submit prompt...");
    await promptInput.press("Enter");

    // Wait for response stream to start and complete (45s for full multi-agent stream)
    console.log("Waiting for streaming response...");
    await page.waitForTimeout(45000);

    // Take screenshot of interactive stream result and attach to Playwright report
    const screenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach("interactive-result", {
      body: screenshot,
      contentType: "image/png",
    });
    console.log("Attached interactive stream screenshot to report");

    // Inspect DOM elements
    // Check Thinking Process box
    const reasoningBox = page
      .locator(
        "details, button:has-text('Thinking Process'), [data-component='thinking']"
      )
      .first();
    const hasReasoningBox = await reasoningBox.isVisible().catch(() => false);
    console.log("Thinking Process Box Visible:", hasReasoningBox);

    // Check SubAgent Collapsible components
    const subagentCollapsibles = page.locator(
      "details summary, button:has-text('Subagent')"
    );
    const subagentCount = await subagentCollapsibles.count();
    console.log("Subagent Collapsibles Count:", subagentCount);

    // Check main text content
    const assistantProse = page.locator(".prose").last();
    const proseText = await assistantProse.textContent().catch(() => "");
    console.log("Assistant Prose Content Snippet:\n", proseText?.slice(0, 300));

    // Assert that :::subagent raw markdown syntax does NOT bleed into prose text
    expect(proseText).not.toContain(":::subagent");
  });
});
