import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

/** Page object for Vendors > Vendor (list) and the New Vendor form. */
export class VendorPage extends BasePage {

  // Navigation
  readonly vendorsMenu: Locator;
  readonly vendorSubMenu: Locator;

  // Vendor list page
  readonly newVendorButton: Locator;
  readonly searchInput: Locator;

  // New Vendor form
  readonly vendorNameInput: Locator;
  readonly onlineOrderingCheckbox: Locator;
  readonly preferredOrderMethod: Locator;
  readonly orderEmailInput: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    super(page);
    this.vendorsMenu = page.getByRole('button', { name: 'Vendors', exact: true });
    this.vendorSubMenu = page.getByRole('link', { name: 'Vendor', exact: true });

    this.newVendorButton = page.getByRole('button', { name: /New Vendor/ });
    this.searchInput = page.getByRole('textbox', { name: 'Search', exact: true });

    // The form has two Vendor Name inputs (staff / non-staff variants); only one is visible
    this.vendorNameInput = page.locator('input[ng-model="vendor.name"]:visible');
    this.onlineOrderingCheckbox = page.getByText('Will you be placing orders via MarginEdge?');
    this.preferredOrderMethod = page
      .locator('select')
      .filter({ has: page.locator('option', { hasText: 'Integration (EDI)' }) });
    this.orderEmailInput = page.getByRole('textbox', { name: 'Email Address' });
    this.saveButton = page.locator('#vendorSaveBtn');
  }

  async openVendorList() {
    await this.step('Go to Vendors > Vendor', async () => {
      await this.vendorsMenu.click();
      await this.vendorSubMenu.click();
      await expect(this.page).toHaveURL(/#\/vendor$/);
      await expect(this.newVendorButton).toBeVisible({ timeout: 30_000 });
    });
  }

  async clickNewVendor() {
    await this.step('Click New Vendor button', async () => {
      await this.newVendorButton.click();
      await expect(this.page).toHaveURL(/#\/vendor\/new/);
    });
    await this.step('Wait 5 seconds for New Vendor page to load', async () => {
      await this.page.waitForTimeout(5_000);
      await expect(this.vendorNameInput).toBeVisible();
    });
  }

  async enterVendorName(name: string) {
    await this.step(`Enter Vendor Name "${name}"`, async () => {
      await this.vendorNameInput.fill(name);
    });
  }

  async enableEmailOrdering(email: string) {
    await this.step('Scroll to Ordering Configuration and check "Will you be placing orders via MarginEdge?"', async () => {
      await this.onlineOrderingCheckbox.scrollIntoViewIfNeeded();
      await this.onlineOrderingCheckbox.click();
      await expect(this.preferredOrderMethod).toBeVisible();
    });
    await this.step('Select Preferred Order Method "Email"', async () => {
      await this.preferredOrderMethod.selectOption({ label: 'Email' });
    });
    await this.step(`Enter order email "${email}"`, async () => {
      await this.orderEmailInput.fill(email);
    });
  }

  async save() {
    await this.step('Scroll to end of page and click Save', async () => {
      await this.saveButton.scrollIntoViewIfNeeded();
      await expect(this.saveButton).toBeEnabled();
      await this.saveButton.click();
    });
    await this.step('Handle "Managing a duplicate vendor" popup (if shown) — No, don\'t deactivate', async () => {
      const dialog = this.page.getByRole('dialog', { name: 'Managing a duplicate vendor' });
      const shown = await dialog
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      if (shown) {
        // Our test vendor is unique, so keep the central vendor active
        await dialog.getByRole('button', { name: "No, don't deactivate" }).click();
      }
    });
    await this.step('Verify redirected to Vendors page', async () => {
      await expect(this.page).toHaveURL(/#\/vendor$/, { timeout: 30_000 });
      await expect(this.searchInput).toBeVisible({ timeout: 30_000 });
    });
  }

  async searchAndVerifyVendor(name: string) {
    await this.step(`Search vendor list for "${name}"`, async () => {
      await this.searchInput.fill(name);
    });
    await this.step(`Verify "${name}" appears in the vendor list`, async () => {
      await expect(this.page.getByRole('gridcell', { name, exact: true })).toBeVisible({ timeout: 30_000 });
    });
  }
}
