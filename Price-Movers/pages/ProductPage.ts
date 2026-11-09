import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

/** Categories to choose from, in order of preference. Falls back to the first available one. */
const PREFERRED_CATEGORIES = ['Baked Goods', 'Meat', 'Fish', 'Seafood', 'Dairy Products'];

/** Page object for Products > View All Products and the Add Product form. */
export class ProductPage extends BasePage {

  // Navigation
  readonly productsMenu: Locator;
  readonly viewAllProductsLink: Locator;

  // Product list page
  readonly addProductButton: Locator;
  readonly searchInput: Locator;

  // Add Product form
  readonly heading: Locator;
  readonly nameToggle: Locator;
  readonly nameSearchInput: Locator;
  readonly sameForAllLocationsRadio: Locator;
  readonly categoryInput: Locator;
  readonly inventoriedCheckbox: Locator;
  readonly inventoriedLabel: Locator;
  readonly countByNicknameInput: Locator;
  readonly quantityInput: Locator;
  readonly unitSelect: Locator;
  readonly priceInput: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    super(page);
    this.productsMenu = page.getByRole('button', { name: 'Products', exact: true });
    this.viewAllProductsLink = page.getByRole('link', { name: 'View All Products' });

    this.addProductButton = page.getByRole('link', { name: 'Add Product' });
    this.searchInput = page.getByRole('textbox', { name: 'Search', exact: true });

    this.heading = page.getByRole('heading', { name: 'Add Product' });
    // The page holds several hidden copies of the Name dropdown; use the visible one
    this.nameToggle = page.locator('[aria-label="Select a product activate"]:visible');
    this.nameSearchInput = page.locator('input[aria-label="Select a product"]:visible');
    this.sameForAllLocationsRadio = page.getByRole('radiogroup').locator('input[type="radio"]').first();
    this.categoryInput = page.getByRole('textbox', { name: 'Select a category' });
    // A hidden copy exists inside #reassignModal; use the one in the main form
    this.inventoriedCheckbox = page.locator('#inventoriedProductLabel input[name="inventory"]');
    this.inventoriedLabel = page.locator('#inventoriedProductLabel');
    this.countByNicknameInput = page.getByRole('textbox', { name: 'Count-By Nickname' });
    this.quantityInput = page.getByRole('spinbutton', { name: 'Quantity' });
    this.unitSelect = page.locator('select:visible').filter({ has: page.locator('option', { hasText: 'Kilogram' }) });
    this.priceInput = page.getByRole('spinbutton').last();
    this.saveButton = page.getByRole('button', { name: /Save/ });
  }

  async openProductList() {
    await this.step('Go to Products > View All Products', async () => {
      await this.productsMenu.click();
      await this.viewAllProductsLink.click();
      await expect(this.page).toHaveURL(/#\/product$/);
      await expect(this.addProductButton).toBeVisible({ timeout: 30_000 });
    });
  }

  async clickAddProduct() {
    await this.step('Click Add Product button', async () => {
      await this.addProductButton.click();
      await expect(this.page).toHaveURL(/#\/product\/new/);
    });
    await this.step('Wait for Add Product page to load', async () => {
      await expect(this.heading).toBeVisible({ timeout: 60_000 });
      await expect(this.nameToggle).toBeVisible({ timeout: 30_000 });
      await this.page.waitForTimeout(5_000);
    });
  }

  async enterNewProductName(name: string) {
    await this.step(`Enter product name "${name}"`, async () => {
      await this.nameToggle.click();
      await this.nameSearchInput.pressSequentially(name, { delay: 30 });
    });
    await this.step(`Select "${name} (New Product)" from dropdown`, async () => {
      const option = this.page.getByRole('option', { name: `${name} (New Product)` });
      await expect(option).toBeVisible({ timeout: 15_000 });
      await option.click();
    });
  }

  async verifySameForAllLocations() {
    await this.step('Verify "Same for all locations" is selected', async () => {
      await expect(this.sameForAllLocationsRadio).toBeChecked();
    });
  }

  /** Picks the first available category from the preferred list (or any category). Returns its name. */
  /**
   * Selects the given category (case-insensitive match). If none is given, picks the first
   * available of PREFERRED_CATEGORIES. Fails with the list of available categories if not found.
   */
  async selectCategory(wanted?: string): Promise<string> {
    return await this.step(wanted ? `Select category "${wanted}"` : 'Select a category', async () => {
      await this.categoryInput.click();
      const options = this.page.getByRole('listbox').last().getByRole('option');
      await expect(options.first()).toBeVisible();
      const available = (await options.allInnerTexts()).map((t) => t.trim());
      let category: string | undefined;
      if (wanted) {
        category = available.find((c) => c.toLowerCase() === wanted.trim().toLowerCase());
        expect(category, `Category "${wanted}" not found. Available: ${available.join(', ')}`).toBeTruthy();
      } else {
        category = PREFERRED_CATEGORIES.find((c) => available.includes(c)) ?? available[0];
      }
      await this.page.getByRole('option', { name: category!, exact: true }).click();
      await expect(this.categoryInput).toHaveValue(category!);
      return category!;
    });
  }
  async checkInventoried() {
    await this.step('Check "Product should be inventoried"', async () => {
      if (!(await this.inventoriedCheckbox.isChecked())) {
        await this.inventoriedLabel.click();
      }
      await expect(this.inventoriedCheckbox).toBeChecked();
    });
  }

  async fillReportingUnit(nickname: string, quantity: string, unit: string) {
    await this.step(`Enter Count-By Nickname "${nickname}"`, async () => {
      await this.countByNicknameInput.fill(nickname);
    });
    await this.step(`Enter Quantity "${quantity}"`, async () => {
      await this.quantityInput.fill(quantity);
    });
    await this.step(`Select unit "${unit}"`, async () => {
      await this.unitSelect.selectOption({ label: unit });
    });
  }

  async enterPrice(price: string) {
    await this.step(`Enter price "${price}"`, async () => {
      await this.priceInput.fill(price);
    });
  }

  async save() {
    await this.step('Wait for Save to be enabled and click Save', async () => {
      await this.saveButton.scrollIntoViewIfNeeded();
      await expect(this.saveButton).toBeEnabled({ timeout: 15_000 });
      await this.saveButton.click();
    });
    await this.step('Verify redirected to Products page', async () => {
      await expect(this.page).toHaveURL(/#\/product(\/\d+)?\/?$/, { timeout: 30_000 });
    });
  }

  async searchAndVerifyProduct(name: string) {
    await this.step('Open product list', async () => {
      if (!/#\/product$/.test(this.page.url())) {
        await this.page.goto('/#/product', { waitUntil: 'domcontentloaded' });
      }
      await expect(this.searchInput).toBeVisible({ timeout: 60_000 });
    });
    await this.step(`Search products for "${name}"`, async () => {
      await this.searchInput.fill(name);
      await this.searchInput.press('Enter');
    });
    await this.step(`Verify "${name}" appears in the product list`, async () => {
      await expect(this.page.getByRole('cell', { name, exact: true })).toBeVisible({ timeout: 30_000 });
    });
  }
}
