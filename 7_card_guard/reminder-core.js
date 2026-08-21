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

  function cycleKey(cardId, dueDay, now) {
    var d = nextDueDate(dueDay, now);
    return cardId + '_' + d.getFullYear() + '_' + d.getMonth() + '_' + d.getDate();
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
      var days = daysUntilDue(card.dueDay, now);
      if (days > remindDays) return;
      if (paid.indexOf(cycleKey(card.id, card.dueDay, now)) !== -1) return;
      var key = notifyKey(card.id, now);
      if (notified[key]) return;

      var amount = card.typicalAmount ? ' of ' + formatCurrency(card.typicalAmount) : '';
      var when = days === 0 ? 'due today' : 'due in ' + days + ' day' + (days === 1 ? '' : 's');
      out.push({
        cardId: card.id,
        key: key,
        daysLeft: days,
        title: 'CardGuard Reminder',
        body: '💳 ' + cardLabel(card) + amount + ' is ' + when + '!'
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
    notifyKey: notifyKey,
    dayStamp: dayStamp,
    formatDate: formatDate,
    formatCurrency: formatCurrency,
    cardLabel: cardLabel,
    dueReminders: dueReminders,
    pruneNotified: pruneNotified
  };
})(typeof self !== 'undefined' ? self : globalThis);
