import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

export interface PackagingOption {
  packaging: string;
  quantity: string;
  unit: string;
  price: string;
  ratio: string;
  orderGuide: 'Yes' | 'No';
}

export interface VendorItemData {
  vendorName: string;
  itemName: string;
  itemCode: string;
  productName: string;
  packaging: PackagingOption;
}

/** Page object for Vendors > Vendor Items and the "Add a new Vendor Item" form. */
export class VendorItemPage extends BasePage {
  // Navigation
  readonly vendorsMenu: Locator;
  readonly vendorItemsLink: Locator;

  // List page
  readonly addVendorItemButton: Locator;
  readonly searchInput: Locator;

  // Form
  readonly heading: Locator;
  readonly vendorToggle: Locator;
  readonly vendorSearchInput: Locator;
  readonly itemNameInput: Locator;
  readonly itemCodeInput: Locator;
  readonly productToggle: Locator;
  readonly productSearchInput: Locator;
  readonly addPackagingButton: Locator;
  readonly packagingRow: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    super(page);
    this.vendorsMenu = page.getByRole('button', { name: 'Vendors', exact: true });
    this.vendorItemsLink = page.getByRole('link', { name: 'Vendor Items', exact: true });

    this.addVendorItemButton = page.getByRole('button', { name: /Add a new Vendor Item/ });
    this.searchInput = page.getByRole('textbox', { name: 'Search', exact: true });

