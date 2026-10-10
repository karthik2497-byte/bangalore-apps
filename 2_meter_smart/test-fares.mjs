/**
 * Check for MeterSmart's remote fare config.
 *   node 2_meter_smart/test-fares.mjs
 *
 * validRates() is the only thing standing between a typo in fares.json and every
 * installed client silently rendering wrong fares, so it gets a real test. The
 * validator is pulled straight out of index.html — no copy to drift out of sync.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'index.html'), 'utf8');

const grab = (name) => {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start > -1, `${name}() not found in index.html`);
  const end = html.indexOf('\n}', start);
  return html.slice(start, end + 2);
};
const validRates = new Function(`${grab('validRates')}; return validRates;`)();

const good = JSON.parse(readFileSync(join(here, 'fares.json'), 'utf8'));
const clone = (mut) => { const c = JSON.parse(JSON.stringify(good)); mut(c); return c; };

// The shipped config must itself be valid, or the deploy is already broken.
assert.ok(validRates(good), 'shipped fares.json fails validation');

// ...and it must not be inert: clients only accept a version above the bundled one.
const bundled = /version:\s*(\d+)/.exec(html.slice(html.indexOf('const DEFAULT_RATES')));
assert.ok(good.version >= Number(bundled[1]),
  `fares.json v${good.version} is below bundled DEFAULT_RATES v${bundled[1]} — clients would ignore it`);

const rejected = {
  'null':                 null,
  'no version':           clone(c => delete c.version),
  'version as string':    clone(c => c.version = '2'),
  'no fare block':        clone(c => delete c.fare),
  'negative perKm':       clone(c => c.fare.perKm = -5),
  'zero perKm':           clone(c => c.fare.perKm = 0),
  'NaN baseFare':         clone(c => c.fare.baseFare = NaN),
  'absurd nightMult':     clone(c => c.fare.nightMultiplier = 9),
  'nightMult below 1':    clone(c => c.fare.nightMultiplier = 0.5),
  'missing nightStart':   clone(c => delete c.fare.nightStartHour),
  'nightStart = 25':      clone(c => c.fare.nightStartHour = 25),
  'nightEnd negative':    clone(c => c.fare.nightEndHour = -3),
  'nightStart fractional':clone(c => c.fare.nightStartHour = 22.5),
  'zero waiting unit':    clone(c => c.fare.waitingUnitMinutes = 0),
  'negative free minutes': clone(c => c.fare.waitingFreeMinutes = -5),
  'luggage cap fractional': clone(c => c.fare.luggageMaxUnits = 1.5),
  'appEstimates not array': clone(c => c.appEstimates = 'nope'),
  'estimate min a string':  clone(c => c.appEstimates[0].min = 'oops'),
  'estimate max null':      clone(c => c.appEstimates[0].max = null),
  'estimate max < min':     clone(c => { c.appEstimates[0].min = 1.5; c.appEstimates[0].max = 1.0; }),
  'estimate nameless':      clone(c => c.appEstimates[0].name = ''),
  'estimate fee a string':  clone(c => c.appEstimates[0].fee = '10'),
  'whatsapp as number':     clone(c => c.complaint.whatsapp = 919480801000),
  'email as null':          clone(c => c.complaint.email = null)
};
for (const [why, cfg] of Object.entries(rejected)) {
  assert.strictEqual(validRates(cfg), false, `validRates should reject: ${why}`);
}

const accepted = {
  'shipped config':        good,
  'no appEstimates key':   clone(c => delete c.appEstimates),
  'no complaint key':      clone(c => delete c.complaint),
  'empty complaint':       clone(c => c.complaint = {}),
  'empty appEstimates':    clone(c => c.appEstimates = []),
  'estimate without fee':  clone(c => delete c.appEstimates[0].fee),
  'a real rate revision':  clone(c => { c.version = 99; c.fare.baseFare = 40; c.fare.perKm = 22; }),
  'v1 shape (no free minutes, no luggage cap)': clone(c => { delete c.fare.waitingFreeMinutes; delete c.fare.luggageMaxUnits; })
};
for (const [why, cfg] of Object.entries(accepted)) {
  assert.strictEqual(validRates(cfg), true, `validRates should accept: ${why}`);
}

/* ------------------------------------------------------------------
   The validator is only worth anything if the load path actually gates on
   it. Run the real loadCachedRates/refreshRates against stub storage and
   network — a bad or stale config must leave FARE_RULES untouched.
   ------------------------------------------------------------------ */
const slab = (from, to) => {
  const a = html.indexOf(from), b = html.indexOf(to, a);
  assert.ok(a > -1 && b > -1, `could not slice ${from} .. ${to}`);
  return html.slice(a, b + to.length);
};

