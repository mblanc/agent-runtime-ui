import { test, expect } from "@playwright/test";
import { signSessionToken } from "../../src/lib/jwt";

test.describe("ADK Multimodal File & Image Upload E2E", () => {
  test.beforeEach(async ({ context }) => {
    // Authenticate with test user credentials
    const token = await signSessionToken({
      sub: "playwright-multimodal-test",
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

  test("uploads an image file, verifies single attachment chip in composer, verifies Part with gcsUri sent in /api/chat payload, and verifies generic-agent multimodal response", async ({
    page,
  }, testInfo) => {
    page.on("console", (msg) => console.log("[BROWSER CONSOLE]", msg.type(), msg.text()));
    page.on("pageerror", (err) => console.log("[BROWSER ERROR]", err.message));

    // Ensure Generic Agent (3817127788905758720) is selected in localStorage
    await page.addInitScript(() => {
      window.localStorage.setItem("agent_runtime_active_agent_id", "3817127788905758720");
    });

    // Intercept /api/chat requests to inspect the payload sent to backend
    let chatPayload: Record<string, unknown> | null = null;
    page.on("request", (req) => {
      if (req.url().includes("/api/chat") && req.method() === "POST") {
        try {
          chatPayload = JSON.parse(req.postData() || "{}");
          console.log(
            "[E2E INTERCEPT] /api/chat request body:",
            JSON.stringify(chatPayload, null, 2)
          );
        } catch {
          // ignore
        }
      }
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

    const promptInput = page.locator("textarea, [contenteditable='true']").first();
    await expect(promptInput).toBeVisible({ timeout: 15000 });

    // Create test image buffer (1x1 PNG)
    const testPngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const imageBuffer = Buffer.from(testPngBase64, "base64");
    const testFileName = "ocr_receipt_sample.png";

    console.log(`Uploading test image "${testFileName}" via Plus menu...`);

    // Open Plus menu and trigger file chooser
    const plusBtn = page.locator("button[aria-label='Add files and tools']").first();
    await expect(plusBtn).toBeVisible({ timeout: 10000 });

    const fileChooserPromise = page.waitForEvent("filechooser");
    await plusBtn.click();

    const addFilesOption = page.locator("text=Add photos & files").first();
    await expect(addFilesOption).toBeVisible({ timeout: 5000 });
    await addFilesOption.click();

    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: testFileName,
      mimeType: "image/png",
      buffer: imageBuffer,
    });

    console.log("File set via fileChooser, waiting for upload & attachment chip...");

    // Close any remaining open dropdown overlay
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // Verify that the attachment chip appears in composer
    const attachmentChip = page.locator(`span:has-text("${testFileName}")`).first();
    await expect(attachmentChip).toBeVisible({ timeout: 15000 });
    console.log("Attachment chip is visible in composer");

    // Wait a brief moment for presign and upload PUT to finalize
    await page.waitForTimeout(2000);

    // Verify that exactly 1 attachment chip exists (NO DUPLICATE CHIPS)
    const allAttachmentChips = page.locator("span:has-text('.png')");
    const chipCount = await allAttachmentChips.count();
    console.log("Total attachment chips count in composer:", chipCount);
    expect(chipCount).toBe(1);

    const screenshotBefore = await page.screenshot({ fullPage: true });
    await testInfo.attach("composer-with-single-attachment", {
      body: screenshotBefore,
      contentType: "image/png",
    });

    // Fill prompt asking to extract text / describe the image
    const promptText = "Extract the text from this image and describe what you see";
    console.log(`Submitting prompt: "${promptText}"`);
    await promptInput.click();
    await promptInput.fill(promptText);
    await page.waitForTimeout(500);

    // Submit prompt by pressing Enter
    await promptInput.press("Enter");

    // Wait for the /api/chat POST request to fire and verify its payload
    await expect.poll(() => chatPayload !== null, { timeout: 20000 }).toBe(true);

    const messages =
      (chatPayload as unknown as { messages?: Array<Record<string, unknown>> })
        ?.messages || [];
    expect(messages.length).toBeGreaterThanOrEqual(1);

    const userMessage = messages.find((m) => m.role === "user") || messages[0];
    expect(userMessage.role).toBe("user");

    const parts = (userMessage.parts as Array<Record<string, unknown>>) || [];
    console.log(
      "User message parts in /api/chat payload:",
      JSON.stringify(parts, null, 2)
    );

    expect(parts.length).toBeGreaterThanOrEqual(2);

    // 1. Verify text part
    const textPart = parts.find((p) => p.text);
    expect(textPart).toBeDefined();
    expect(textPart?.text).toBe(promptText);

    // 2. Verify file_data Part with gcsUri
    const fileDataPart = parts.find((p) => p.file_data || p.fileData);
    expect(fileDataPart).toBeDefined();

    const gcsUri =
      (fileDataPart?.file_data as { file_uri?: string })?.file_uri ||
      (fileDataPart?.fileData as { file_uri?: string; fileUri?: string })?.file_uri ||
      (fileDataPart?.fileData as { fileUri?: string })?.fileUri;

    console.log("Verified GCS URI in file_data part:", gcsUri);
    expect(gcsUri).toBeDefined();
    expect(gcsUri).toMatch(/^gs:\/\//);

    // 3. Wait for generic-agent to respond with multimodal inspection
    console.log("Waiting for generic-agent response...");
    await page.waitForTimeout(15000);

    const mainText = await page.textContent("main");
    console.log("\n==========================================");
    console.log("GENERIC AGENT MULTIMODAL RESPONSE:");
    console.log("==========================================");
    console.log(mainText);
    console.log("==========================================\n");

    // Verify agent does NOT return the text-only rejection refusal
    expect(mainText).not.toContain(
      'cannot directly "see" or process the content of an image'
    );
    expect(mainText).not.toContain("I don't have the capability to perform OCR");

    const screenshotAfter = await page.screenshot({ fullPage: true });
    await testInfo.attach("generic-agent-multimodal-response", {
      body: screenshotAfter,
      contentType: "image/png",
    });
  });
});
