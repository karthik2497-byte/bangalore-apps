#!/usr/bin/env node
// Checks the billing maths, quantity parsing, Manglish search and the price list.
// Run: node 8_thraasu/test-bill.mjs
// bill-core.js is the file the page loads, run here as-is, never copied.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const APP = dirname(fileURLToPath(import.meta.url));
const core = vm.runInNewContext(readFileSync(join(APP, 'bill-core.js'), 'utf8') +
  '\n;({ UNITS, lineAmount, parseQty, parseMoney, fmtQty, fmtMoney, totals, search, validProducts, autoSmall, safeImg })');
// Objects made inside the vm realm have its prototypes, which deepStrictEqual rejects: copy them out.
const plain = f => (...args) => JSON.parse(JSON.stringify(f(...args)));
const { lineAmount, parseQty, parseMoney, fmtQty, fmtMoney, autoSmall, safeImg } = core;
const [totals, search, validProducts] = [core.totals, core.search, core.validProducts].map(plain);
const data = JSON.parse(readFileSync(join(APP, 'products.json'), 'utf8'));
const html = readFileSync(join(APP, 'index.html'), 'utf8');

let n = 0;
const t = (name, fn) => { fn(); n++; };

t('line amounts are exact paise', () => {
  assert.equal(lineAmount(4000, 250, 'kg'), 1000);      // 250 g of ₹40/kg = ₹10.00
  assert.equal(lineAmount(4000, 1250, 'kg'), 5000);
  assert.equal(lineAmount(4000, 333, 'kg'), 1332);      // ₹13.32, rounded once
  assert.equal(lineAmount(5200, 500, 'l'), 2600);       // 500 ml milk at ₹52/L
  assert.equal(lineAmount(700, 3, 'pc'), 2100);         // 3 eggs at ₹7
  assert.equal(lineAmount(300000, 5, 'kg'), 1500);      // 5 g cardamom at ₹3000/kg
});

t('typed quantities, both sides of the toggle', () => {
  assert.equal(parseQty('250', 'kg', false), 250);
  assert.equal(parseQty('250', 'kg', true), 250000);   // the toggle reinterprets the number
  assert.equal(parseQty('0.25', 'kg', true), 250);
  assert.equal(parseQty('1.255', 'kg', true), 1255);   // float noise does not leak
  assert.equal(parseQty(' 750 ', 'l', false), 750);
  assert.equal(parseQty('3', 'pc', false), 3);
  for (const bad of ['', '0', '-1', 'abc', '1e9', 'Infinity']) assert.equal(parseQty(bad, 'kg', true), 0, bad);
  assert.equal(parseQty('2.5', 'pc', false), 0);       // no half pieces
  assert.equal(parseQty('0.0004', 'kg', true), 0);     // rounds to 0 g
  assert.equal(parseQty('1001', 'kg', true), 0);       // past 1000 kg is a typo
});

t('typed "250" on the kg side means grams; "1.5" and "2" stay kilos', () => {
  assert.equal(autoSmall('250', 'kg', true), true);
  assert.equal(autoSmall('50', 'l', true), true);
  for (const keep of ['1.5', '2', '49', '', 'abc']) assert.equal(autoSmall(keep, 'kg', true), false, keep);
  assert.equal(autoSmall('250', 'kg', false), false);   // already grams
  assert.equal(autoSmall('250', 'pc', false), false);
});

t('photo paths cannot leave the app folder', () => {
  for (const ok of ['img/tomato.webp', 'tomato.png', 'img/veg/okra-2.JPG']) assert.equal(safeImg(ok), ok);
  for (const bad of ['../x.png', '/x.png', 'https://evil.example/x.png', 'img/x.gif', 'img//x.png', 'a b.png', 'javascript:x.png', 42, undefined])
    assert.equal(safeImg(bad), '', String(bad));
});

t('rupee inputs', () => {
  assert.equal(parseMoney('40'), 4000);
  assert.equal(parseMoney('52.5'), 5250);
  assert.equal(parseMoney(''), 0);
  assert.equal(parseMoney('-5'), null);
  assert.equal(parseMoney('x'), null);
});