// Fresh module-ish scope per case, so one case can't leak rates into the next.
function pipeline({ cached = null, served = null, ok = true } = {}) {
  const stubs = `
    const localStorage = {
      _v: ${JSON.stringify(cached === null ? null : JSON.stringify(cached))},
      getItem() { return this._v; }, setItem(k, v) { this._v = v; }
    };
    const fetch = () => Promise.resolve({
      ok: ${ok},
      json: () => Promise.resolve(${JSON.stringify(served)})
    });
    let toasted = false;
    const renderLabels = () => {}, calculateFare = () => {}, showToast = () => { toasted = true; }, t = () => '';
  `;
  const body = [
    stubs,
    slab('const DEFAULT_RATES', 'let FARE_RULES = RATES.fare;'),
    grab('validRates'), grab('applyRates'), grab('loadCachedRates'), grab('refreshRates'),
    // refreshRates() returns nothing, so let its promise chain drain before reading.
    `loadCachedRates(); refreshRates();
     return new Promise(done => setTimeout(() => done({ RATES, FARE_RULES, toasted, stored: localStorage._v }), 0));`
  ].join('\n');
  return new Function(body)();
}

const BUNDLED = new Function(`${slab('const DEFAULT_RATES', '\n};')}; return DEFAULT_RATES;`)();
const B = BUNDLED.fare.perKm;
assert.notStrictEqual(B, 22, 'fixture below needs a perKm that differs from the bundled one');

const bad = clone(c => { c.version = 99; c.fare.perKm = -1; });      // valid version, poisoned rate
const stale = clone(c => { c.version = BUNDLED.version; c.fare.perKm = 999; });  // valid, but not newer
const fresh = clone(c => { c.version = 7; c.fare.perKm = 22; });

const cases = [
  ['nothing cached, nothing served', {},                          B, false],
  ['served config is invalid',       { served: bad },             B, false],
  ['served config is not newer',     { served: stale },           B, false],
  ['fetch 404s',                     { served: fresh, ok: false }, B, false],
  ['cache is corrupt',               { cached: { junk: true } },  B, false],
  ['cache is newer but poisoned',    { cached: bad },             B, false],
  ['cache is same version',          { cached: stale },           B, false],
  ['cache is valid and newer',       { cached: fresh },           22, false],
  ['served config is valid+newer',   { served: fresh },           22, true ]
];

for (const [why, opts, perKm, toast] of cases) {
  const r = await pipeline(opts);
  assert.strictEqual(r.FARE_RULES.perKm, perKm, `${why}: expected perKm ${perKm}, got ${r.FARE_RULES.perKm}`);
  assert.strictEqual(r.RATES.version === 7, perKm === 22, `${why}: RATES.version out of step with FARE_RULES`);
  assert.strictEqual(r.toasted, toast, `${why}: toast should${toast ? '' : ' not'} have fired`);
}

// An accepted config must also survive to the next launch, or offline users drop
// back to bundled rates every time.
const persisted = await pipeline({ served: fresh });
assert.strictEqual(JSON.parse(persisted.stored).version, 7, 'accepted config was not cached to localStorage');

/* ------------------------------------------------------------------
   The bundled defaults are what an offline first launch charges, so they
   must equal the published file, and the fare maths must reproduce the
   published tariff (Bengaluru, effective 1 Aug 2025).
   ------------------------------------------------------------------ */
assert.deepStrictEqual(BUNDLED.fare, good.fare, 'DEFAULT_RATES.fare in index.html is out of sync with fares.json');
const fareBreakdown = new Function(`${grab('fareBreakdown')}; return fareBreakdown;`)();
const fare = (o) => fareBreakdown(o, good.fare).total;
const tariff = [
  ['2 km is the minimum fare',            { km: 2 },                     36],
  ['10 km: ₹36 + 8 × ₹18',                { km: 10 },                   180],
  ['a started km is charged (2.1 km)',    { km: 2.1 },                   54],
  ['night is 1.5× (10 km)',               { km: 10, night: true },      270],
  ['first 5 min of waiting are free',     { km: 2, waitMinutes: 5 },     36],
  ['minute 6 starts a ₹10 block',         { km: 2, waitMinutes: 6 },     46],
  ['20 min = one 15-min block after 5',   { km: 2, waitMinutes: 20 },    46],
  ['21 min = part of a second block',     { km: 2, waitMinutes: 21 },    56],
  ['one extra 20 kg of luggage',          { km: 2, luggage: 1 },         46],
  ['night applies to the meter, not waiting', { km: 2, waitMinutes: 6, night: true }, 64]
];
for (const [why, o, want] of tariff) assert.strictEqual(fare(o), want, `${why}: got ${fare(o)}, want ${want}`);

console.log(`PASS — ${tariff.length} tariff cases, ${Object.keys(rejected).length} rejected, ${Object.keys(accepted).length} accepted, ` +
  `${cases.length} load-path cases, fares.json v${good.version} valid`);
