#!/usr/bin/env node
// Checks the listings validator, the load path, and the contact/submission
// intent building in index.html. Run: node 3_pg_buddy/test-pgs.mjs
// Functions are pulled out of index.html, never copied.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const APP = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(APP, 'index.html'), 'utf8');
const real = JSON.parse(readFileSync(join(APP, 'pgs.json'), 'utf8'));

function slice(from, to) {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `block not found: ${from}`);
  return src.slice(a, b);
}

const code = [
  slice('let pgData = [];', 'const checklistItems'),
  slice('function contactPG(pgId) {', 'function renderStars'),
  slice('const LISTING_CONTACT =', 'function toggleAreaPref')
].join('\n');

// Stubs for everything the extracted code reaches for.
const env = {
  fields: {},
  opened: [],
  toasts: [],
  store: {}
};

const make = new Function('__env', `
  let filteredPGs = [];
  let currentDetailPG = null;
  const showToast = (m, t) => __env.toasts.push([m, t]);
  const window = { open: (u) => { __env.opened.push(u); } };
  const document = { getElementById: (id) => ({ value: __env.fields[id] ?? '' }) };
  const localStorage = {
    getItem: (k) => (k in __env.store ? __env.store[k] : null),
    setItem: (k, v) => { __env.store[k] = v; }
  };
  let fetch = async () => { throw new Error('no fetch stub set'); };
  ${code}
  return {
    validPGs, applyPGs, loadCachedPGs, refreshPGs, contactPG, submitListing,
    LISTING_CONTACT, PG_STORE,
    getPgData: () => pgData,
    getFiltered: () => filteredPGs,
    setDetail: (id) => { currentDetailPG = id; },
    setFetch: (fn) => { fetch = fn; }
  };
`);

let api = make(env);
// Collected then run sequentially with await: several cases are async and share
// the `api`/`env` fixtures, so overlapping them lets one test's reset() land in
// the middle of another's refresh.
const cases = [];
const check = (name, fn) => cases.push([name, fn]);
const reset = () => {
  env.fields = {}; env.opened = []; env.toasts = []; env.store = {};
  api = make(env);
};

const goodPG = () => JSON.parse(JSON.stringify(real.pgs[0]));
const payload = (over = {}) => ({ version: 1, pgs: [goodPG()], ...over });

/* ---------------- validator ---------------- */

check('the shipped pgs.json is valid', () => {
  assert.equal(api.validPGs(real), true, 'the file we actually ship must pass');
  assert.ok(real.pgs.length >= 8);
});

check('rejects non-objects and missing structure', () => {
  for (const bad of [null, undefined, 'x', 42, [], {}]) {
    assert.equal(api.validPGs(bad), false, `should reject ${JSON.stringify(bad)}`);
  }
});

check('rejects a bad or missing version', () => {
  for (const v of [0, -1, '1', 1.5, null, undefined]) {
    assert.equal(api.validPGs(payload({ version: v })), false, `version ${v}`);
  }
});

check('rejects an empty or non-array listing set', () => {
  assert.equal(api.validPGs(payload({ pgs: [] })), false);
  assert.equal(api.validPGs(payload({ pgs: 'nope' })), false);
});

check('rejects a listing missing any field the UI renders', () => {
  const drops = ['id', 'name', 'area', 'price', 'rating', 'grad', 'tags', 'filters', 'rules', 'reviews', 'amenities', 'ratings'];
  for (const field of drops) {
    const p = goodPG();
    delete p[field];
    assert.equal(api.validPGs({ version: 1, pgs: [p] }), false, `missing ${field} must be rejected`);
  }
});

check('rejects out-of-range numbers', () => {
  const bad = (over) => api.validPGs({ version: 1, pgs: [{ ...goodPG(), ...over }] });
  assert.equal(bad({ price: 0 }), false);
  assert.equal(bad({ price: -500 }), false);
  assert.equal(bad({ price: '8500' }), false);
  assert.equal(bad({ rating: 5.5 }), false);
  assert.equal(bad({ rating: -1 }), false);
  assert.equal(bad({ id: 1.5 }), false);
});