t('quantity and money display', () => {
  assert.equal(fmtQty(250, 'kg'), '250 g');
  assert.equal(fmtQty(1250, 'kg'), '1.25 kg');
  assert.equal(fmtQty(1000, 'l'), '1 L');
  assert.equal(fmtQty(500, 'l'), '500 ml');
  assert.equal(fmtQty(3, 'pc'), '3 എണ്ണം');
  assert.equal(fmtQty(3, 'pc', true), '3');
  assert.equal(fmtMoney(1000), '₹10.00');
  assert.equal(fmtMoney(4000, true), '₹40');
  assert.equal(fmtMoney(5250, true), '₹52.50');
  assert.equal(fmtMoney(12345650), '₹1,23,456.50');     // Indian grouping
});

t('totals: subtotal, discount, round-off', () => {
  const L = (rate, qty, unit) => ({ rate, qty, unit });
  const base = [L(4000, 250, 'kg'), L(5200, 500, 'l'), L(700, 3, 'pc')];
  assert.deepEqual(totals(base), { subtotal: 5700, discount: 0, roundOff: 0, total: 5700 });
  const odd = [...base, L(4000, 333, 'kg')];                                   // 7032 paise
  assert.deepEqual(totals(odd), { subtotal: 7032, discount: 0, roundOff: -32, total: 7000 });
  assert.deepEqual(totals(odd, 1000), { subtotal: 7032, discount: 1000, roundOff: -32, total: 6000 });
  assert.equal(totals([L(7050, 1, 'pc')]).total, 7100);                      // 50 paise rounds up
  assert.equal(totals(base, 999999).total, 0);                                // discount clamps
  assert.equal(totals(base, -500).discount, 0);
  assert.deepEqual(totals([]), { subtotal: 0, discount: 0, roundOff: 0, total: 0 });
});

const products = validProducts(data);
const ids = list => list.map(p => p.id);

t('Manglish, English and Malayalam all find the product', () => {
  for (const q of ['thakkali', 'takkali', 'thakali', 'TOMATO', 'തക്കാളി', 'thak']) assert.equal(search(products, q)[0].id, 'tomato', q);
  assert.equal(search(products, 'velichenna')[0].id, 'coconutoil');
  assert.equal(search(products, 'mutta')[0].id, 'egg');
  assert.deepEqual(ids(search(products, 'ulli')).slice(0, 2).sort(), ['onion', 'shallot']);  // word hits before veluthulli
  assert.ok(ids(search(products, 'ulli')).includes('garlic'));
  assert.ok(ids(search(products, 'oil')).includes('sunflower'));
  assert.deepEqual(search(products, ''), []);
  assert.deepEqual(search(products, 'qwxy'), []);   // not 'zzzz': doubles collapse, so that is a search for 'z'
});

t('price list: every row is billable and every category is stocked', () => {
  assert.equal(data.sample, true, 'sample prices must stay labelled until real ones replace them');
  assert.equal(products.length, data.products.length, 'a row in products.json was rejected');
  for (const c of data.categories) assert.ok(products.some(p => p.cat === c.id), `empty category ${c.id}`);
});

t('validator rejects rows the maths cannot price', () => {
  const cats = [{ id: 'veg' }];
  const ok = { id: 'a', cat: 'veg', ml: 'എ', unit: 'kg', rate: 10 };
  const bad = [{ ...ok, id: 'b', unit: 'dozen' }, { ...ok, id: 'c', rate: -1 }, { ...ok, id: 'd', rate: '10' },
    { ...ok, id: 'e', cat: 'none' }, { ...ok, id: 'f', ml: ' ' }, { ...ok }, { ...ok, id: 'g', unit: 'toString' }];
  assert.deepEqual(ids(validProducts({ categories: cats, products: [ok, ...bad] })), ['a']);
  assert.deepEqual(validProducts(null), []);
});

t('every emoji in the price list is in the subset webfont request', () => {
  const m = html.match(/family=Noto\+Color\+Emoji[^"]*&text=([^"&]+)/);
  assert.ok(m, 'emoji font link missing');
  const subset = new Set([...decodeURIComponent(m[1])]);
  const icons = [...data.categories, ...data.products].map(x => x.icon);
  for (const icon of icons) for (const ch of icon) assert.ok(subset.has(ch), `${icon} U+${ch.codePointAt(0).toString(16)} not in &text=`);
});

t('every product and category photo is a safe path to a file that ships', () => {
  for (const x of [...data.categories, ...data.products]) {
    assert.ok(safeImg(x.img), `${x.id}: img missing or unsafe`);
    assert.ok(existsSync(join(APP, x.img)), `${x.id}: ${x.img} not in the repo`);
  }
});

console.log(`OK: ${n} checks passed (thraasu bill-core)`);
