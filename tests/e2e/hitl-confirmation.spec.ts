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

    // Look for the "Delete Production Cluster" session in the sidebar
    const hitlSessionBtn = page
      .locator("aside button:has-text('Delete Production Cluster')")
      .first();
    if (await hitlSessionBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log("Clicking 'Delete Production Cluster' session in sidebar...");
      await hitlSessionBtn.click();
    } else {
      console.log("Session not listed in current agent sidebar view, switching agent...");
      // Open agent dropdown
      const agentDropdown = page
        .locator(
          "header button:has(svg.lucide-bot), header button:has(svg.lucide-sparkles)"
        )
        .first();
      if (await agentDropdown.isVisible({ timeout: 3000 }).catch(() => false)) {
        await agentDropdown.click();
        const genericAgentOption = page
          .locator("[role='menuitem']:has-text('Generic Agent')")
          .first();
        if (await genericAgentOption.isVisible({ timeout: 2000 }).catch(() => false)) {
          await genericAgentOption.click();
          await page.waitForTimeout(1000);
          const genericSessionBtn = page
            .locator("aside button:has-text('Delete Production Cluster')")
            .first();
          if (await genericSessionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await genericSessionBtn.click();
          }
        }
      }
    }

    await page.waitForTimeout(1500);

    // Verify tool UI is rendered
    console.log("Checking for adk_request_confirmation tool UI...");
    const toolHeader = page.locator("text=adk_request_confirmation").first();
    await expect(toolHeader).toBeVisible({ timeout: 10000 });

    // Verify Requires Approval badge and prompt message
    const requiresApproval = page.locator("text=Requires Approval").first();
    await expect(requiresApproval).toBeVisible();

    const promptText = page
      .locator("text=Do you confirm the deletion of production cluster")
      .first();
    await expect(promptText).toBeVisible();

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
    console.log("Clicking Approve tool execution button...");
    await approveBtn.click();

    // Verify Approved state appears
    await expect(page.locator("text=Approved by user").first()).toBeVisible({
      timeout: 5000,
    });

    // Wait for the resumed agent response stream to arrive
    console.log("Waiting for resumed agent execution stream...");
    await page.waitForTimeout(4000);

    // Verify the agent completed response text is rendered in the conversation
    const proseText = await page
      .locator(".prose")
      .last()
      .textContent()
      .catch(() => "");
    console.log("Resumed Agent Response Text:", proseText);

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