check('rejects blank names and areas', () => {
  const bad = (over) => api.validPGs({ version: 1, pgs: [{ ...goodPG(), ...over }] });
  assert.equal(bad({ name: '   ' }), false);
  assert.equal(bad({ area: '' }), false);
});

check('rejects duplicate ids', () => {
  // Duplicates would make openDetail and toggleSave ambiguous.
  const p = goodPG();
  assert.equal(api.validPGs({ version: 1, pgs: [p, { ...p }] }), false);
});

/* ---------------- load path ---------------- */

check('a valid cache is applied', () => {
  reset();
  env.store.pgbuddy_listings = JSON.stringify(payload());
  assert.equal(api.loadCachedPGs(), true);
  assert.equal(api.getPgData().length, 1);
  assert.equal(api.getFiltered().length, 1);
});

check('a corrupt cache is ignored rather than thrown', () => {
  reset();
  env.store.pgbuddy_listings = '{not json';
  assert.equal(api.loadCachedPGs(), false);
  assert.equal(api.getPgData().length, 0);
});

check('an invalid cache is ignored', () => {
  reset();
  env.store.pgbuddy_listings = JSON.stringify(payload({ version: 0 }));
  assert.equal(api.loadCachedPGs(), false);
  assert.equal(api.getPgData().length, 0);
});

check('a valid network payload is applied and cached', async () => {
  reset();
  api.setFetch(async () => ({ ok: true, json: async () => payload({ version: 3 }) }));
  return api.refreshPGs().then(ok => {
    assert.equal(ok, true);
    assert.equal(api.getPgData().length, 1);
    assert.equal(JSON.parse(env.store.pgbuddy_listings).version, 3);
  });
});

check('a 404 leaves the already-loaded listings alone', async () => {
  reset();
  env.store.pgbuddy_listings = JSON.stringify(payload());
  api.loadCachedPGs();
  api.setFetch(async () => ({ ok: false, json: async () => ({}) }));
  return api.refreshPGs().then(ok => {
    assert.equal(ok, false);
    assert.equal(api.getPgData().length, 1, 'cached listings must survive a failed refresh');
  });
});

check('a non-OK response is rejected even when its body is valid', async () => {
  // A CDN error page or a stale-cache 404 can still carry a parseable body.
  // HTTP status is its own gate, not a shortcut for the validator.
  reset();
  env.store.pgbuddy_listings = JSON.stringify(payload());
  api.loadCachedPGs();
  api.setFetch(async () => ({ ok: false, status: 404, json: async () => payload({ version: 99, pgs: [{ ...goodPG(), name: 'From a 404' }] }) }));
  return api.refreshPGs().then(ok => {
    assert.equal(ok, false);
    assert.notEqual(api.getPgData()[0].name, 'From a 404', 'a 404 body must never become the listings');
  });
});

check('an invalid network payload never replaces good listings', async () => {
  reset();
  env.store.pgbuddy_listings = JSON.stringify(payload());
  api.loadCachedPGs();
  const before = api.getPgData()[0].name;
  api.setFetch(async () => ({ ok: true, json: async () => ({ version: 9, pgs: [{ id: 1 }] }) }));
  return api.refreshPGs().then(ok => {
    assert.equal(ok, false);
    assert.equal(api.getPgData()[0].name, before);
    assert.equal(JSON.parse(env.store.pgbuddy_listings).pgs[0].name, before, 'a bad payload must not poison the cache');
  });
});

check('a thrown fetch is caught', async () => {
  reset();
  api.setFetch(async () => { throw new Error('offline'); });
  return api.refreshPGs().then(ok => assert.equal(ok, false));
});

check('listingContact is read from the payload', async () => {
  reset();
  api.setFetch(async () => ({ ok: true, json: async () => payload({ listingContact: { whatsapp: '919999900000', email: 'a@b.c' } }) }));
  return api.refreshPGs().then(() => {
    assert.equal(api.LISTING_CONTACT.whatsapp, '919999900000');
    assert.equal(api.LISTING_CONTACT.email, 'a@b.c');
  });
});

/* ---------------- contact intent ---------------- */

