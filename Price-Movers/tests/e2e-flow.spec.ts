import { test, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { config } from '../config/env';
import { inputs } from '../config/inputs';
import { LoginPage } from '../pages/LoginPage';
import { VendorPage } from '../pages/VendorPage';
import { ProductPage } from '../pages/ProductPage';
import { VendorItemPage, type VendorItemData } from '../pages/VendorItemPage';
import { OrderPage } from '../pages/OrderPage';
import { showStepBanner } from '../pages/BasePage';

/**
 * End-to-end flow in ONE browser window (it stays open between parts):
 *   Part 1 - Login
 *   Part 2 - Create a vendor
 *   Part 3 - Create a product
 *   Part 4 - Create 2 vendor items (for the vendor + product above)
 *   Part 5 - 6 orders (3 per vendor item, different invoice dates):
 *            place -> Initial Review -> Reconciliation (new price) -> Final Review (Closed)
 * Parts run in order; if one fails, the rest are skipped.
 */
test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let page: Page;
// Unique number for this run (used in invoice numbers, item codes, emails)
const runId = Math.floor(100000 + Math.random() * 900000);
let loggedIn = false;

/** Every part after Part 1 logs in first if needed, so any part can be run on its own. */
async function ensureLoggedIn() {
  if (loggedIn) return;
  const loginPage = new LoginPage(page);
  await test.step('Login (needed because Part 1 was not run)', async () => {
    await loginPage.goto(config.baseUrl);
    await loginPage.login(config.username, config.password);
    await loginPage.expectLoggedIn(config.baseUrl);
  });
  loggedIn = true;
}

// Names come from the test runner inputs (config/inputs.ts); later parts reuse what earlier parts created
const vendorName = inputs.vendorName;
const productName = inputs.productName;

const rand = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));
const pick = <T>(items: T[]) => items[rand(0, items.length - 1)];
const PACKAGING_UNITS = ['Case', 'Box', 'Bag', 'Pack', 'Each', 'Bottle', 'Pound', 'Kilogram'];
const vendorItemName = (n: number) => (n === 1 ? inputs.vendorItem1 : inputs.vendorItem2);

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ baseURL: config.baseUrl, viewport: { width: 1400, height: 900 } });
  page = await context.newPage();
});

test.afterAll(async () => {
  // Set KEEP_OPEN=1 to leave the browser open at the end (Playwright Inspector: click Resume to finish)
  if (process.env.KEEP_OPEN) {
    await showStepBanner(page, '✅ All parts finished — browser kept open (click Resume in Inspector to close)');
    await page.pause();
  }
  await context.close();
});

/** Records a failure screenshot (manual pages don't get Playwright's automatic one). */
test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && page) {
    await testInfo.attach('failure screenshot', { body: await page.screenshot(), contentType: 'image/png' });
  }
});

test('Part 1 - Login to testing branch', async ({}, testInfo) => {
  test.setTimeout(180_000);
  const loginPage = new LoginPage(page);

  await loginPage.goto(config.baseUrl);
  await loginPage.login(config.username, config.password);
  await loginPage.expectLoggedIn(config.baseUrl);
  loggedIn = true;

  await showStepBanner(page, `✅ Login successful as "${config.username}"`);
  testInfo.annotations.push({ type: 'Result', description: `✅ Login successful as "${config.username}"` });
  await testInfo.attach('Login successful - screenshot', { body: await page.screenshot(), contentType: 'image/png' });
  console.log(`✅ Login successful as "${config.username}"`);
});

test('Part 2 - Create a new vendor with email ordering', async ({}, testInfo) => {
  test.setTimeout(180_000);
  const orderEmail = `test${runId}@example.com`;
  testInfo.annotations.push({ type: 'Vendor Name', description: vendorName });
  testInfo.annotations.push({ type: 'Order Email', description: orderEmail });

  await ensureLoggedIn();
  const vendorPage = new VendorPage(page);
  await vendorPage.openVendorList();
  await vendorPage.clickNewVendor();
  await vendorPage.enterVendorName(vendorName);
  await vendorPage.enableEmailOrdering(orderEmail);
  await vendorPage.save();
  await vendorPage.searchAndVerifyVendor(vendorName);

  await showStepBanner(page, `✅ Vendor "${vendorName}" created`);
  testInfo.annotations.push({ type: 'Result', description: `✅ Vendor "${vendorName}" created successfully` });
  await testInfo.attach('Vendor created - screenshot', { body: await page.screenshot(), contentType: 'image/png' });
  console.log(`✅ Vendor "${vendorName}" created and found in the vendor list`);
});

