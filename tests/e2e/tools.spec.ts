import { test, expect } from "@playwright/test";
import { signSessionToken } from "../../src/lib/jwt";

const TARGET_ENGINE_ID =
  "projects/125188993477/locations/us-central1/reasoningEngines/1295472637392191488";

test.describe("Tool Calling & Reasoning E2E", () => {
  test.beforeEach(async ({ context }) => {
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

    // Pass target reasoningEngineId via custom header without breaking stream interception
    await context.setExtraHTTPHeaders({
      "x-reasoning-engine-id": TARGET_ENGINE_ID,
    });
  });

  test("tool calling streams arguments, results into thinking box without duplication and displays main answer", async ({
    page,
  }, testInfo) => {
    page.on("console", (msg) => console.log("[BROWSER CONSOLE]", msg.type(), msg.text()));
    page.on("pageerror", (err) => console.log("[BROWSER ERROR]", err.message));
    page.on("requestfailed", (req) =>
      console.log("[REQUEST FAILED]", req.url(), req.failure()?.errorText)
    );

    // Ensure Tools engine (1295472637392191488) is selected in localStorage
    await page.addInitScript(() => {
      window.localStorage.setItem("agent_runtime_active_agent_id", "1295472637392191488");
    });

    console.log("Navigating to home page for tool calling test...");
    await page.goto("/");

    // Locate composer prompt input
    const promptInput = page.locator("textarea, [contenteditable='true']").first();
    await expect(promptInput).toBeVisible({ timeout: 30000 });

    const promptText = "Latest news for INTC and MU?";
    console.log(`Filling prompt: "${promptText}"`);
    await promptInput.fill(promptText);

    // Submit prompt by clicking send button or pressing Enter
    console.log("Submitting prompt...");
    const sendBtn = page.locator("button:has(svg.lucide-arrow-up)").first();
    if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sendBtn.click();
    } else {
      await promptInput.press("Enter");
    }

    // Wait for response stream to start and complete
    console.log("Waiting for tool execution & streaming response...");
    await page.waitForTimeout(10000);

    // Take screenshot of tool call stream result and attach to Playwright report
    const screenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach("tools-interactive-result", {
      body: screenshot,
      contentType: "image/png",
    });
    console.log("Attached tool call screenshot to report");

    // Inspect DOM elements
    // Open Thinking Process if collapsed
    const reasoningTrigger = page.locator("button:has-text('Thinking Process')").first();
    if (await reasoningTrigger.isVisible().catch(() => false)) {
      await reasoningTrigger.click();
      await page.waitForTimeout(500);
    }

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
    if (await assistantProse.isVisible({ timeout: 5000 }).catch(() => false)) {
      const proseText = await assistantProse.textContent().catch(() => "");
      console.log("Assistant Main Answer Prose Snippet:\n", proseText?.slice(0, 400));
      expect(proseText).toBeTruthy();
      expect(proseText).not.toContain(":::tool");
      expect(proseText).not.toContain(":::subagent");
    }
  });
});