const withPG = (over) => {
  reset();
  env.store.pgbuddy_listings = JSON.stringify({ version: 1, pgs: [{ ...goodPG(), id: 7, ...over }] });
  api.loadCachedPGs();
};

check('a blank number warns instead of opening an empty chat', () => {
  withPG({ phone: '' });
  api.contactPG(7);
  assert.equal(env.opened.length, 0);
  assert.match(env.toasts.at(-1)[0], /No contact number/);
});

check('a 10-digit Indian mobile gets the country code', () => {
  withPG({ phone: '9876543210', name: 'Sri Lakshmi PG', area: 'Koramangala' });
  api.contactPG(7);
  assert.equal(env.opened.length, 1);
  assert.ok(env.opened[0].startsWith('https://wa.me/919876543210?text='), env.opened[0]);
});

check('an already-international number is not double-prefixed', () => {
  withPG({ phone: '+91 98765 43210' });
  api.contactPG(7);
  assert.ok(env.opened[0].startsWith('https://wa.me/919876543210?'), env.opened[0]);
});

check('punctuation and spaces are stripped', () => {
  withPG({ phone: '(080) 4123-4567' });
  api.contactPG(7);
  assert.ok(/wa\.me\/\d+\?/.test(env.opened[0]), env.opened[0]);
  assert.ok(!/[()\-\s]/.test(env.opened[0].split('?')[0]));
});

check('the prefilled message names the PG and area', () => {
  withPG({ phone: '9876543210', name: 'Sai Comfort PG', area: 'BTM Layout' });
  api.contactPG(7);
  const text = decodeURIComponent(env.opened[0].split('text=')[1]);
  assert.ok(text.includes('Sai Comfort PG'), text);
  assert.ok(text.includes('BTM Layout'), text);
});

check('contactPG falls back to the open detail modal when given no id', () => {
  withPG({ phone: '9876543210' });
  api.setDetail(7);
  api.contactPG();
  assert.equal(env.opened.length, 1);
});

/* ---------------- owner submission ---------------- */

const fill = (over = {}) => {
  reset();
  env.fields = { ownerPgName: 'New PG', ownerPgArea: 'HSR Layout', ownerPgRent: '9000', ownerName: 'Asha', ownerPhone: '9876543210', ...over };
};

check('a complete submission opens a prefilled WhatsApp intent', () => {
  fill();
  api.submitListing();
  assert.equal(env.opened.length, 1);
  const text = decodeURIComponent(env.opened[0].split('text=')[1]);
  for (const bit of ['New PG', 'HSR Layout', '9,000', 'Asha', '9876543210']) {
    assert.ok(text.includes(bit), `message missing ${bit}: ${text}`);
  }
});

check('email mode uses mailto with a subject', () => {
  fill();
  api.submitListing('email');
  assert.ok(env.opened[0].startsWith('mailto:'), env.opened[0]);
  assert.ok(env.opened[0].includes('subject='));
});

check('name and area are required', () => {
  fill({ ownerPgName: '' });
  api.submitListing();
  assert.equal(env.opened.length, 0);
  fill({ ownerPgArea: '  ' });
  api.submitListing();
  assert.equal(env.opened.length, 0);
});

check('a short or junk phone number is rejected', () => {
  for (const phone of ['', '123', 'abcdefghij', '98765']) {
    fill({ ownerPhone: phone });
    api.submitListing();
    assert.equal(env.opened.length, 0, `accepted bad phone: ${phone}`);
  }
});

check('a junk rent is rejected but a blank one is allowed', () => {
  fill({ ownerPgRent: '-500' });
  api.submitListing();
  assert.equal(env.opened.length, 0, 'negative rent must be rejected');

  fill({ ownerPgRent: '' });
  api.submitListing();
  assert.equal(env.opened.length, 1, 'rent is optional');
  assert.ok(decodeURIComponent(env.opened[0]).includes('not given'));
});

let n = 0;
for (const [name, fn] of cases) {
  try {
    await fn();
  } catch (e) {
    console.error(`FAIL — ${name}\n  ${e.message}`);
    process.exit(1);
  }
  n++;
}
console.log(`PASS — ${n} cases`);