test('Part 3 - Create a new product', async ({}, testInfo) => {
  test.setTimeout(240_000);
  const nickname = `QA-Nick-${runId}`;
  testInfo.annotations.push({ type: 'Product Name', description: productName });

  await ensureLoggedIn();
  const productPage = new ProductPage(page);
  await productPage.openProductList();
  await productPage.clickAddProduct();
  await productPage.enterNewProductName(productName);
  await productPage.verifySameForAllLocations();
  const category = await productPage.selectCategory(inputs.productCategory);
  testInfo.annotations.push({ type: 'Category', description: category });
  await productPage.checkInventoried();
  await productPage.fillReportingUnit(nickname, inputs.productQuantity, 'Kilogram');
  await productPage.enterPrice(inputs.productPrice);
  await productPage.save();
  await productPage.searchAndVerifyProduct(productName);

  await showStepBanner(page, `✅ Product "${productName}" created`);
  testInfo.annotations.push({ type: 'Result', description: `✅ Product "${productName}" created successfully` });
  await testInfo.attach('Product created - screenshot', { body: await page.screenshot(), contentType: 'image/png' });
  console.log(`✅ Product "${productName}" (category: ${category}) created and found in the product list`);
});

test('Part 4 - Create 2 vendor items', async ({}, testInfo) => {
  test.setTimeout(300_000);
  await ensureLoggedIn();
  const vendorItemPage = new VendorItemPage(page);

  const items: VendorItemData[] = [1, 2].map((n) => ({
    vendorName,
    productName,
    itemName: vendorItemName(n),
    itemCode: `IC-${runId}-${n}-${rand(100, 999)}`,
    packaging: {
      packaging: `Pkg-${rand(1000, 9999)}`,
      quantity: String(rand(1, 24)),
      unit: pick(PACKAGING_UNITS),
      price: (rand(500, 5000) / 100).toFixed(2),
      ratio: '1',
      orderGuide: 'Yes',
    },
  }));

  for (const [i, item] of items.entries()) {
    await test.step(`Create vendor item ${i + 1}: "${item.itemName}"`, async () => {
      testInfo.annotations.push({
        type: `Vendor Item ${i + 1}`,
        description: `${item.itemName} | code ${item.itemCode} | ${item.packaging.packaging}, qty ${item.packaging.quantity} ${item.packaging.unit}, $${item.packaging.price}, ratio 1, order guide Yes`,
      });
      await vendorItemPage.createVendorItem(item);
    });
  }

  for (const [i, item] of items.entries()) {
    await test.step(`Verify vendor item ${i + 1} in list`, async () => {
      await vendorItemPage.searchAndVerifyVendorItem(item.itemName);
    });
  }

  const names = items.map((i) => i.itemName).join('", "');
  await showStepBanner(page, `✅ Vendor items "${names}" created`);
  testInfo.annotations.push({ type: 'Result', description: `✅ Both vendor items created: "${names}"` });
  await testInfo.attach('Vendor items created - screenshot', { body: await page.screenshot(), contentType: 'image/png' });
  console.log(`✅ Vendor items "${names}" created and found in the vendor item list`);
});


/**
 * One full order lifecycle for a vendor item:
 *   5a Place order  ->  5b Initial Review (invoiceDate)  ->  5c Reconciliation (new price + new date reconDate)
 *   ->  5d Final Review (Closed)
 */
