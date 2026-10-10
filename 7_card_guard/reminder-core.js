/* CardGuard shared core — due-date maths and reminder selection.
   One implementation, loaded three ways, so it stays dependency-free:
     page:            <script src="reminder-core.js">
     service worker:  importScripts('./reminder-core.js')
     tests:           evaluated by test-cardguard.mjs
   The service worker cannot read localStorage, which is why this file exists:
   before it, the "which bills are due" rule lived only in the page and a
   background reminder would have had to re-implement it. */
(function (root) {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  function startOfDay(now) {
    var d = new Date(now || Date.now());
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  /* Next occurrence of `dueDay`, today included. A bill due today is due
     today — rolling it to next month is the bug fixed on 2026-07-11. */
  function nextDueDate(dueDay, now) {
    var today = startOfDay(now);
    var y = today.getFullYear(), m = today.getMonth();
    var due = new Date(y, m, Math.min(dueDay, daysInMonth(y, m)));
    if (due < today) {
      due = new Date(y, m + 1, Math.min(dueDay, daysInMonth(y, m + 1)));
    }
    return due;
  }

  function daysUntilDue(dueDay, now) {
    return Math.round((nextDueDate(dueDay, now) - startOfDay(now)) / 86400000);
  }

  function keyFor(cardId, d) {
    return cardId + '_' + d.getFullYear() + '_' + d.getMonth() + '_' + d.getDate();
  }

  function cycleKey(cardId, dueDay, now) {
    return keyFor(cardId, nextDueDate(dueDay, now));
  }

  /* RBI credit-card directions (2022, amended 2024, para 9(b)(v)): no late fee
     and no "past due" report to the bureaus until a bill is MORE than three
     days late. Paying on day 1-3 after the due date still avoids both. */
  var GRACE_DAYS = 3;
  // ponytail: an unpaid bill stays the current cycle this long after its due
  // date, so a late "Mark as Paid" lands on the bill actually paid. By then the
  // next statement has normally rolled the dues in; tune if users disagree.
  var OVERDUE_DAYS = 10;

  /* The bill the user is dealing with now: the next due date, unless the
     previous one is unpaid and at most OVERDUE_DAYS behind. Before this, the
     cycle jumped to next month the day after the due date, so a late payment
     was recorded against NEXT month and silenced its reminder. daysLeft is
     negative while overdue. */
  function currentCycle(card, now, paidKeys) {
    var today = startOfDay(now);
    var next = nextDueDate(card.dueDay, now);
    var py = next.getFullYear(), pm = next.getMonth() - 1;
    var prev = new Date(py, pm, Math.min(card.dueDay, daysInMonth(py, pm)));
    var late = Math.round((today - prev) / 86400000);
    var prevKey = keyFor(card.id, prev);
    // A card added after that due date cannot be overdue for it.
    var addedBefore = !card.addedAt || startOfDay(card.addedAt) <= prev;
    if (late >= 1 && late <= OVERDUE_DAYS && addedBefore && (paidKeys || []).indexOf(prevKey) === -1) {
      return { date: prev, daysLeft: -late, key: prevKey, overdue: true, inGrace: late <= GRACE_DAYS };
    }
    return { date: next, daysLeft: Math.round((next - today) / 86400000), key: keyFor(card.id, next), overdue: false, inGrace: false };
  }

  /* Days left to pay without a late fee, today included (3 on the first day late). */
  function graceDaysLeft(cycle) {
    return cycle.overdue ? GRACE_DAYS + cycle.daysLeft + 1 : null;
  }

  /* Locale-independent, unlike Date#toDateString. */
  function dayStamp(now) {
    var d = startOfDay(now);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function notifyKey(cardId, now) {
    return cardId + '_' + dayStamp(now);
  }

  function formatDate(date) {
    var d = new Date(date);
    return d.getDate() + ' ' + MONTHS[d.getMonth()].substring(0, 3) + ' ' + d.getFullYear();
  }

  function formatCurrency(amount) {
    if (!amount && amount !== 0) return '₹ --';
    return '₹' + Number(amount).toLocaleString('en-IN');
  }

  function cardLabel(card) {
    return card.nickname || card.bank + ' Card';
  }

  /* The whole reminder rule, in one place.
     state = { cards, settings, paidCycleKeys[], notified{} } — exactly what
     the page mirrors into Cache Storage for the worker to read. */
  function dueReminders(state, now) {
    var settings = (state && state.settings) || {};
    if (!settings.notifications) return [];
    var remindDays = settings.remindDays == null ? 3 : settings.remindDays;
    var paid = state.paidCycleKeys || [];
    var notified = state.notified || {};
    var out = [];

    (state.cards || []).forEach(function (card) {
      // Cards can arrive from an imported backup file, so the day is checked
      // here rather than trusted. Out of range and the date maths walks
      // backwards and reminds forever.
      if (!card || !(card.dueDay >= 1 && card.dueDay <= 31)) return;
      var cyc = currentCycle(card, now, paid);
      // Overdue reminds only while paying still avoids the late fee.
      if (cyc.overdue ? !cyc.inGrace : cyc.daysLeft > remindDays) return;
      if (paid.indexOf(cyc.key) !== -1) return;
      var key = notifyKey(card.id, now);
      if (notified[key]) return;

      var amount = card.typicalAmount ? ' of ' + formatCurrency(card.typicalAmount) : '';
      var days = cyc.daysLeft, body;
      if (cyc.overdue) {
        var left = graceDaysLeft(cyc);
        body = '⚠️ ' + cardLabel(card) + amount + ' is overdue. Pay ' +
          (left === 1 ? 'today' : 'within ' + left + ' days') + ' to avoid a late fee.';
      } else {
        var when = days === 0 ? 'due today' : 'due in ' + days + ' day' + (days === 1 ? '' : 's');
        body = '💳 ' + cardLabel(card) + amount + ' is ' + when + '!';
      }
      out.push({
        cardId: card.id,
        key: key,
        daysLeft: days,
        overdue: cyc.overdue,
        title: cyc.overdue ? 'CardGuard: bill overdue' : 'CardGuard Reminder',
        body: body
      });
    });
    return out;
  }

  /* Drops yesterday's dedupe keys so the map cannot grow forever. */
  function pruneNotified(notified, now) {
    var suffix = '_' + dayStamp(now);
    var kept = {};
    Object.keys(notified || {}).forEach(function (k) {
      if (k.slice(-suffix.length) === suffix) kept[k] = 1;
    });
    return kept;
  }

  root.CardGuardCore = {
    MONTHS: MONTHS,
    nextDueDate: nextDueDate,
    daysUntilDue: daysUntilDue,
    cycleKey: cycleKey,
    currentCycle: currentCycle,
    graceDaysLeft: graceDaysLeft,
    GRACE_DAYS: GRACE_DAYS,
    notifyKey: notifyKey,
    dayStamp: dayStamp,
    formatDate: formatDate,
    formatCurrency: formatCurrency,
    cardLabel: cardLabel,
    dueReminders: dueReminders,
    pruneNotified: pruneNotified
  };
})(typeof self !== 'undefined' ? self : globalThis);
