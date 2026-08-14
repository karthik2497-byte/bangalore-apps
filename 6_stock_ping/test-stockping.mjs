#!/usr/bin/env node
// Checks the affiliate rewriter, the product-page parser and the post-check
// bookkeeping in index.html. Run: node 6_stock_ping/test-stockping.mjs
// Functions are pulled out of index.html, never copied.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const APP = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(APP, 'index.html'), 'utf8');

function slice(from, to) {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `block not found: ${from}`);
  return src.slice(a, b);
}

const code = [
  slice('function getDomain(url) {', 'function getSiteName'),
  slice('// ---- AFFILIATE ----', '// ---- STOCK CHECK ----'),
  slice('function applyCheckResult(', 'async function checkSingleProduct')
].join('\n');

// applyCheckResult reaches for the alert + notification layer; capture instead.
const fired = { stock: [], price: [], notifyStock: [], notifyPrice: [] };
const sandbox = new Function(`
  const addStockAlert = (p, o, n) => __fired.stock.push([p.id, o, n]);
  const addPriceAlert = (p, o, n) => __fired.price.push([p.id, o, n]);
  const notifyUser = (p) => __fired.notifyStock.push(p.id);
  const notifyPriceDrop = (p, o, n) => __fired.notifyPrice.push([p.id, o, n]);
  ${code}
  return { affiliateUrl, affiliateEnabled, AFFILIATE, parseJsonLd, extractProductData, applyCheckResult };
`.replace(/__fired/g, 'arguments[0]'))(fired);

const { affiliateUrl, affiliateEnabled, AFFILIATE, extractProductData, applyCheckResult } = sandbox;

let n = 0;
const check = (name, fn) => { fn(); n++; };

/* ---------------- affiliate rewriting (the money path) ---------------- */

check('no tag configured leaves the url completely untouched', () => {
  AFFILIATE.amazon = ''; AFFILIATE.flipkart = '';
  const u = 'https://www.amazon.in/dp/B0CX23V2ZK?ref=foo';
  assert.equal(affiliateUrl(u), u);
  assert.equal(affiliateEnabled(), false);
});

check('affiliateEnabled flips once any tag is set', () => {
  AFFILIATE.amazon = 'blrapps-21';
  assert.equal(affiliateEnabled(), true);
});

check('amazon gets tag= and keeps path and existing params', () => {
  const out = new URL(affiliateUrl('https://www.amazon.in/dp/B0CX23V2ZK?ref=nav&th=1'));
  assert.equal(out.hostname, 'www.amazon.in');
  assert.equal(out.pathname, '/dp/B0CX23V2ZK');
  assert.equal(out.searchParams.get('tag'), 'blrapps-21');
  assert.equal(out.searchParams.get('ref'), 'nav');
  assert.equal(out.searchParams.get('th'), '1');
});

check('an existing foreign tag is replaced, never duplicated', () => {
  const out = affiliateUrl('https://www.amazon.in/dp/X?tag=someoneelse-21');
  assert.equal(out.match(/tag=/g).length, 1, 'tag must appear exactly once');
  assert.ok(out.includes('tag=blrapps-21'));
  assert.ok(!out.includes('someoneelse-21'));
});

check('flipkart uses affid, not tag', () => {
  AFFILIATE.flipkart = 'blrapps';
  const out = new URL(affiliateUrl('https://www.flipkart.com/item/p/itm123?pid=ABC'));
  assert.equal(out.searchParams.get('affid'), 'blrapps');
  assert.equal(out.searchParams.get('tag'), null);
  assert.equal(out.searchParams.get('pid'), 'ABC');
});

check('any amazon TLD is recognised', () => {
  assert.ok(affiliateUrl('https://amazon.co.uk/dp/X').includes('tag=blrapps-21'));
  assert.ok(affiliateUrl('https://www.amazon.com/dp/X').includes('tag=blrapps-21'));
});

check('non-affiliate retailers are never rewritten', () => {
  for (const u of ['https://www.myntra.com/x', 'https://www.croma.com/y', 'https://nykaa.com/z']) {
    assert.equal(affiliateUrl(u), u);
  }
});

check('a malformed url is returned untouched rather than throwing', () => {
  assert.equal(affiliateUrl('not a url'), 'not a url');
  assert.equal(affiliateUrl(''), '');
});

/* ---------------- product page parsing ---------------- */

const ld = (obj) => `<html><head><script type="application/ld+json">${JSON.stringify(obj)}</script></head><body></body></html>`;

check('reads name, price and InStock from a schema.org Product', () => {
  const d = extractProductData(ld({
    '@type': 'Product', name: 'Sony WH-1000XM5',
    offers: { '@type': 'Offer', price: '26990', availability: 'https://schema.org/InStock' }
  }));
  assert.equal(d.name, 'Sony WH-1000XM5');
  assert.equal(d.price, 26990);
  assert.equal(d.status, 'in_stock');
});

check('reads OutOfStock availability', () => {
  const d = extractProductData(ld({
    '@type': 'Product', name: 'X', offers: { price: '100', availability: 'http://schema.org/OutOfStock' }
  }));
  assert.equal(d.status, 'out_of_stock');
});

check('structured data beats a stray "sold out" elsewhere on the page', () => {
  // This is the entire point of the JSON-LD path: a recommendation carousel
  // saying "Sold Out" must not decide the answer for the tracked product.
  const html = ld({ '@type': 'Product', name: 'GPU', offers: { price: '54999', availability: 'https://schema.org/InStock' } })
    .replace('<body>', '<body><div class="carousel">Sold Out</div>');
  const d = extractProductData(html);
  assert.equal(d.status, 'in_stock', 'JSON-LD must win over page keywords');
  assert.equal(d.price, 54999);
});

