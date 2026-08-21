#!/usr/bin/env node
// Checks the shared reminder core (due-date maths, reminder selection, dedupe)
// and the premium gate pulled out of index.html.
// Run: node 7_card_guard/test-cardguard.mjs
// Code is loaded from the real files, never copied.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const APP = dirname(fileURLToPath(import.meta.url));

// ---- the core, exactly as the page and the service worker load it ----
const coreSrc = readFileSync(join(APP, 'reminder-core.js'), 'utf8');
const core = new Function(`const self = {}; ${coreSrc}; return self.CardGuardCore;`)();

// ---- the premium gate, lifted out of index.html ----
const html = readFileSync(join(APP, 'index.html'), 'utf8');
function slice(from, to) {
  const a = html.indexOf(from);
  const b = html.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `block not found: ${from}`);
  return html.slice(a, b);
}
const gate = new Function('state', `
  ${slice('const FREE_CARD_LIMIT', 'const PREMIUM')}
  const settings = state.settings, cards = state.cards;
  ${slice('function isPremium()', 'function grantPremium')}
  return { isPremium, cardLimitReached, FREE_CARD_LIMIT };
`);

let n = 0;
const check = (name, fn) => { fn(); n++; };
const at = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0);

/* ---------------- due-date maths (the 2026-07-11 bug lives here) ---------------- */

check('a bill due today is due today, not in ~30 days', () => {
  assert.equal(core.daysUntilDue(15, at(2026, 8, 15)), 0);
});

check('a bill due tomorrow is one day out', () => {
  assert.equal(core.daysUntilDue(16, at(2026, 8, 15)), 1);
});

check('a passed due day rolls to next month', () => {
  assert.equal(core.daysUntilDue(10, at(2026, 8, 15)), 26); // 10 Sep
  assert.equal(core.nextDueDate(10, at(2026, 8, 15)).getMonth(), 8);
});

check('day 31 clamps to the last day of a short month', () => {
  const due = core.nextDueDate(31, at(2026, 9, 5)); // September has 30 days
  assert.equal(due.getDate(), 30);
  assert.equal(due.getMonth(), 8);
});

check('day 31 clamps when it rolls into February', () => {
  const due = core.nextDueDate(31, at(2027, 2, 1));
  assert.equal(due.getDate(), 28);
  assert.equal(due.getMonth(), 1);
});

check('DST-free arithmetic: a full month never reads as 29.9 days', () => {
  // Round, not ceil — India has no DST but the device clock may not be IST.
  for (let d = 1; d <= 28; d++) {
    const days = core.daysUntilDue(d, at(2026, 3, d));
    assert.equal(days, 0, 'same-day must be 0 on day ' + d);
  }
});

check('the cycle key changes when the cycle does', () => {
  const a = core.cycleKey('c1', 15, at(2026, 8, 10));
  const b = core.cycleKey('c1', 15, at(2026, 8, 16));
  assert.notEqual(a, b, 'after the due date passes, the next cycle is a new key');
});

check('the cycle key is stable within one cycle', () => {
  assert.equal(core.cycleKey('c1', 15, at(2026, 8, 10)), core.cycleKey('c1', 15, at(2026, 8, 14)));
});

/* ---------------- reminder selection (page and worker share this) ---------------- */

const card = (over = {}) => Object.assign({
  id: 'c1', bank: 'HDFC', nickname: 'Shopping Card', last4: '4321', dueDay: 15, typicalAmount: 12000
}, over);

const state = (over = {}) => Object.assign({
  cards: [card()],
  settings: { notifications: true, remindDays: 3 },
  paidCycleKeys: [],
  notified: {}
}, over);

check('a bill inside the reminder window is reported', () => {
  const due = core.dueReminders(state(), at(2026, 8, 13));
  assert.equal(due.length, 1);
  assert.match(due[0].body, /Shopping Card/);
  assert.match(due[0].body, /₹12,000/);
  assert.match(due[0].body, /due in 2 days/);
});

check('a bill outside the window is silent', () => {
  assert.equal(core.dueReminders(state(), at(2026, 8, 10)).length, 0);
});

check('a wider remindDays widens the window', () => {
  const s = state({ settings: { notifications: true, remindDays: 7 } });
  assert.equal(core.dueReminders(s, at(2026, 8, 10)).length, 1);
});

check('due today says "due today", not "due in 0 days"', () => {
  const due = core.dueReminders(state(), at(2026, 8, 15));
  assert.equal(due.length, 1);
  assert.match(due[0].body, /due today/);
  assert.doesNotMatch(due[0].body, /0 day/);
});

check('one day out is singular', () => {
  assert.match(core.dueReminders(state(), at(2026, 8, 14))[0].body, /due in 1 day!/);
});

check('a paid cycle never reminds', () => {
  const s = state({ paidCycleKeys: [core.cycleKey('c1', 15, at(2026, 8, 13))] });
  assert.equal(core.dueReminders(s, at(2026, 8, 13)).length, 0);
});

