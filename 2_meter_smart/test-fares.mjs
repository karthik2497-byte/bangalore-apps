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
  'a real rate revision':  clone(c => { c.version = 99; c.fare.baseFare = 40; c.fare.perKm = 22; })
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

const bad = clone(c => { c.version = 99; c.fare.perKm = -1; });      // valid version, poisoned rate
const stale = clone(c => { c.version = 1; c.fare.perKm = 999; });    // valid, but not newer
const fresh = clone(c => { c.version = 7; c.fare.perKm = 22; });

const cases = [
  ['nothing cached, nothing served', {},                          15, false],
  ['served config is invalid',       { served: bad },             15, false],
  ['served config is not newer',     { served: stale },           15, false],
  ['fetch 404s',                     { served: fresh, ok: false }, 15, false],
  ['cache is corrupt',               { cached: { junk: true } },  15, false],
  ['cache is newer but poisoned',    { cached: bad },             15, false],
  ['cache is same version',          { cached: stale },           15, false],
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

console.log(`PASS — ${Object.keys(rejected).length} rejected, ${Object.keys(accepted).length} accepted, ` +
  `${cases.length} load-path cases, fares.json v${good.version} valid`);
