import path from 'path';
import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

export const SAMPLE_INVOICE_IMAGE = path.resolve(__dirname, '..', 'test-data', 'sample-invoice.png');

export interface InitialReviewData {
  invoiceNumber: string;
  /** MM-DD-YYYY */
  invoiceDate: string;
  verifiedTotal: string;
}

export interface ReconcileData {
  invoiceNumber: string;
  /** MM-DD-YYYY */
  invoiceDate: string;
  vendorItemName: string;
  newPrice: string;
}

/** Page object for placing an order and taking it through preprocessing and Initial Review. */
export class OrderPage extends BasePage {
  readonly ordersMenu: Locator;
  readonly placeNewOrderLink: Locator;

  // Place a new Order
  readonly placeOrderHeading: Locator;
  readonly vendorToggle: Locator;
  readonly vendorSearchInput: Locator;
  readonly estimatedTotal: Locator;
  readonly sendButton: Locator;

  // Order pages
  readonly addPhotoButton: Locator;
  readonly endPreprocessingButton: Locator;

  // Initial Review
  readonly initialReviewHeading: Locator;
  readonly invoiceNumberInput: Locator;
  readonly invoiceDateInput: Locator;
  readonly noAddressCheckbox: Locator;
  readonly noAddressLabel: Locator;
  readonly noPhoneCheckbox: Locator;
  readonly noPhoneLabel: Locator;
  readonly verifiedTotalInput: Locator;
  readonly handwritingSelect: Locator;
  readonly reviewCompleteCheckbox: Locator;
  readonly reviewCompleteLabel: Locator;
  readonly saveButton: Locator;

  // Reconciliation + Final Review
  readonly reconcileCompleteCheckbox: Locator;
  readonly reconcileCompleteLabel: Locator;
  readonly finalReviewLabel: Locator;
  readonly finalReviewCheckbox: Locator;

  constructor(page: Page) {
    super(page);
    this.ordersMenu = page.locator('#navbar_order');
    this.placeNewOrderLink = page.locator('#placeOrder');

    this.placeOrderHeading = page.getByRole('heading', { name: /Place a new Order/ });
    this.vendorToggle = page.locator('[aria-label="Select a vendor activate"]:visible');
    this.vendorSearchInput = page.locator('input[aria-label="Select a vendor"]:visible');
    this.estimatedTotal = page.getByText('Estimated Total Price').locator('xpath=following::p[1]');
    this.sendButton = page.getByRole('button', { name: /Send/ });

    this.addPhotoButton = page.locator('a[ngf-select]').filter({ hasText: 'Add Photo' });
    this.endPreprocessingButton = page.getByRole('button', { name: /End Preprocessing/ });

    this.initialReviewHeading = page.getByRole('heading', { name: /Initial Review/ });
    this.invoiceNumberInput = page.locator('input[name="invoiceNum"]:visible');
    // Reconcile has several invoiceDate inputs (original/posting) — only one is visible
    this.invoiceDateInput = page.locator('input[name="invoiceDate"]:visible');
    this.noAddressCheckbox = page.locator('input[name="noInfoPresent"]');
    this.noAddressLabel = page.locator('label#noInfoPresent');
    this.noPhoneCheckbox = page.locator('input[name="noPhonePresent"]');
    this.noPhoneLabel = page.locator('label#noPhonePresent');
    this.verifiedTotalInput = page.locator('input[name="initialReviewTotal"]');
    // A hidden copy lives in #ediConfirmHandwritingModal; use the visible one on the form
    this.handwritingSelect = page.locator('select[name="handwrittenMarkup"]:visible');
    this.reviewCompleteCheckbox = page.locator('input[ng-model="initialReviewComplete"]');
    this.reviewCompleteLabel = page.locator('label').filter({ has: page.locator('input[ng-model="initialReviewComplete"]') });
    this.saveButton = page.getByRole('button', { name: /Save/ });

    this.reconcileCompleteCheckbox = page.locator('input[ng-model="reconciliationComplete"]');
    this.reconcileCompleteLabel = page.locator('label').filter({ has: this.reconcileCompleteCheckbox });
    this.finalReviewLabel = page.locator('label').filter({ hasText: 'This order has been reviewed and should be closed' });
    this.finalReviewCheckbox = this.finalReviewLabel.locator('input[type="checkbox"]');
  }

