import { test, expect } from "@playwright/test";
import { signSessionToken } from "../../src/lib/jwt";

test.describe("ADK HITL & adk_request_confirmation E2E", () => {
  test.beforeEach(async ({ context }) => {
    const token = await signSessionToken({
      sub: "test-user",
      email: "test@example.com",
      name: "Test User",
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

  test("loads session 2648707499674304512 with adk_request_confirmation and allows user to approve", async ({
    page,
  }, testInfo) => {
    page.on("console", (msg) => console.log("[BROWSER CONSOLE]", msg.type(), msg.text()));
    page.on("pageerror", (err) => console.log("[BROWSER ERROR]", err.message));

    console.log("Navigating to home page for HITL session test...");
    await page.goto("/");

    // Wait for sidebar to render sessions
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // Switch to Generic Agent if available
    const agentDropdown = page
      .locator("button[aria-label='Select active agent']")
      .first();
    if (await agentDropdown.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log("Opening agent dropdown...");
      await agentDropdown.click();
      const genericAgentOption = page
        .locator(
          "[role='menuitem']:has-text('generic-agent'), [role='menuitem']:has-text('Generic Agent')"
        )
        .first();
      if (await genericAgentOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log("Selecting Generic Agent...");
        await genericAgentOption.click();
        await page.waitForTimeout(1500);
      } else {
        await page.keyboard.press("Escape");
      }
    }

    // Look for the Summarize session in the sidebar
    const summarizeSessionBtn = page
      .locator("aside button:has-text('Summarize'), aside button:has-text('yongzx')")
      .first();
    if (await summarizeSessionBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log("Clicking Summarize session in sidebar...");
      await summarizeSessionBtn.click();
    } else {
      console.log("Looking for first session button in sidebar...");
      const firstSession = page
        .locator("aside button:has(svg.lucide-message-square)")
        .first();
      if (await firstSession.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstSession.click();
      }
    }

    await page.waitForTimeout(1500);

    // Verify tool confirmation card is rendered
    console.log("Checking for Action Requires Approval confirmation card...");
    const toolHeader = page
      .locator(
        "text=Action Requires Approval, text=adk_request_confirmation, text=load_web_page"
      )
      .first();
    await expect(toolHeader).toBeVisible({ timeout: 10000 });

    // Verify Requires Approval badge
    const requiresApproval = page.locator("text=Requires Approval").first();
    await expect(requiresApproval).toBeVisible();

    // Verify Approve and Decline action buttons are present
    const approveBtn = page
      .locator("button[aria-label='Approve tool execution']")
      .first();
    const declineBtn = page
      .locator("button[aria-label='Decline tool execution']")
      .first();
    await expect(approveBtn).toBeVisible();
    await expect(declineBtn).toBeVisible();

    // Capture screenshot before approval
    const preScreenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach("hitl-loaded-session-pending", {
      body: preScreenshot,
      contentType: "image/png",
    });

    // Click Approve button
    console.log("Clicking Approve Action button...");
    await approveBtn.click();

    // Verify Approved state appears immediately
    await expect(page.locator("text=Approved by user").first()).toBeVisible({
      timeout: 5000,
    });

    // Wait for the resumed agent response stream to arrive with webpage summary
    console.log("Waiting for resumed agent execution stream with summary...");
    const assistantProse = page.locator(".prose").last();
    await expect(assistantProse).toBeVisible({ timeout: 30000 });

    // Verify the agent completed response text contains substantive content
    await page.waitForTimeout(4000);
    const proseText = (await assistantProse.textContent().catch(() => "")) || "";
    console.log("Resumed Agent Summary Response Text:", proseText);
    expect(proseText.length).toBeGreaterThan(20);

    // Capture screenshot after approval
    const postScreenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach("hitl-loaded-session-approved", {
      body: postScreenshot,
      contentType: "image/png",
    });
  });

  test("interactively streams adk_request_confirmation on critical prompt and processes user decision", async ({
    page,
  }, testInfo) => {
    await page.goto("/");

    // Click New chat if not already on empty thread
    const newChatBtn = page.locator("button:has-text('New chat')").first();
    if (await newChatBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newChatBtn.click();
      await page.waitForTimeout(500);
    }

    const promptInput = page.locator("textarea, [contenteditable='true']").first();
    await expect(promptInput).toBeVisible({ timeout: 15000 });

    const promptText = "Please confirm delete the staging database cluster";
    console.log(`Submitting critical prompt: "${promptText}"`);
    await promptInput.fill(promptText);

    const sendBtn = page.locator("button:has(svg.lucide-arrow-up)").first();
    if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sendBtn.click();
    } else {
      await promptInput.press("Enter");
    }

    // Wait for tool_call event to arrive and render HITL card
    console.log("Waiting for tool confirmation card to render...");
    const approveBtn = page
      .locator("button[aria-label='Approve tool execution']")
      .first();
    await expect(approveBtn).toBeVisible({ timeout: 15000 });

    const declineBtn = page
      .locator("button[aria-label='Decline tool execution']")
      .first();
    await expect(declineBtn).toBeVisible();

    const toolName = page.locator("text=adk_request_confirmation").first();
    await expect(toolName).toBeVisible();

    // Click Approve button
    console.log("Clicking Approve button on interactive tool call...");
    await approveBtn.click();

    // Verify Approved state and completion
    await expect(page.locator("text=Approved by user").first()).toBeVisible({
      timeout: 5000,
    });

    await page.waitForTimeout(3000);
    const postScreenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach("hitl-interactive-approved", {
      body: postScreenshot,
      contentType: "image/png",
    });
  });
});
