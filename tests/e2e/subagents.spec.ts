import { test, expect } from "@playwright/test";
import { signSessionToken } from "../../src/lib/jwt";

const TARGET_ENGINE_ID =
  "projects/125188993477/locations/us-central1/reasoningEngines/6238058879222022144";

test.describe("Subagent Reasoning & Main Answer E2E", () => {
  test.setTimeout(180000); // 3 minutes for full LLM Council multi-agent execution

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

  test("llm-council streams subagent chunks into consolidated cards in thinking box and final answer in main response", async ({
    page,
  }, testInfo) => {
    page.on("console", (msg) => console.log("[BROWSER CONSOLE]", msg.type(), msg.text()));
    page.on("pageerror", (err) => console.log("[BROWSER ERROR]", err.message));
    page.on("requestfailed", (req) =>
      console.log("[REQUEST FAILED]", req.url(), req.failure()?.errorText)
    );

    // Ensure Subagent engine (6238058879222022144 - llm-council) is selected in localStorage
    await page.addInitScript(() => {
      window.localStorage.setItem("agent_runtime_active_agent_id", "6238058879222022144");
    });

    console.log("Navigating to home page with llm-council active...");
    await page.goto("/");

    // Wait for the UI to be fully hydrated
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible({ timeout: 20000 });

    const agentDropdown = page
      .locator("button[aria-label='Select active agent']")
      .first();
    await expect(agentDropdown).toBeVisible({ timeout: 10000 });
    console.log("Active agent button text:", await agentDropdown.textContent());

    // Locate composer prompt input
    const promptInput = page.locator("textarea, [contenteditable='true']").first();
    await expect(promptInput).toBeVisible({ timeout: 30000 });

    const promptText =
      "Create a comprehensive structure of a 45mins video explaining the history of AI. with key dates and info";
    console.log(`Submitting prompt: "${promptText}"`);
    await promptInput.fill(promptText);
    await page.waitForTimeout(500);

    // Click the send button (arrow up)
    console.log("Clicking Send button...");
    const sendBtn = page.locator("button:has(svg.lucide-arrow-up)").first();
    await expect(sendBtn).toBeEnabled({ timeout: 5000 });
    await sendBtn.click();

    // Wait for the thinking process box to appear
    console.log("Waiting for Thinking Process box...");
    const reasoningTrigger = page.locator("button:has-text('Thinking')").first();
    await expect(reasoningTrigger).toBeVisible({ timeout: 60000 });

    // Wait for reasoning and streaming to complete (wait for "Thinking Process" / "Reasoning complete" / prose response)
    console.log("Waiting for multi-agent council execution to complete...");
    await expect(page.locator("button:has-text('Thinking Process')").first()).toBeVisible(
      { timeout: 120000 }
    );

    // Wait for main assistant response prose to be visible with content
    const assistantProse = page.locator(".prose").last();
    await expect(assistantProse).toBeVisible({ timeout: 60000 });
    await expect(assistantProse).not.toBeEmpty({ timeout: 60000 });

    // Take screenshot of interactive stream result and attach to Playwright report
    const screenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach("llm-council-result", {
      body: screenshot,
      contentType: "image/png",
    });
    console.log("Attached interactive stream screenshot to report");

    // Open the Thinking Process accordion to inspect the subagent cards
    if (await reasoningTrigger.isVisible()) {
      const isExpanded = await reasoningTrigger.getAttribute("aria-expanded");
      if (isExpanded !== "true") {
        await reasoningTrigger.click();
        await page.waitForTimeout(500);
      }
    }

    // Locate all subagent collapsible cards in the thinking box
    const subagentCollapsibles = page.locator(
      "button:has-text('Council Member'), button:has-text('Reviewer'), button:has-text('Chairman'), button:has-text('Subagent')"
    );
    const subagentCount = await subagentCollapsibles.count();
    console.log("Subagent Collapsibles Count in DOM:", subagentCount);

    // Assert that we have a consolidated set of cards (e.g. Alpha, Beta, Gamma, Delta, Reviewer 1, Reviewer 2, Chairman)
    // and NOT 100+ cards (one per streaming chunk)
    expect(subagentCount).toBeGreaterThanOrEqual(2);
    expect(subagentCount).toBeLessThanOrEqual(15);

    // Expand the first subagent card and verify it contains accumulated text (multiple paragraphs/timeline dates)
    const firstSubagent = subagentCollapsibles.first();
    await firstSubagent.click();
    await page.waitForTimeout(500);

    const firstSubagentText = await page
      .locator("[data-state='open'] .prose, [data-state='open']")
      .first()
      .textContent();
    console.log("First subagent content snippet:", firstSubagentText?.slice(0, 200));

    // Verify subagent response has substantial accumulated content (> 50 chars), not a single word chunk
    expect((firstSubagentText || "").length).toBeGreaterThan(50);

    // Check main text content does not leak raw markdown syntax tags
    const proseText = (await assistantProse.textContent()) || "";
    console.log("Assistant Main Prose Content Snippet:\n", proseText.slice(0, 300));
    expect(proseText).not.toContain(":::subagent");
    expect(proseText.length).toBeGreaterThan(100);
  });
});