  /** The visible Bootstrap modal (some are aria-hidden, so match by CSS + text, not by role). */
  private modal() {
    return this.page.locator('.modal-dialog:visible').first();
  }

  private async clickModalButton(text: string) {
    const button = this.modal().locator('button').filter({ hasText: new RegExp(`^\\s*${text}\\s*$`) });
    await expect(button).toBeVisible({ timeout: 15_000 });
    await button.click();
  }

  /** Order list row for a given order id. */
  private orderRow(orderId: string) {
    return this.page.getByRole('row').filter({ has: this.page.locator(`a[href*="/order/${orderId}/"]`) });
  }

  async openOrderList() {
    await this.page.goto('/#/order/v2', { waitUntil: 'domcontentloaded' });
    await expect(this.page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible({ timeout: 60_000 });
  }

  // ---------- Place order ----------

  async openPlaceNewOrder() {
    await this.step('Go to Orders > Place New Order', async () => {
      // The submenu sometimes doesn't open on the first click while the page settles — retry
      await expect(async () => {
        if (!(await this.placeNewOrderLink.isVisible())) await this.ordersMenu.click();
        await expect(this.placeNewOrderLink).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 30_000 });
      await this.placeNewOrderLink.click();
      await expect(this.placeOrderHeading).toBeVisible({ timeout: 60_000 });
      await expect(this.vendorToggle).toBeVisible({ timeout: 30_000 });
    });
  }

  async selectVendor(vendorName: string) {
    await this.step(`Select vendor "${vendorName}"`, async () => {
      await this.vendorToggle.click();
      await this.vendorSearchInput.pressSequentially(vendorName, { delay: 30 });
      const option = this.page.getByRole('option', { name: vendorName, exact: true });
      await expect(option).toBeVisible({ timeout: 15_000 });
      await option.click();
    });
  }

  /** Enters quantity for one vendor item and returns the Estimated Total Price (e.g. "36.45"). */
  async enterQuantity(vendorItemName: string, quantity: string): Promise<string> {
    return this.step(`Enter quantity ${quantity} for "${vendorItemName}"`, async () => {
      const row = this.page.getByRole('row', { name: new RegExp(vendorItemName) });
      await expect(row).toBeVisible({ timeout: 30_000 });
      await row.getByRole('spinbutton').fill(quantity);
      await expect(this.estimatedTotal).not.toHaveText('$0.00');
      const total = (await this.estimatedTotal.innerText()).replace(/[$,\s]/g, '');
      return total;
    });
  }

  async sendOrder(expectedTotal: string) {
    await this.step('Click Send', async () => {
      await this.sendButton.click();
    });
    await this.step(`Confirm Order modal: verify total $${expectedTotal} and click Send`, async () => {
      await expect(this.modal()).toContainText('Confirm Order');
      await expect(this.modal()).toContainText(`$${Number(expectedTotal).toFixed(2)}`);
      await this.clickModalButton('Send');
    });
    await this.step('Verify redirected to Orders page', async () => {
      await expect(this.page).toHaveURL(/#\/order\/v2/, { timeout: 30_000 });
    });
  }

  /** Finds the just-sent order by vendor + total and returns its order id. */
  async findSentOrder(vendorName: string, total: string): Promise<string> {
    return this.step(`Find sent order for "${vendorName}" with total $${total}`, async () => {
      const money = `$${Number(total).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
      const row = this.page.getByRole('row')
        .filter({ hasText: vendorName })
        .filter({ hasText: money })
        .filter({ hasText: 'Sent' })
        .first();
      await expect(row).toBeVisible({ timeout: 30_000 });
      const href = (await row.locator('a').first().getAttribute('href')) ?? '';
      const orderId = href.match(/\/order\/(\d+)\//)?.[1];
      expect(orderId, `order id from ${href}`).toBeTruthy();
      return orderId!;
    });
  }

  // ---------- Photo + preprocessing ----------

  async openOrderFromList(orderId: string, expectedUrlPart: RegExp) {
    await this.openOrderList();
    const row = this.orderRow(orderId);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.locator('a').first().click();
    await expect(this.page).toHaveURL(expectedUrlPart, { timeout: 30_000 });
  }

  async addPhoto(orderId: string) {
    await this.step(`Open order #${orderId}`, async () => {
      await this.openOrderFromList(orderId, new RegExp(`/order/${orderId}/`));
      await expect(this.addPhotoButton).toBeVisible({ timeout: 60_000 });
    });
    await this.step('Click Add Photo and choose invoice image', async () => {
      const chooserPromise = this.page.waitForEvent('filechooser');
      await this.addPhotoButton.click();
      const chooser = await chooserPromise;
      await chooser.setFiles(SAMPLE_INVOICE_IMAGE);
    });
    await this.step('Upload Status modal: click OK', async () => {
      await expect(this.modal()).toContainText('Upload Successful', { timeout: 60_000 });
      await this.clickModalButton('OK');
    });
  }

  async endPreprocessing(orderId: string) {
    await this.step(`Open order #${orderId} from order list (Preprocessing)`, async () => {
      await this.openOrderFromList(orderId, /orderPreprocessing/);
    });
    await this.step('Scroll down and click End Preprocessing', async () => {
      await this.endPreprocessingButton.scrollIntoViewIfNeeded();
      await this.endPreprocessingButton.click();
    });
    await this.step('Confirm modal: click OK', async () => {
      await expect(this.modal()).toContainText('end preprocessing');
      await this.clickModalButton('OK');
      await expect(this.page).toHaveURL(/#\/order\/v2/, { timeout: 30_000 });
    });
  }


  // ---------- Shared form helpers (Initial Review + Reconciliation) ----------

  /** The form re-renders right after load and can wipe early input, so retry until the value sticks. */
  private async fillInvoiceNumber(value: string) {
    await expect(async () => {
      await this.invoiceNumberInput.fill(value);
      await this.invoiceNumberInput.press('Tab');
      await expect(this.invoiceNumberInput).toHaveValue(value, { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
  }

  /** The date picker ignores fill(); type it key by key and confirm with Enter. */
  private async typeInvoiceDate(value: string, clickAwayTarget: Locator) {
    await this.invoiceDateInput.click();
    await this.invoiceDateInput.press('Control+A');
    await this.invoiceDateInput.press('Backspace');
    await this.invoiceDateInput.pressSequentially(value, { delay: 50 });
    await this.invoiceDateInput.press('Enter');
    await clickAwayTarget.click(); // close the date picker popup
    await expect(this.invoiceDateInput).toHaveValue(value);
  }

  /** iCheck checkboxes: the real <input> is hidden, so click its label. */
  private async check(input: Locator, label: Locator) {
    if (!(await input.isChecked())) await label.click();
    await expect(input).toBeChecked();
  }

  /**
   * Only a vendor's FIRST order shows the address/phone sections; once "no address"/"no phone"
   * has been recorded for the vendor, later orders don't show them. Tick them only when shown.
   */
  private async checkNoAddressAndNoPhone() {
    const sections: Array<[string, Locator, Locator]> = [
      ['No address is provided on the invoice', this.noAddressCheckbox, this.noAddressLabel],
      ['No Phone number is provided on the invoice', this.noPhoneCheckbox, this.noPhoneLabel],
    ];
    for (const [text, input, label] of sections) {
      if (await label.isVisible()) {
        await this.step(`Check "${text}"`, () => this.check(input, label));
      } else {
        await this.step(`"${text}" not shown — already recorded for this vendor (skipped)`, async () => {});
      }
    }
  }

  /** Clicks Save, then "Verified" in the confirmation modal. */
  private async saveAndVerify(leavingUrl: RegExp) {
    await this.step('Click Save', async () => {
      await expect(this.saveButton).toBeEnabled({ timeout: 15_000 });
      await this.saveButton.click();
    });
    await this.step('Verification modal: click "Verified"', async () => {
      await this.confirmVerifiedModal();
      await expect(this.page).not.toHaveURL(leavingUrl, { timeout: 30_000 });
    });
  }

  /**
   * The "Verified" modal. Sometimes it is an Order Verification modal whose Verified button stays
   * disabled until an OK checkbox inside it is ticked — tick every unticked checkbox, then click Verified.
   */
  private async confirmVerifiedModal() {
    const modal = this.modal();
    const verified = modal.locator('button').filter({ hasText: /^\s*Verified\s*$/ });
    await expect(verified).toBeVisible({ timeout: 15_000 });
    if (await verified.isDisabled()) {
      await this.step('Order Verification modal: tick the OK checkbox to enable "Verified"', async () => {
        const boxes = modal.locator('input[type="checkbox"]');
        const count = await boxes.count();
        expect(count, 'Verified is disabled but the modal has no checkbox to tick').toBeGreaterThan(0);
        for (let i = 0; i < count; i++) {
          const box = boxes.nth(i);
          if (await box.isChecked()) continue;
          // iCheck hides the real input: click its label, else the iCheck overlay, else the input itself
          const label = modal.locator('label').filter({ has: box });
          if (await label.count()) await label.first().click();
          else if (await box.locator('xpath=following-sibling::ins').count()) await box.locator('xpath=following-sibling::ins').click();
          else await box.check({ force: true });
        }
        await expect(verified).toBeEnabled({ timeout: 10_000 });
      });
    }
    await verified.click();
  }

  /** Handles the Verified modal only if it shows up (used after Initial Review Save). */
  private async confirmVerifiedModalIfShown() {
    const verified = this.modal().locator('button').filter({ hasText: /^\s*Verified\s*$/ });
    const shown = await verified.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);
    if (shown) await this.step('Verification modal shown: click "Verified"', () => this.confirmVerifiedModal());
  }
  /**
   * Waits until an order page has fully loaded before anything is filled:
   * heading + key field visible, network quiet, no loading spinners, then a short settle time
   * (these Angular forms re-render right after load and wipe early input).
   */
  private async waitForPageReady(heading: Locator, readyField: Locator) {
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await expect(readyField).toBeVisible({ timeout: 60_000 });
    await this.page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await expect(this.page.locator('.fa-spin:visible, .spinner:visible, .loading:visible, .block-ui-overlay:visible'))
      .toHaveCount(0, { timeout: 30_000 })
      .catch(() => {});
    await this.page.waitForTimeout(3_000);
  }

  // ---------- Initial Review ----------

  async completeInitialReview(orderId: string, data: InitialReviewData, opts: { save?: boolean } = {}) {
    await this.step(`Open order #${orderId} from order list (Initial Review)`, async () => {
      await this.openOrderFromList(orderId, /initialReview/);
    });
    await this.step('Wait for Initial Review page to load fully', async () => {
      await this.waitForPageReady(this.initialReviewHeading, this.invoiceNumberInput);
    });
    await this.step(`Invoice #: ${data.invoiceNumber}`, () => this.fillInvoiceNumber(data.invoiceNumber));
    await this.step(`Invoice Date: ${data.invoiceDate}`, () => this.typeInvoiceDate(data.invoiceDate, this.initialReviewHeading));
    await this.checkNoAddressAndNoPhone();
    await this.step(`Verified Total: ${data.verifiedTotal}`, async () => {
      await this.verifiedTotalInput.fill(data.verifiedTotal);
    });
    await this.step('Handwriting on invoice: No', async () => {
      await this.handwritingSelect.selectOption({ label: 'No' });
    });
    await this.step('Check "The initial review for this order is complete"', () =>
      this.check(this.reviewCompleteCheckbox, this.reviewCompleteLabel));
    if (opts.save === false) return;
    await this.step('Re-check values before Save', async () => {
      await expect(this.invoiceNumberInput).toHaveValue(data.invoiceNumber);
      await expect(this.invoiceDateInput).toHaveValue(data.invoiceDate);
      // Compare as numbers: the field may show "36.90" for "36.9"
      await expect.poll(async () => Number(await this.verifiedTotalInput.inputValue())).toBe(Number(data.verifiedTotal));
    });
    await this.step('Click Save', async () => {
      await expect(this.saveButton).toBeEnabled();
      await this.saveButton.click();
      await this.confirmVerifiedModalIfShown();
      await expect(this.page).not.toHaveURL(/initialReview/, { timeout: 30_000 });
    });
  }

  // ---------- Reconciliation ----------

  async reconcile(orderId: string, data: ReconcileData, opts: { save?: boolean } = {}) {
    const heading = this.page.getByRole('heading', { name: /Reconcile Order/ });
    await this.step(`Open order #${orderId} from order list (Reconciliation)`, async () => {
      await this.openOrderFromList(orderId, /reconcile/);
    });
    await this.step('Wait for Reconciliation page to load fully', async () => {
      await this.waitForPageReady(heading, this.invoiceNumberInput);
    });
    // Right after Initial Review the invoice is "locked for automation processes" for a few minutes,
    // which keeps Save disabled. Override it with Process Invoice -> OK.
    const processInvoice = this.page.getByRole('button', { name: 'Process Invoice' });
    if (await processInvoice.isVisible()) {
      await this.step('Invoice locked for automation: click Process Invoice -> OK', async () => {
        await processInvoice.click();
        await expect(this.modal()).toContainText('skip automation');
        await this.clickModalButton('OK');
        await expect(processInvoice).toBeHidden({ timeout: 30_000 });
        // The form reloads after the override; wait for it before typing anything
        await this.waitForPageReady(heading, this.invoiceNumberInput);
      });
    }
    await this.step(`Invoice #: ${data.invoiceNumber} (same as Initial Review)`, () => this.fillInvoiceNumber(data.invoiceNumber));
    await this.step(`Invoice Date: ${data.invoiceDate} (new Reconciliation date)`, () => this.typeInvoiceDate(data.invoiceDate, heading));
    await this.checkNoAddressAndNoPhone();
    await this.step(`Change Price of "${data.vendorItemName}" to $${data.newPrice}`, async () => {
      const row = this.page.locator('.ui-grid-render-container-body .ui-grid-row').filter({ hasText: data.vendorItemName });
      const priceCell = row.locator('.ui-grid-cell').nth(5);
      await priceCell.click();
      await this.page.keyboard.type(data.newPrice[0]); // keypress opens the cell editor
      const input = priceCell.locator('input');
      await expect(input).toBeVisible();
      await input.fill(data.newPrice);
      await heading.click(); // commit on blur
      await expect(input).toHaveCount(0);
      await expect(priceCell).toHaveText(`$${Number(data.newPrice).toFixed(2)}`);
    });
    await this.step('Handwriting on invoice: No', async () => {
      await this.handwritingSelect.selectOption({ label: 'No' });
    });
    await this.step('Check "The reconciliation for this order is complete"', () =>
      this.check(this.reconcileCompleteCheckbox, this.reconcileCompleteLabel));
    await this.step(`Re-check Invoice # "${data.invoiceNumber}" and date "${data.invoiceDate}" before Save`, async () => {
      // The page can wipe these after load/override — re-enter if needed
      if ((await this.invoiceNumberInput.inputValue()) !== data.invoiceNumber) {
        await this.fillInvoiceNumber(data.invoiceNumber);
      }
      if ((await this.invoiceDateInput.inputValue()) !== data.invoiceDate) {
        await this.typeInvoiceDate(data.invoiceDate, heading);
      }
      await expect(this.invoiceNumberInput).toHaveValue(data.invoiceNumber);
      await expect(this.invoiceDateInput).toHaveValue(data.invoiceDate);
    });
    if (opts.save === false) return;
    await this.saveAndVerify(/reconcile/);
  }

  // ---------- Final Review ----------

  async finalReview(orderId: string) {
    await this.step(`Open order #${orderId} from order list (Final Review)`, async () => {
      await this.openOrderFromList(orderId, new RegExp(`/order/${orderId}/`));
    });
    await this.step('Wait for Final Review page to load fully', async () => {
      await this.waitForPageReady(this.page.getByRole('heading', { name: /Final Review/ }), this.finalReviewLabel);
    });
    await this.step('Check "This order has been reviewed and should be closed"', () =>
      this.check(this.finalReviewCheckbox, this.finalReviewLabel));
    const url = this.page.url();
    await this.saveAndVerify(new RegExp(url.slice(url.indexOf('#')).replace(/[/#]/g, '\\$&')));
  }

  // ---------- Order list checks ----------

  /** Confirms the order shows the invoice number in the order list. Returns the row text. */
  async verifyOrderInList(orderId: string, invoiceNumber: string, status?: string): Promise<string> {
    const label = status ? ` with status "${status}"` : '';
    return this.step(`Verify order #${orderId} shows invoice # ${invoiceNumber}${label} in order list`, async () => {
      await this.openOrderList();
      const row = this.orderRow(orderId);
      await expect(row).toContainText(invoiceNumber, { timeout: 30_000 });
      if (status) await expect(row).toContainText(status, { timeout: 30_000 });
      return (await row.innerText()).replace(/\s+/g, ' ').trim();
    });
  }
}