async function runOrderLifecycle(orderNo: number, itemName: string, invoiceDate: string, reconDate: string, testInfo: TestInfo) {
  await ensureLoggedIn();
  const orderPage = new OrderPage(page);
  const quantity = String(rand(1, 10));
  const invoiceNumber = `INV-${runId}-${orderNo}`;
  let orderId = '';
  let estimatedTotal = '';

  await test.step(`5a. Order ${orderNo}: place order`, async () => {
    await orderPage.openPlaceNewOrder();
    await orderPage.selectVendor(vendorName);
    estimatedTotal = await orderPage.enterQuantity(itemName, quantity);
    await orderPage.sendOrder(estimatedTotal);
    orderId = await orderPage.findSentOrder(vendorName, estimatedTotal);
    await orderPage.addPhoto(orderId);
    await orderPage.endPreprocessing(orderId);
  });
  const originalUnitPrice = (Number(estimatedTotal) / Number(quantity)).toFixed(2);
  testInfo.annotations.push({
    type: `Order ${orderNo} placed`,
    description: `#${orderId}: ${itemName} x ${quantity} @ $${originalUnitPrice} = $${estimatedTotal}`,
  });

  await test.step(`5b. Order ${orderNo}: Initial Review`, async () => {
    await orderPage.completeInitialReview(orderId, { invoiceNumber, invoiceDate, verifiedTotal: estimatedTotal });
    await orderPage.verifyOrderInList(orderId, invoiceNumber);
  });
  testInfo.annotations.push({
    type: `Order ${orderNo} Initial Review`,
    description: `Invoice ${invoiceNumber}, date ${invoiceDate}, verified total $${estimatedTotal}`,
  });

  // New price for reconciliation — always different from the ordered price
  let newPrice = originalUnitPrice;
  while (newPrice === originalUnitPrice) newPrice = (rand(500, 6000) / 100).toFixed(2);
  const reconciledTotal = (Number(newPrice) * Number(quantity)).toFixed(2);

  await test.step(`5c. Order ${orderNo}: Reconciliation (price $${originalUnitPrice} -> $${newPrice}, date ${invoiceDate} -> ${reconDate})`, async () => {
    await orderPage.reconcile(orderId, { invoiceNumber, invoiceDate: reconDate, vendorItemName: itemName, newPrice });
    await orderPage.verifyOrderInList(orderId, invoiceNumber);
  });
  testInfo.annotations.push({
    type: `Order ${orderNo} Reconciliation`,
    description: `Price $${originalUnitPrice} -> $${newPrice}; total $${estimatedTotal} -> $${reconciledTotal}; invoice date ${invoiceDate} -> ${reconDate}`,
  });

  let rowText = '';
  await test.step(`5d. Order ${orderNo}: Final Review -> Closed`, async () => {
    await orderPage.finalReview(orderId);
    rowText = await orderPage.verifyOrderInList(orderId, invoiceNumber, 'Closed');
  });

  await showStepBanner(page, `✅ Order ${orderNo} (#${orderId}, ${invoiceNumber}) is Closed`);
  testInfo.annotations.push({ type: 'Result', description: `✅ Order ${orderNo} #${orderId} Closed — ${rowText}` });
  await testInfo.attach(`Order ${orderNo} closed - screenshot`, { body: await page.screenshot(), contentType: 'image/png' });
  console.log(`✅ Order ${orderNo} #${orderId} (${invoiceNumber}) closed — ${rowText}`);
}

/**
 * Part 5 - 6 orders in total: 3 per vendor item. Each order has an Initial Review date and a different
 * Reconciliation date; Reconciliation also changes the price. Every order ends Closed.
 */
for (const itemNo of [1, 2]) {
  const initialDates = itemNo === 1 ? inputs.item1InitialDates : inputs.item2InitialDates;
  const reconDates = itemNo === 1 ? inputs.item1ReconDates : inputs.item2ReconDates;
  for (let k = 0; k < 3; k++) {
    const orderNo = (itemNo - 1) * 3 + k + 1;
    test(`Part 5 - Order ${orderNo} (vendor item ${itemNo}, order ${k + 1} of 3)`, async ({}, testInfo) => {
      test.setTimeout(600_000);
      await runOrderLifecycle(orderNo, vendorItemName(itemNo), initialDates[k], reconDates[k], testInfo);
    });
  }
}