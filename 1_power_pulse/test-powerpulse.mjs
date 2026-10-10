#!/usr/bin/env node
// Checks the outage-log maths in index.html: 12 h expiry and the Patterns tab,
// which is now derived from outages logged on this phone.
// Run: node 1_power_pulse/test-powerpulse.mjs
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
const code = slice('  const EXPIRE_MS', '  function saveOutages()') + slice('  const WEEKDAYS', '  function esc(s)');
const make = (active, resolved = []) => new Function('activeOutages', 'resolvedOutages', `
  ${code}
  return { expireOld, getPatternData, state: () => ({ active: activeOutages, resolved: resolvedOutages }) };
`)(active, resolved);

let n = 0;
const check = (name, fn) => { fn(); n++; };
const H = 3600000;
const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const outage = (over) => ({ id: Date.now() + Math.random(), area: 'HSR Layout', type: 'power', reports: 1, severity: 2, description: '', ...over });

check('an outage older than 12 h ends, marked as not logged', () => {
  const old = outage({ firstReported: Date.now() - 13 * H });
  const fresh = outage({ firstReported: Date.now() - 1 * H });
  const s = make([old, fresh]).state();       // construction runs expireOld() once
  assert.equal(s.active.length, 1);
  assert.equal(s.active[0], fresh);
  assert.equal(s.resolved[0].autoExpired, true);
  assert.equal(s.resolved[0].resolvedAt, old.firstReported + 12 * H);
});
check('expireOld reports whether anything changed', () => {
  const app = make([outage({ firstReported: Date.now() - H })]);
  assert.equal(app.expireOld(), false);
});
check('patterns count only this area, by weekday Mon..Sun', () => {
  // 2026-10-06 is a Tuesday, 2026-10-09 a Friday.
  const app = make([], [
    outage({ firstReported: at(2026, 10, 6, 14), resolvedAt: at(2026, 10, 6, 16) }),
    outage({ firstReported: at(2026, 10, 6, 13) }),
    outage({ firstReported: at(2026, 10, 9, 12, 30) }),
    outage({ area: 'Koramangala', firstReported: at(2026, 10, 7, 9) })
  ]);
  const p = app.getPatternData('HSR Layout');
  assert.deepEqual(p.weekly, [0, 2, 0, 0, 1, 0, 0]);
  assert.equal(p.history.length, 3);
});
check('the usual window needs 3 logged outages, then names the busiest day and 3-hour block', () => {
  const two = make([], [outage({ firstReported: at(2026, 10, 6, 14) }), outage({ firstReported: at(2026, 10, 6, 13) })]);
  assert.equal(two.getPatternData('HSR Layout').busiest, null, 'two outages are not a pattern');
  const three = make([], [
    outage({ firstReported: at(2026, 10, 6, 14) }), outage({ firstReported: at(2026, 10, 6, 13) }),
    outage({ firstReported: at(2026, 10, 9, 12, 30) })
  ]);
  assert.deepEqual(three.getPatternData('HSR Layout').busiest, { day: 'Tue', time: '12 PM – 3 PM', count: 3 });
});
check('late-night blocks label past midnight correctly', () => {
  const app = make([], [21, 22, 23].map(h => outage({ firstReported: at(2026, 10, 6, h) })));
  assert.equal(app.getPatternData('HSR Layout').busiest.time, '9 PM – 12 AM');
});
check('history is newest first and capped at 10', () => {
  const list = Array.from({ length: 14 }, (_, i) => outage({ firstReported: at(2026, 9, 1 + i, 10) }));
  const h = make([], list).getPatternData('HSR Layout').history;
  assert.equal(h.length, 10);
  assert.ok(h[0].firstReported > h[9].firstReported);
});
check('an area with nothing logged has no pattern', () => {
  const p = make([]).getPatternData('Whitefield');
  assert.deepEqual([p.weekly.reduce((a, b) => a + b, 0), p.busiest, p.history.length], [0, null, 0]);
});
console.log(`PASS — ${n} cases`);
