import { test, expect } from "@playwright/test";
import { signSessionToken } from "../../src/lib/jwt";

test.describe("ADK HITL Webpage Summarization E2E", () => {
  test.beforeEach(async ({ context }) => {
    // Authenticate with test user credentials
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

  test("connects to generic-agent, requests blog summary, approves load_web_page tool, and verifies summary output", async ({
    page,
  }, testInfo) => {
    page.on("console", (msg) => console.log("[BROWSER CONSOLE]", msg.type(), msg.text()));
    page.on("pageerror", (err) => console.log("[BROWSER ERROR]", err.message));

    // Ensure Generic Agent (3817127788905758720) is selected in localStorage
    await page.addInitScript(() => {
      window.localStorage.setItem("agent_runtime_active_agent_id", "3817127788905758720");
    });

    console.log("Navigating to home page with generic-agent active...");
    await page.goto("/");

    // Wait for the UI to be ready
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible({ timeout: 20000 });

    // Verify active agent displays generic-agent
    const agentDropdown = page
      .locator("button[aria-label='Select active agent']")
      .first();
    await expect(agentDropdown).toBeVisible({ timeout: 10000 });
    console.log("Active agent button text:", await agentDropdown.textContent());

    // Start a fresh new chat
    const newChatBtn = page.locator("button:has-text('New chat')").first();
    if (await newChatBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newChatBtn.click();
      await page.waitForTimeout(500);
    }

    // Type the user prompt: "Summarize https://yongzx.github.io/blog/2026/08/08/llm-can-jump"
    const promptInput = page.locator("textarea, [contenteditable='true']").first();
    await expect(promptInput).toBeVisible({ timeout: 15000 });

    const targetUrl = "https://yongzx.github.io/blog/2026/08/08/llm-can-jump";
    const promptText = `Please use the load_web_page tool to load and summarize ${targetUrl}`;
    console.log(`Submitting prompt: "${promptText}"`);
    await promptInput.fill(promptText);
    await promptInput.press("Enter");

    // Wait for the tool call stream to settle and the Approve button to be ready
    console.log("Waiting for tool confirmation card to render...");
    const approveBtn = page
      .locator("button[aria-label='Approve tool execution']")
      .first();

    const isApproveDirectlyVisible = await approveBtn
      .isVisible({ timeout: 20000 })
      .catch(() => false);

    if (!isApproveDirectlyVisible) {
      // If the agent responded with a natural language text confirmation request first
      const askingText = page
        .locator("text=/permission|require|would you like me to|confirm|proceed/i")
        .first();
      if (await askingText.isVisible({ timeout: 15000 }).catch(() => false)) {
        console.log(
          "Agent requested confirmation via text. Submitting affirmative response: 'Yes, please execute load_web_page now'"
        );
        await promptInput.click();
        await promptInput.fill("Yes, please execute load_web_page now");
        await promptInput.press("Enter");
      }
      await expect(approveBtn).toBeVisible({ timeout: 45000 });
    }

    // Wait a brief moment for the initial stream to finish closing
    await page.waitForTimeout(2000);

    const screenshotBefore = await page.screenshot({ fullPage: true });
    await testInfo.attach("before-approval", {
      body: screenshotBefore,
      contentType: "image/png",
    });

    // Click Approve
    console.log("Clicking Approve Action button...");
    await approveBtn.click();

    // Verify that the tool transitions to executed / approved state
    await expect(
      page.getByText(/approved by user|✓ Approved|Executed/i).first()
    ).toBeVisible({
      timeout: 10000,
    });

    // Wait for the resumed agent response stream containing the webpage summary
    console.log("Waiting for webpage summary from Vertex AI Reasoning Engine...");

    // Wait for the substantive summary text containing blog content (Einstein, Feynman, General Relativity, Zahavy)
    const summaryContent = page
      .locator(
        "text=/Feynman|Einstein|General Relativity|Zheng-Xin|Zahavy|abductive|deductive/i"
      )
      .last();
    await expect(summaryContent).toBeVisible({ timeout: 60000 });

    const allMainText = await page.textContent("main");
    console.log("\n==========================================");
    console.log("FULL CONVERSATION WITH RESUMED SUMMARY:");
    console.log("==========================================");
    console.log(allMainText);
    console.log("==========================================\n");

    const screenshotAfter = await page.screenshot({ fullPage: true });
    await testInfo.attach("after-approval-summary", {
      body: screenshotAfter,
      contentType: "image/png",
    });
  });
});
