const ORIGIN = 'http://localhost:8811';
const URL_ = ORIGIN + '/7_card_guard/index.html';
export default async (t) => {
  await t.grant(ORIGIN, ['notifications']);
  await t.goto(URL_);
  await t.evaluate(() => navigator.serviceWorker.ready.then(() => true));

  // A card added two months ago whose due day was two days ago, unpaid.
  await t.evaluate(() => {
    const due = new Date(); due.setDate(due.getDate() - 2);
    const added = new Date(); added.setMonth(added.getMonth() - 2);
    localStorage.setItem('cardguard_cards', JSON.stringify([{ id: 'abc123', bank: 'HDFC', nickname: 'Shopping', last4: '4321', dueDay: due.getDate(), typicalAmount: 12000, addedAt: added.toISOString() }]));
    localStorage.setItem('cardguard_bills', '[]');
  });
  await t.reload(); await t.sleep(400);
  const a = await t.evaluate(() => ({
    splash: document.getElementById('splash-screen').classList.contains('hidden'),
    badge: document.querySelector('.bill-badge').textContent.trim(),
    countdown: document.querySelector('.countdown-label').textContent,
    days: document.querySelector('.countdown-days').textContent,
    advice: (document.querySelector('.bill-advice') || {}).textContent || '',
    viewport: document.querySelector('meta[name=viewport]').content
  }));
  t.check('splash does not hold the app', a.splash);
  t.check('a bill 2 days late shows as overdue', /Overdue 2d/.test(a.badge) && a.countdown === 'days overdue' && a.days === '2', a);
  t.check('overdue advice names the RBI window', /within 2 days to avoid a late fee/.test(a.advice), a.advice);
  t.check('pinch-zoom allowed', !/user-scalable|maximum-scale/.test(a.viewport));

  // In-page reminder, with the page Notification constructor throwing as on Android.
  const n = await t.evaluate(async () => {
    window.Notification = class extends Notification { constructor() { throw new TypeError("Failed to construct 'Notification': Illegal constructor."); } };
    notified = {};
    await checkAndNotify();
    const reg = await navigator.serviceWorker.getRegistration();
    const shown = await reg.getNotifications();
    return { count: shown.length, body: shown[0] && shown[0].body, title: shown[0] && shown[0].title };
  });
  t.check('reminder shows via the service worker even when new Notification() throws', n.count === 1, n);
  t.check('reminder text is the overdue/grace message', /overdue\. Pay within 2 days/.test(n.body || ''), n.body);

  // Late Mark as Paid lands on THIS cycle, and next month becomes current.
  const p = await t.evaluate(() => {
    const card = cards[0];
    const overdueKey = cycleOf(card).key;
    openPaymentModal(card.id);
    document.getElementById('input-paid-amount').value = 12000;
    confirmPayment();
    const paid = bills.filter(b => b.status === 'paid').map(b => b.cycleKey);
    const next = cycleOf(card);
    return { overdueKey, paid, nextOverdue: next.overdue, nextDays: next.daysLeft };
  });
  t.check('late payment is recorded against the overdue bill', p.paid.length === 1 && p.paid[0] === p.overdueKey, p);
  t.check('after paying, next month is current (not overdue)', p.nextOverdue === false && p.nextDays > 20, p);

  // A crafted backup: script in the id, a fake bank, premium smuggled in settings.
  const im = await t.evaluate(async () => {
    window.__pwned = 0;
    const evil = {
      cards: [
        { id: "x');window.__pwned=1;('", bank: 'HDFC', last4: '1111', dueDay: 5 },
        { id: 'ok1', bank: '<img src=x onerror="window.__pwned=2">', last4: '2222', dueDay: 6 },
        { id: 'ok2', bank: 'SBI', last4: '3333', dueDay: 7, nickname: 'Fine', addedAt: new Date().toISOString() }
      ],
      bills: [{ cardId: 'ok2', cycleKey: 'ok2_x', status: 'paid', dueDate: new Date().toISOString() }, { cardId: 'nope', cycleKey: 'k', status: 'paid', dueDate: '2026-01-01' }],
      settings: { premium: true, premiumSince: '2020-01-01', remindDays: 5 }
    };
    const file = new File([JSON.stringify(evil)], 'b.json', { type: 'application/json' });
    handleImportFile({ target: { files: [file], value: '' } });
    await new Promise(r => setTimeout(r, 300));
    const msg = document.getElementById('confirm-message').textContent;
    closeConfirmDialog(true);
    switchTab('cards'); switchTab('dashboard');
    await new Promise(r => setTimeout(r, 100));
    return { msg, ids: cards.map(c => c.id), bills: bills.length, premium: settings.premium, remind: settings.remindDays, pwned: window.__pwned };
  });
  t.check('import keeps only valid cards', JSON.stringify(im.ids) === '["ok2"]', im);
  t.check('import confirm says how many were skipped', /2 invalid cards will be skipped/.test(im.msg), im.msg);
  t.check('no script ran from the backup', im.pwned === 0, im.pwned);
  t.check('import cannot grant Premium; preferences still restore', im.premium === false && im.remind === 5, im);
  t.check('orphan bills are dropped', im.bills === 1, im.bills);

  // Gmail detections without a due day are never imported with an invented date.
  const g = await t.evaluate(() => {
    settings.premium = true;
    detectedGmailCards = [{ bank: 'Axis', last4: '', amount: 0, dueDay: 0, nickname: 'Axis Card', selected: true }];
    showDetectedCards();
    const listText = document.getElementById('gmail-detected-list').textContent;
    const before = cards.length;
    importDetectedCards();
    return { listText, added: cards.length - before };
  });
  t.check('Gmail card without a due day is not imported', g.added === 0, g);
  t.check('…and the sheet says to add it by hand', /add this card manually/.test(g.listText), g.listText);

  // COOP detached for CardGuard only (Google OAuth popup needs window.opener).
  const h = await t.evaluate(async () => {
    const mine = await fetch(location.href, { cache: 'no-store' });
    const other = await fetch('/2_meter_smart/index.html', { cache: 'no-store' });
    return { mine: mine.headers.get('cross-origin-opener-policy'), other: other.headers.get('cross-origin-opener-policy') };
  });
  t.check('COOP detached on CardGuard, kept elsewhere', h.mine === null && h.other === 'same-origin', h);

  const tabs = await t.evaluate(() => {
    const out = {};
    for (const tab of ['dashboard', 'cards', 'history', 'settings']) { switchTab(tab); out[tab] = document.getElementById('screen-' + tab).offsetHeight > 0; }
    out.last4Type = document.getElementById('input-last4').type + '/' + document.getElementById('input-last4').inputMode;
    out.dueLabel = document.querySelector('.cc-due-label') ? document.querySelector('.cc-due-label').textContent : '';
    return out;
  });
  t.check('all 4 tabs render', tabs.dashboard && tabs.cards && tabs.history && tabs.settings, tabs);
  t.check('card face says DUE DAY, last-4 is a numeric text field', tabs.dueLabel === 'DUE DAY' && tabs.last4Type === 'text/numeric', tabs);

  await t.reload(); await t.sleep(300);
  const r = await t.evaluate(() => ({ cards: cards.map(c => c.id), remind: settings.remindDays }));
  t.check('imported data survives reload', JSON.stringify(r.cards) === '["ok2"]' && r.remind === 5, r);
};