check('walks @graph and plain arrays', () => {
  const g = extractProductData(ld({ '@graph': [{ '@type': 'WebPage' }, { '@type': 'Product', name: 'G', offers: { price: '10', availability: 'InStock' } }] }));
  assert.equal(g.name, 'G');
  const a = extractProductData(ld([{ '@type': 'Organization' }, { '@type': 'Product', name: 'A', offers: { price: '20', availability: 'InStock' } }]));
  assert.equal(a.name, 'A');
});

check('a malformed ld+json block does not abort the scan', () => {
  const html = `<script type="application/ld+json">{ broken,,, }</script>` +
               ld({ '@type': 'Product', name: 'Recovered', offers: { price: '5', availability: 'InStock' } });
  assert.equal(extractProductData(html).name, 'Recovered');
});

check('lowPrice is used when price is absent', () => {
  const d = extractProductData(ld({ '@type': 'Product', name: 'L', offers: { lowPrice: '1499', availability: 'InStock' } }));
  assert.equal(d.price, 1499);
});

check('falls back to keywords when there is no structured data', () => {
  assert.equal(extractProductData('<html><body><button>Add to Cart</button></body></html>').status, 'in_stock');
  assert.equal(extractProductData('<html><body>Currently unavailable</body></html>').status, 'out_of_stock');
  assert.equal(extractProductData('<html><body>hello</body></html>').status, 'unknown');
});

check('falls back to keywords when JSON-LD omits availability', () => {
  const html = ld({ '@type': 'Product', name: 'P', offers: { price: '99' } }).replace('<body>', '<body>Out of Stock');
  const d = extractProductData(html);
  assert.equal(d.status, 'out_of_stock');
  assert.equal(d.price, 99);
});

check('rupee price is parsed from markup when JSON-LD is absent', () => {
  assert.equal(extractProductData('<body>₹1,29,900</body>').price, 129900);
  assert.equal(extractProductData('<body>Rs. 2,499.50</body>').price, 2499.50);
  assert.equal(extractProductData('<body>no price here</body>').price, null);
});

check('title is read from og:title, then <title>, then <h1>', () => {
  assert.equal(extractProductData('<meta property="og:title" content="OG Name">').name, 'OG Name');
  assert.equal(extractProductData('<title>Tag &amp; Name</title>').name, 'Tag & Name');
  assert.equal(extractProductData('<h1>H1 Name</h1>').name, 'H1 Name');
});

/* ---------------- post-check bookkeeping ---------------- */

const product = (over = {}) => ({ id: 'p1', name: 'P', status: 'out_of_stock', price: null, lowestPrice: null, ...over });
const reset = () => { fired.stock = []; fired.price = []; fired.notifyStock = []; fired.notifyPrice = []; };

check('restock fires a stock alert and a notification', () => {
  reset();
  const p = product();
  applyCheckResult(p, 'out_of_stock', null, { status: 'in_stock', price: 500 });
  assert.equal(p.status, 'in_stock');
  assert.deepEqual(fired.stock, [['p1', 'out_of_stock', 'in_stock']]);
  assert.deepEqual(fired.notifyStock, ['p1']);
});

check('a price drop alerts, a rise does not', () => {
  reset();
  const p = product({ price: 500, lowestPrice: 500 });
  applyCheckResult(p, 'in_stock', 500, { status: 'in_stock', price: 400 });
  assert.equal(fired.price.length, 1);
  assert.deepEqual(fired.notifyPrice, [['p1', 500, 400]]);

  reset();
  applyCheckResult(p, 'in_stock', 400, { status: 'in_stock', price: 450 });
  assert.equal(fired.price.length, 0, 'a price rise is not news');
});

check('an unchanged price never alerts', () => {
  // The check loop runs on a timer. If equality counted as a drop, a stable
  // price would fire "₹500 → ₹500" on every single pass, forever.
  reset();
  const p = product({ price: 500, lowestPrice: 500 });
  applyCheckResult(p, 'in_stock', 500, { status: 'in_stock', price: 500 });
  assert.equal(fired.price.length, 0);
  assert.equal(fired.notifyPrice.length, 0);
});

check('the first observed price is not a drop', () => {
  reset();
  const p = product();
  applyCheckResult(p, 'out_of_stock', null, { status: 'out_of_stock', price: 999 });
  assert.equal(fired.price.length, 0);
  assert.equal(p.price, 999);
});

check('lowestPrice keeps the minimum ever seen', () => {
  const p = product({ price: 500, lowestPrice: 500 });
  applyCheckResult(p, 'in_stock', 500, { status: 'in_stock', price: 300 });
  assert.equal(p.lowestPrice, 300);
  applyCheckResult(p, 'in_stock', 300, { status: 'in_stock', price: 700 });
  assert.equal(p.lowestPrice, 300, 'lowest must not follow the price back up');
  assert.equal(p.price, 700);
});

check('a failed price read does not clobber the known price', () => {
  const p = product({ price: 250, lowestPrice: 250 });
  applyCheckResult(p, 'in_stock', 250, { status: 'unknown', price: null });
  assert.equal(p.price, 250);
  assert.equal(p.lowestPrice, 250);
});

check('no alert when the status has not actually changed', () => {
  reset();
  applyCheckResult(product({ status: 'in_stock' }), 'in_stock', null, { status: 'in_stock', price: null });
  assert.equal(fired.stock.length, 0);
});

check('coming back from "checking" is not reported as a change', () => {
  reset();
  applyCheckResult(product(), 'checking', null, { status: 'in_stock', price: null });
  assert.equal(fired.stock.length, 0, 'checking is a UI state, not a stock state');
});

console.log(`PASS — ${n} cases`);
