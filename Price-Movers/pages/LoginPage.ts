import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object for the MarginEdge login flow (two steps):
 *   1. Enter username -> Continue
 *   2. Enter password -> Continue
 * Each action is wrapped in test.step so it shows up live in the terminal
 * and in the HTML report.
 */
export class LoginPage extends BasePage {
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly continueButton: Locator;

  constructor(page: Page) {
    super(page);
    this.usernameInput = page.getByRole('textbox', { name: /username or email/i });
    this.passwordInput = page.locator('input[type="password"]');
    this.continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  }

  async goto(url: string) {
    await this.step(`Open testing branch: ${url}`, async () => {
      // Don't wait for the full 'load' event — the dev site can stall on slow assets.
      // The dev site sometimes hangs on first load, so retry a few times.
      for (let attempt = 1; ; attempt++) {
        try {
          await this.page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
          await expect(this.usernameInput).toBeVisible({ timeout: 60_000 });
          break;
        } catch (e) {
          if (attempt >= 3) throw e;
          console.log(`Site did not load (attempt ${attempt}/3) — retrying...`);
        }
      }
    });
  }

  async login(username: string, password: string) {
    await this.step(`Enter username "${username}"`, async () => {
      await this.usernameInput.fill(username);
    });
    await this.step('Click Continue (username)', async () => {
      await this.continueButton.click();
    });
    await this.step('Enter password', async () => {
      await this.passwordInput.fill(password);
    });
    await this.step('Click Continue (password)', async () => {
      await this.continueButton.click();
    });
  }

  /** Logged in once we're redirected back to the app and the login form is gone. */
  async expectLoggedIn(appUrl: string) {
    await this.step('Verify login successful', async () => {
      const appHost = new URL(appUrl).host;
      // Wait until we're back on the app AND the auth redirect (?code=...) has finished
      await this.page.waitForURL(
        (url) => url.host === appHost && !url.searchParams.has('code') && !url.hash.startsWith('#/auth'),
        { timeout: 60_000 },
      );
      await expect(this.passwordInput).toHaveCount(0);
      // Must actually be inside the app: the side menu is only shown to logged-in users.
      // (A wrong password can bounce back to the username step, which has no password box either.)
      await expect(this.usernameInput, 'Still on the login page — check username/password').toHaveCount(0, { timeout: 30_000 });
      await expect(this.page.locator('#navbar_order'), 'App menu not shown — login did not succeed').toBeVisible({ timeout: 60_000 });
    });
  }
}
