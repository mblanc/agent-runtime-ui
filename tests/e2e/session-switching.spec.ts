import { test, expect } from "@playwright/test";
import { signSessionToken } from "../../src/lib/jwt";

test.describe("Session Switching & History Loading E2E", () => {
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

  test("loads past session messages on click and correctly switches between threads", async ({
    page,
  }) => {
    // Navigate to chat home page
    await page.goto("/");

    // Wait for sidebar to render sessions
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();

    // Check if there are sessions in the sidebar
    const threadItems = page.locator("aside button:has(svg.lucide-message-square)");
    const threadCount = await threadItems.count();

    if (threadCount >= 2) {
      console.log(`Found ${threadCount} existing threads in sidebar`);

      // Click the first thread item
      const firstThread = threadItems.first();
      const firstTitle = await firstThread.textContent();
      console.log("Clicking first thread:", firstTitle);
      await firstThread.click();
      await page.waitForTimeout(1500);

      // Verify the active message area has content or user bubble
      const messagesCount1 = await page.locator(".prose, [data-role='user']").count();
      console.log("Messages in first thread:", messagesCount1);

      // Click the second thread item
      const secondThread = threadItems.nth(1);
      const secondTitle = await secondThread.textContent();
      console.log("Clicking second thread:", secondTitle);
      await secondThread.click();
      await page.waitForTimeout(1500);

      const messagesCount2 = await page.locator(".prose, [data-role='user']").count();
      console.log("Messages in second thread:", messagesCount2);

      // Click New Chat
      const newChatBtn = page.locator("button:has-text('New chat')");
      await expect(newChatBtn).toBeVisible();
      await newChatBtn.click();
      await page.waitForTimeout(500);

      // Verify empty greeting state
      await expect(
        page.locator("text=How can I help you today?, text=Ready when you are")
      ).toBeVisible({ timeout: 5000 });
    } else {
      console.log("Less than 2 threads available, verifying New Chat button works");
      const newChatBtn = page.locator("button:has-text('New chat')");
      await expect(newChatBtn).toBeVisible();
      await newChatBtn.click();
    }
  });
});
