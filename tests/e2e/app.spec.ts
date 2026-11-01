import { test, expect } from '@playwright/test';
import { prisma } from '../../src/common/database/prisma.js';

test.describe('SupportBot E2E Test Suite (Item 18)', () => {
  const testEmail = `test-e2e-${Date.now()}@example.com`;
  const testPassword = 'Password123!';

  async function ensureLoggedIn(page: any) {
    const tenant = await prisma.tenant.findUnique({ where: { email: testEmail } });
    if (!tenant) {
      await page.goto('/signup');
      await page.fill('#email', testEmail);
      await page.fill('#password', testPassword);
      await page.fill('#confirmPassword', testPassword);
      await page.click('#submitBtn');
      await page.waitForURL('**/dashboard', { timeout: 10000 });
    } else {
      await page.goto('/login');
      await page.fill('#email', testEmail);
      await page.fill('#password', testPassword);
      await page.click('#submitBtn');
      await page.waitForURL('**/dashboard', { timeout: 10000 });
    }

    // Activate the test tenant's subscription via direct Prisma update (Item 4)
    await prisma.tenant.updateMany({
      where: { email: testEmail },
      data: { subscriptionStatus: 'ACTIVE', widgetEnabled: true }
    });
  }

  test('Flow 1: Signup → Logout → Login → Dashboard Authentication Flow', async ({ page }) => {
    // 1. Visit signup page
    await page.goto('/signup');
    await expect(page).toHaveTitle(/Create Account/i);

    // 2. Complete signup form
    await page.fill('#email', testEmail);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.click('#submitBtn');

    // 3. Verify redirect to dashboard upon successful registration
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await expect(page.locator('#sidebarUserEmail')).toHaveText(testEmail, { timeout: 5000 });
    await expect(page.locator('#statusBadge')).toBeVisible();

    // 4. Log out using topbar logout button
    await page.click('#topbarSignOutBtn');
    await page.waitForURL('**/login', { timeout: 10000 });

    // 5. Sign back in via login page
    await page.fill('#email', testEmail);
    await page.fill('#password', testPassword);
    await page.click('#submitBtn');

    // 6. Verify successful login redirected back to dashboard
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await expect(page.locator('#sidebarUserEmail')).toHaveText(testEmail, { timeout: 5000 });
  });

  test('Flow 2: Telegram Credentials Configuration & Save Feedback', async ({ page }) => {
    // Log in or use active session
    await page.goto('/login');
    await page.fill('#email', testEmail);
    await page.fill('#password', testPassword);
    await page.click('#submitBtn');
    await page.waitForURL('**/dashboard', { timeout: 10000 });

    // Ensure Telegram tab is active
    await page.click('#tabTelegram');
    await expect(page.locator('#containerTelegram')).toBeVisible();

    // Fill Telegram Bot Token and Panel URL
    await page.fill('#botToken', '123456789:ABC_FakeTestTelegramBotToken');
    await page.fill('#panelApiUrl', 'https://demo-panel.com/api/v2');

    // Click Deploy & Activate Bot
    await page.click('#deployBtn');

    // Verify UI provides active user feedback (loading step text or alert response)
    const alertBox = page.locator('#alertBox');
    const deployBtn = page.locator('#deployBtn');

    // Either the button entered loading state or the alert displayed feedback
    await expect(async () => {
      const btnText = await deployBtn.textContent();
      const alertVisible = await alertBox.isVisible();
      expect(btnText?.includes('Verifying') || alertVisible).toBeTruthy();
    }).toPass({ timeout: 5000 });
  });

  test('Flow 3: Channel Tabs & WhatsApp QR / Pairing Code Mode Switcher', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', testEmail);
    await page.fill('#password', testPassword);
    await page.click('#submitBtn');
    await page.waitForURL('**/dashboard', { timeout: 10000 });

    // 1. Switch to WhatsApp Channel Tab
    await page.click('#tabWhatsApp');
    await expect(page.locator('#containerWhatsApp')).toBeVisible();
    await expect(page.locator('#containerTelegram')).toBeHidden();
    await expect(page.locator('#containerWidget')).toBeHidden();

    // 2. Switch to 8-Digit Pairing Code mode
    await page.click('#waModeBtnPairing');
    await expect(page.locator('#waPanelPairing')).toBeVisible();
    await expect(page.locator('#waPanelQr')).toBeHidden();

    // 3. Switch back to Live QR Code mode
    await page.click('#waModeBtnQr');
    await expect(page.locator('#waPanelQr')).toBeVisible();
    await expect(page.locator('#waPanelPairing')).toBeHidden();

    // 4. Return to Telegram tab
    await page.click('#tabTelegram');
    await expect(page.locator('#containerTelegram')).toBeVisible();
    await expect(page.locator('#containerWhatsApp')).toBeHidden();
  });

  test('Flow 4: Website Chat Widget Open, Close & Send Message Interaction', async ({ page }) => {
    await ensureLoggedIn(page);

    // Ensure tenant is active for widget testing
    await prisma.tenant.updateMany({
      where: { email: testEmail },
      data: { subscriptionStatus: 'ACTIVE', widgetEnabled: true }
    });

    // 1. Switch to Widget Settings Tab
    await page.click('#tabWidget');
    await expect(page.locator('#containerWidget')).toBeVisible();

    // 2. Click "Test Launch Live Widget"
    await page.click('#testLaunchWidgetBtn');

    // 3. Verify widget root is attached to DOM
    const widgetHost = page.locator('#smm-support-widget-root');
    await expect(widgetHost).toBeAttached({ timeout: 5000 });
    console.log('Step 3: widgetHost attached');

    // 4. Interact with widget inside Shadow DOM
    const launcher = widgetHost.locator('#smmLauncher');
    await expect(launcher).toBeVisible({ timeout: 5000 });
    console.log('Step 4: launcher visible');
    await launcher.click();
    console.log('Step 4: launcher clicked');

    // 5. Verify widget dialog is open
    const dialog = widgetHost.locator('#smmDialog');
    await expect(dialog).toHaveClass(/open/);
    console.log('Step 5: dialog has open class');

    // 6. Send a message
    const input = widgetHost.locator('#smmInput');
    const sendBtn = widgetHost.locator('#smmSendBtn');
    await input.fill('What are your Instagram rates?');
    await sendBtn.click({ force: true });
    console.log('Step 6: message sent');

    // 7. Verify message bubble is rendered in chat
    const userMsg = widgetHost.locator('.msg-bubble.user');
    await expect(userMsg.first()).toContainText('What are your Instagram rates?');
    console.log('Step 7: userMsg verified');

    // 8. Close widget dialog via close button
    const closeBtn = widgetHost.locator('#smmCloseBtn');
    await closeBtn.click({ force: true });
    console.log('Step 8: closeBtn clicked');
    await expect(dialog).not.toHaveClass(/open/);
    console.log('Step 9: dialog closed verified');
  });

  test('Flow 5: Runtime Logs Navigation, Live Stream Toggle & Filter Controls', async ({ page }) => {
    await ensureLoggedIn(page);

    // 1. Click sidebar Runtime Logs link
    await page.click('#navRuntimeLogs');
    await expect(page.locator('#viewRuntimeLogs')).toBeVisible();
    await expect(page.locator('#viewDeployment')).toBeHidden();
    await expect(page.locator('#topbarHeaderTitle')).toContainText('Runtime Logs');

    // 2. Verify telemetry terminal container & status elements
    await expect(page.locator('#logsTerminalBody')).toBeVisible();
    await expect(page.locator('#logStreamBadge')).toBeVisible();

    // 3. Test Pause / Resume live stream button
    const toggleStreamBtn = page.locator('#toggleLiveStreamBtn');
    await toggleStreamBtn.click();
    await expect(page.locator('#liveToggleText')).toContainText('Resume Stream');
    await expect(page.locator('#logStreamStatusText')).toContainText('STREAM PAUSED');

    await toggleStreamBtn.click();
    await expect(page.locator('#liveToggleText')).toContainText('Pause Stream');
    await expect(page.locator('#logStreamStatusText')).toContainText('LIVE STREAM');

    // 4. Test Channel Filter Chips
    await page.click('button[data-channel="telegram"]');
    await expect(page.locator('button[data-channel="telegram"]')).toHaveClass(/active/);
    await expect(page.locator('button[data-channel="all"]')).not.toHaveClass(/active/);

    // 5. Return to Bot Deployment view
    await page.click('#navDeployment');
    await expect(page.locator('#viewDeployment')).toBeVisible();
    await expect(page.locator('#viewRuntimeLogs')).toBeHidden();
    await expect(page.locator('#topbarHeaderTitle')).toContainText('Control Panel');
  });
});