    this.heading = page.getByRole('heading', { name: 'Add a new Vendor Item' });
    this.vendorToggle = page.locator('[aria-label="Select a vendor activate"]:visible');
    this.vendorSearchInput = page.locator('input[aria-label="Select a vendor"]:visible');
    this.itemNameInput = page.getByRole('textbox', { name: 'Please enter a name for the Vendor Item' });
    this.itemCodeInput = page.getByRole('textbox', { name: 'Please create an item code for the Vendor Item' });
    this.productToggle = page.locator('[aria-label="Select a product activate"]:visible');
    this.productSearchInput = page.locator('input[aria-label="Select a product"]:visible');
    this.addPackagingButton = page.getByRole('button', { name: /Add Packaging Option/ });
    this.packagingRow = page.locator('.ui-grid-render-container-body .ui-grid-row').first();
    this.saveButton = page.getByRole('button', { name: /Save/ });
  }

  /** Packaging grid cell by column: 0 Packaging, 1 Quantity, 2 Unit, 3 Price, 4 Ratio, 5 Order Guide */
  private cell(index: number) {
    return this.packagingRow.locator('.ui-grid-cell').nth(index);
  }

  async openVendorItemList() {
    await this.step('Go to Vendors > Vendor Items', async () => {
      if (!(await this.vendorItemsLink.isVisible())) await this.vendorsMenu.click();
      await this.vendorItemsLink.click();
      await expect(this.page).toHaveURL(/#\/vendorProduct$/);
      await expect(this.addVendorItemButton).toBeVisible({ timeout: 30_000 });
    });
  }

  async clickAddVendorItem() {
    await this.step('Click "Add a new Vendor Item"', async () => {
      await this.addVendorItemButton.click();
      await expect(this.page).toHaveURL(/#\/vendorProduct\/new/);
    });
    await this.step('Wait for Add Vendor Item page to load', async () => {
      await expect(this.heading).toBeVisible({ timeout: 60_000 });
      await expect(this.vendorToggle).toBeVisible({ timeout: 30_000 });
      await this.page.waitForTimeout(3_000);
    });
  }

  async selectVendor(vendorName: string) {
    await this.step(`Select vendor "${vendorName}"`, async () => {
      await this.vendorToggle.click();
      await this.vendorSearchInput.pressSequentially(vendorName, { delay: 30 });
      const option = this.page.getByRole('option', { name: vendorName, exact: true });
      await expect(option).toBeVisible({ timeout: 15_000 });
      await option.click();
      await expect(this.vendorToggle).toContainText(vendorName);
    });
  }

  async enterNameAndCode(itemName: string, itemCode: string) {
    await this.step(`Enter Vendor Item Name "${itemName}"`, async () => {
      await this.itemNameInput.fill(itemName);
    });
    await this.step(`Enter Item Code "${itemCode}"`, async () => {
      await this.itemCodeInput.fill(itemCode);
    });
  }

  async selectProduct(productName: string) {
    await this.step(`Search and select product "${productName}"`, async () => {
      await this.productToggle.click();
      await this.productSearchInput.pressSequentially(productName, { delay: 30 });
      const option = this.page.getByRole('option', { name: productName, exact: true });
      await expect(option).toBeVisible({ timeout: 15_000 });
      await option.click();
      await expect(this.productToggle).toContainText(productName);
    });
  }

  /**
   * Text cells: select the cell and press a key — the grid opens its editor on keypress.
   * Keys typed while the editor is opening can be lost, so wait for the input and fill it.
   */
  private async typeInCell(index: number, value: string) {
    const cell = this.cell(index);
    await cell.click();
    await this.page.keyboard.type(value[0]);
    const input = cell.locator('input');
    await expect(input).toBeVisible();
    await input.fill(value);
    // Click outside the grid: the editor commits the value on blur and closes
    await this.heading.click();
    await expect(cell.locator('input')).toHaveCount(0);
  }

  /** Dropdown cells: double-click opens a <select>; choose and blur to commit. */
  private async selectInCell(index: number, label: string) {
    await this.cell(index).dblclick();
    const select = this.cell(index).locator('select');
    await expect(select).toBeVisible();
    await select.selectOption({ label });
    await select.evaluate((el) => (el as HTMLSelectElement).blur());
    await expect(this.cell(index)).toContainText(label);
  }

  async addPackagingOption(p: PackagingOption) {
    await this.step('Click "Add Packaging Option"', async () => {
      await this.addPackagingButton.click();
      await expect(this.packagingRow).toBeVisible();
    });
    await this.step(`Packaging: "${p.packaging}"`, () => this.typeInCell(0, p.packaging));
    await this.step(`Quantity: ${p.quantity}`, () => this.typeInCell(1, p.quantity));
    await this.step(`Unit: ${p.unit}`, () => this.selectInCell(2, p.unit));
    await this.step(`Price: ${p.price}`, () => this.typeInCell(3, p.price));
    await this.step(`Ratio: ${p.ratio}`, () => this.typeInCell(4, p.ratio));
    await this.step(`Order Guide: ${p.orderGuide}`, () => this.selectInCell(5, p.orderGuide));
    await this.step('Verify packaging row values', async () => {
      await expect(this.cell(0)).toHaveText(p.packaging);
      await expect(this.cell(1)).toHaveText(p.quantity);
      await expect(this.cell(2)).toHaveText(p.unit);
      await expect(this.cell(3)).toContainText(String(Number(p.price)));
      await expect(this.cell(4)).toHaveText(p.ratio);
      await expect(this.cell(5)).toHaveText(p.orderGuide);
    });
  }

  async save() {
    await this.step('Wait for Save to be enabled and click Save', async () => {
      await expect(this.saveButton).toBeEnabled({ timeout: 15_000 });
      await this.saveButton.click();
    });
    await this.step('Verify vendor item saved (left the Add page)', async () => {
      await expect(this.page).not.toHaveURL(/#\/vendorProduct\/new/, { timeout: 30_000 });
    });
  }

  /** Full create flow for one vendor item. */
  async createVendorItem(data: VendorItemData) {
    await this.openVendorItemList();
    await this.clickAddVendorItem();
    await this.selectVendor(data.vendorName);
    await this.enterNameAndCode(data.itemName, data.itemCode);
    await this.selectProduct(data.productName);
    await this.addPackagingOption(data.packaging);
    await this.save();
  }

  async searchAndVerifyVendorItem(itemName: string) {
    await this.openVendorItemList();
    await this.step(`Search vendor items for "${itemName}"`, async () => {
      await this.searchInput.fill(itemName);
    });
    await this.step(`Verify "${itemName}" appears in the vendor item list`, async () => {
      await expect(this.page.getByRole('gridcell', { name: itemName, exact: true })).toBeVisible({ timeout: 30_000 });
    });
  }
}
