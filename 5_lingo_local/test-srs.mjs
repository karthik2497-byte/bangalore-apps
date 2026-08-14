#!/usr/bin/env node
// Checks the SM-2-lite scheduler in index.html. Run: node 5_lingo_local/test-srs.mjs
// The functions are pulled out of index.html, never copied — a copy would pass
// forever while the shipped scheduler rotted.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const APP = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(APP, 'index.html'), 'utf8');

function extract(startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a);
  assert.ok(a >= 0 && b > a, `block not found: ${startMarker}`);
  return src.slice(a, b);
}

const block = extract('const DAY = 86400000;', '/* =============================================');
const state = { srs: {} };
const store = {};
const localStorage = { setItem: (k, v) => (store[k] = v), getItem: (k) => store[k] ?? null };

const { srsFor, gradeSrs, reviewOrder, today } = new Function(
  'state', 'localStorage',
  `${block}; return { srsFor, gradeSrs, reviewOrder, today };`
)(state, localStorage);

let n = 0;
const check = (name, fn) => { fn(); n++; };
const T = today();

check('unseen phrase is due now with default ease', () => {
  const c = srsFor('x_0');
  assert.equal(c.ease, 2.5);
  assert.equal(c.interval, 0);
  assert.equal(c.due, 0);
  assert.equal(c.reps, 0);
});

check('srsFor does not create state as a side effect', () => {
  srsFor('never_touched_0');
  assert.equal(state.srs.never_touched_0, undefined);
});

check('first success schedules tomorrow', () => {
  gradeSrs('a_0', 5);
  assert.equal(state.srs.a_0.reps, 1);
  assert.equal(state.srs.a_0.interval, 1);
  assert.equal(state.srs.a_0.due, T + 1);
});

check('second success schedules 3 days out', () => {
  gradeSrs('a_0', 5);
  assert.equal(state.srs.a_0.interval, 3);
  assert.equal(state.srs.a_0.due, T + 3);
});

check('third success multiplies by ease', () => {
  const ease = state.srs.a_0.ease;
  gradeSrs('a_0', 5);
  assert.equal(state.srs.a_0.interval, Math.round(3 * ease));
});

check('quality 5 raises ease, quality 4 leaves it flat', () => {
  gradeSrs('e5_0', 5);
  gradeSrs('e4_0', 4);
  assert.ok(state.srs.e5_0.ease > 2.5, 'grade 5 should raise ease');
  assert.equal(Number(state.srs.e4_0.ease.toFixed(10)), 2.5, 'grade 4 is neutral');
});

check('failure resets reps, relearns tomorrow, drops ease', () => {
  gradeSrs('f_0', 5);
  gradeSrs('f_0', 5);
  gradeSrs('f_0', 5);
  const before = state.srs.f_0.ease;
  gradeSrs('f_0', 2);
  assert.equal(state.srs.f_0.reps, 0);
  assert.equal(state.srs.f_0.interval, 1);
  assert.equal(state.srs.f_0.due, T + 1);
  assert.ok(state.srs.f_0.ease < before, 'a wrong answer must cost ease');
});

check('ease floor holds at 1.3', () => {
  for (let i = 0; i < 30; i++) gradeSrs('floor_0', 2);
  assert.ok(state.srs.floor_0.ease >= 1.3, `ease fell to ${state.srs.floor_0.ease}`);
});

check('ease ceiling holds at 2.8', () => {
  for (let i = 0; i < 30; i++) gradeSrs('ceil_0', 5);
  assert.ok(state.srs.ceil_0.ease <= 2.8, `ease rose to ${state.srs.ceil_0.ease}`);
});

check('intervals grow monotonically on repeated success', () => {
  const seen = [];
  for (let i = 0; i < 6; i++) { gradeSrs('grow_0', 5); seen.push(state.srs.grow_0.interval); }
  for (let i = 1; i < seen.length; i++) {
    assert.ok(seen[i] >= seen[i - 1], `interval shrank: ${seen.join(',')}`);
  }
});

check('every grade persists to localStorage', () => {
  gradeSrs('persist_0', 5);
  assert.deepEqual(JSON.parse(store.ll_srs).persist_0, state.srs.persist_0);
});

const scenario = { id: 's', phrases: [{}, {}, {}, {}] };

check('unseen phrases lead the deck, scheduled ones trail', () => {
  state.srs['s_0'] = { ease: 2.5, interval: 10, due: T + 10, reps: 3 };
  state.srs['s_2'] = { ease: 2.5, interval: 1, due: T + 1, reps: 1 };
  assert.deepEqual(reviewOrder(scenario), [1, 3, 2, 0]);
});

check('most overdue comes first', () => {
  state.srs['s_0'] = { ease: 2.5, interval: 1, due: T - 5, reps: 1 };
  state.srs['s_1'] = { ease: 2.5, interval: 1, due: T - 1, reps: 1 };
  state.srs['s_2'] = { ease: 2.5, interval: 1, due: T - 9, reps: 1 };
  state.srs['s_3'] = { ease: 2.5, interval: 1, due: T + 4, reps: 1 };
  assert.deepEqual(reviewOrder(scenario), [2, 0, 1, 3]);
});

check('ties keep the authored order', () => {
  for (const k of ['s_0', 's_1', 's_2', 's_3']) state.srs[k] = { ease: 2.5, interval: 1, due: T, reps: 1 };
  assert.deepEqual(reviewOrder(scenario), [0, 1, 2, 3]);
});

check('reviewOrder is a permutation, never drops or duplicates a phrase', () => {
  const order = reviewOrder(scenario);
  assert.equal(order.length, scenario.phrases.length);
  assert.deepEqual([...order].sort(), [0, 1, 2, 3]);
});

console.log(`PASS — ${n} scheduler cases`);