check('paying one cycle does not silence the next one', () => {
  const s = state({ paidCycleKeys: [core.cycleKey('c1', 15, at(2026, 8, 13))] });
  assert.equal(core.dueReminders(s, at(2026, 9, 13)).length, 1, 'September must still remind');
});

check('reminders off means nothing fires', () => {
  const s = state({ settings: { notifications: false, remindDays: 3 } });
  assert.equal(core.dueReminders(s, at(2026, 8, 15)).length, 0);
});

check('an already-notified card stays quiet for the rest of the day', () => {
  const key = core.notifyKey('c1', at(2026, 8, 14));
  const s = state({ notified: { [key]: 1 } });
  assert.equal(core.dueReminders(s, at(2026, 8, 14)).length, 0);
});

check("yesterday's notification does not silence today", () => {
  const s = state({ notified: { [core.notifyKey('c1', at(2026, 8, 13))]: 1 } });
  assert.equal(core.dueReminders(s, at(2026, 8, 14)).length, 1);
});

check('a card with no amount still reminds, without a stray "of"', () => {
  const s = state({ cards: [card({ typicalAmount: 0 })] });
  const due = core.dueReminders(s, at(2026, 8, 14));
  assert.equal(due.length, 1);
  assert.doesNotMatch(due[0].body, / of /);
});

check('each card gets its own reminder and its own dedupe key', () => {
  const s = state({ cards: [card(), card({ id: 'c2', nickname: 'Travel Card', dueDay: 16 })] });
  const due = core.dueReminders(s, at(2026, 8, 14));
  assert.equal(due.length, 2);
  assert.notEqual(due[0].key, due[1].key);
});

check('a malformed card is skipped rather than crashing the whole check', () => {
  const s = state({ cards: [card(), { id: 'bad' }] });
  assert.equal(core.dueReminders(s, at(2026, 8, 14)).length, 1);
});

check('an out-of-range due day from an imported backup is ignored', () => {
  // A negative day walks nextDueDate into the past, which would otherwise
  // produce a reminder every single check, forever.
  for (const bad of [-5, 0, 32, 99, 'x', null]) {
    const s = state({ cards: [card({ dueDay: bad })] });
    assert.deepEqual(core.dueReminders(s, at(2026, 8, 14)), [], 'dueDay ' + bad);
  }
});

check('missing settings fall back to the 3-day default, not to silence', () => {
  const s = state({ settings: { notifications: true } });
  assert.equal(core.dueReminders(s, at(2026, 8, 13)).length, 1);
  assert.equal(core.dueReminders(s, at(2026, 8, 11)).length, 0);
});

check('an empty state is safe (fresh worker, nothing mirrored yet)', () => {
  assert.deepEqual(core.dueReminders({}, at(2026, 8, 14)), []);
  assert.deepEqual(core.dueReminders({ settings: { notifications: true } }, at(2026, 8, 14)), []);
});

/* ---------------- dedupe bookkeeping ---------------- */

check('pruning keeps today and drops everything older', () => {
  const kept = core.notifyKey('c1', at(2026, 8, 14));
  const old = core.notifyKey('c1', at(2026, 8, 13));
  const pruned = core.pruneNotified({ [kept]: 1, [old]: 1 }, at(2026, 8, 14));
  assert.deepEqual(Object.keys(pruned), [kept]);
});

check('pruning an empty record is not an error', () => {
  assert.deepEqual(core.pruneNotified(undefined, at(2026, 8, 14)), {});
});

check('the day stamp does not depend on the hour', () => {
  assert.equal(core.dayStamp(new Date(2026, 7, 14, 0, 5)), core.dayStamp(new Date(2026, 7, 14, 23, 55)));
});

/* ---------------- premium gate (the money path) ---------------- */

check('the free plan stops at the card limit', () => {
  const g = gate({ settings: {}, cards: [1, 2] });
  assert.equal(g.FREE_CARD_LIMIT, 2);
  assert.equal(g.cardLimitReached(), true);
});

check('the free plan allows cards below the limit', () => {
  assert.equal(gate({ settings: {}, cards: [1] }).cardLimitReached(), false);
});

check('premium removes the limit entirely', () => {
  assert.equal(gate({ settings: { premium: true }, cards: [1, 2, 3, 4, 5] }).cardLimitReached(), false);
});

check('only an exact true unlocks premium — a stray truthy value does not', () => {
  assert.equal(gate({ settings: { premium: 'yes' }, cards: [1, 2] }).isPremium(), false);
  assert.equal(gate({ settings: { premium: 1 }, cards: [1, 2] }).cardLimitReached(), true);
});

check('a settings blob with no premium field is a free plan', () => {
  assert.equal(gate({ settings: {}, cards: [] }).isPremium(), false);
});

/* ---------------- formatting ---------------- */

check('currency uses the Indian grouping', () => {
  assert.equal(core.formatCurrency(120000), '₹1,20,000');
});

check('a missing amount renders as a placeholder, not NaN', () => {
  assert.equal(core.formatCurrency(null), '₹ --');
  assert.equal(core.formatCurrency(0), '₹0');
});

console.log(`PASS — ${n} cases`);
