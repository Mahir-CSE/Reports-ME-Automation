/**
 * Test inputs for each part.
 *
 * The test runner (npm run runner) passes them as JSON in the TEST_INPUTS env variable.
 * Anything not provided falls back to a default: random names; Initial Review dates = today / yesterday /
 * day before; Reconciliation dates = 3 / 4 / 5 days ago (always different from the Initial Review dates).
 * Login URL / username / password come from BASE_URL / TEST_USERNAME / TEST_PASSWORD (see config/env.ts).
 */
export interface TestInputs {
  // Part 2
  vendorName: string;
  // Part 3
  productName: string;
  productCategory: string;
  productQuantity: string;
  productPrice: string;
  // Part 4
  vendorItem1: string;
  vendorItem2: string;
  // Part 5 — invoice dates (MM-DD-YYYY), 3 orders per vendor item.
  // Initial Review date, and the (changed) invoice date entered in Reconciliation.
  item1InitialDates: [string, string, string];
  item1ReconDates: [string, string, string];
  item2InitialDates: [string, string, string];
  item2ReconDates: [string, string, string];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Date `daysAgo` days before today, as MM-DD-YYYY. */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${d.getFullYear()}`;
}

/** Accepts MM-DD-YYYY or YYYY-MM-DD (from <input type="date">) and returns MM-DD-YYYY. */
export function toInvoiceDate(value: string): string {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[2]}-${iso[3]}-${iso[1]}` : value;
}

export function defaultInputs(suffix = Math.floor(100000 + Math.random() * 900000)): TestInputs {
  const initialDates: [string, string, string] = [daysAgo(0), daysAgo(1), daysAgo(2)];
  const reconDates: [string, string, string] = [daysAgo(3), daysAgo(4), daysAgo(5)];
  return {
    vendorName: `Vendor-QA-${suffix}`,
    productName: `Test-Product-${suffix}`,
    productCategory: 'Baked Goods',
    productQuantity: '1',
    productPrice: '10',
    vendorItem1: `VI-QA-${suffix}-1`,
    vendorItem2: `VI-QA-${suffix}-2`,
    item1InitialDates: [...initialDates],
    item1ReconDates: [...reconDates],
    item2InitialDates: [...initialDates],
    item2ReconDates: [...reconDates],
  };
}

function loadInputs(): TestInputs {
  const defaults = defaultInputs();
  if (!process.env.TEST_INPUTS) return defaults;
  const given = JSON.parse(process.env.TEST_INPUTS) as Partial<TestInputs>;
  const pick = (v: string | undefined, d: string) => (v && v.trim() ? v.trim() : d);
  const dates = (v: string[] | undefined, d: [string, string, string]) =>
    d.map((def, i) => toInvoiceDate(pick(v?.[i], def))) as [string, string, string];
  return {
    vendorName: pick(given.vendorName, defaults.vendorName),
    productName: pick(given.productName, defaults.productName),
    productCategory: pick(given.productCategory, defaults.productCategory),
    productQuantity: pick(given.productQuantity, defaults.productQuantity),
    productPrice: pick(given.productPrice, defaults.productPrice),
    vendorItem1: pick(given.vendorItem1, defaults.vendorItem1),
    vendorItem2: pick(given.vendorItem2, defaults.vendorItem2),
    item1InitialDates: dates(given.item1InitialDates, defaults.item1InitialDates),
    item1ReconDates: dates(given.item1ReconDates, defaults.item1ReconDates),
    item2InitialDates: dates(given.item2InitialDates, defaults.item2InitialDates),
    item2ReconDates: dates(given.item2ReconDates, defaults.item2ReconDates),
  };
}

export const inputs = loadInputs();
