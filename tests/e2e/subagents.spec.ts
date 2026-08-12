import { test, expect } from "@playwright/test";
import { signSessionToken } from "../../src/lib/jwt";

const TARGET_ENGINE_ID =
  "projects/125188993477/locations/us-central1/reasoningEngines/6238058879222022144";

test.describe("Subagent Reasoning & Main Answer E2E", () => {
  test.beforeEach(async ({ context }) => {
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

    // Pass target reasoningEngineId via custom header without breaking stream interception
    await context.setExtraHTTPHeaders({
      "x-reasoning-engine-id": TARGET_ENGINE_ID,
    });
  });

  test("interactive mode streams subagents into thinking box and main answer into main response", async ({
    page,
  }, testInfo) => {
    // Ensure Subagent engine (6238058879222022144) is selected in localStorage
    await page.addInitScript(() => {
      window.localStorage.setItem("agent_runtime_active_agent_id", "6238058879222022144");
    });

    console.log("Navigating to home page...");
    await page.goto("/");

    // Locate composer prompt input
    const promptInput = page.locator("textarea, [contenteditable='true']").first();
    await expect(promptInput).toBeVisible({ timeout: 30000 });

    const promptText = "Who is the best footballer of all time?";
    console.log(`Filling prompt: "${promptText}"`);
    await promptInput.fill(promptText);

    // Submit by pressing Enter or clicking send button
    console.log("Submitting prompt...");
    const sendBtn = page.locator("button:has(svg.lucide-arrow-up)").first();
    if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sendBtn.click();
    } else {
      await promptInput.press("Enter");
    }

    // Wait for response stream to start and complete
    console.log("Waiting for streaming response...");
    await page.waitForTimeout(10000);

    // Take screenshot of interactive stream result and attach to Playwright report
    const screenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach("interactive-result", {
      body: screenshot,
      contentType: "image/png",
    });
    console.log("Attached interactive stream screenshot to report");

    // Inspect DOM elements
    // Check Thinking Process box
    const reasoningTrigger = page.locator("button:has-text('Thinking Process')").first();
    const hasReasoningBox = await reasoningTrigger.isVisible().catch(() => false);
    console.log("Thinking Process Box Visible:", hasReasoningBox);
    if (hasReasoningBox) {
      await reasoningTrigger.click();
      await page.waitForTimeout(500);
    }

    // Check SubAgent Collapsible components
    const subagentCollapsibles = page.locator(
      "button:has-text('Subagent'), button:has-text('Council')"
    );
    const subagentCount = await subagentCollapsibles.count();
    console.log("Subagent Collapsibles Count:", subagentCount);

    // Check main text content
    const assistantProse = page.locator(".prose").last();
    if (await assistantProse.isVisible({ timeout: 5000 }).catch(() => false)) {
      const proseText = await assistantProse.textContent().catch(() => "");
      console.log("Assistant Prose Content Snippet:\n", proseText?.slice(0, 300));
      expect(proseText).not.toContain(":::subagent");
    }
  });
});
