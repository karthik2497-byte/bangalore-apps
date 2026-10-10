const URL_ = 'http://localhost:8811/4_nest_hub/index.html';
export default async (t) => {
  await t.goto(URL_);
  await t.sleep(600);
  const s = await t.evaluate(() => ({
    splashHidden: document.getElementById('splash').classList.contains('hide'),
    visible: document.getElementById('appContent').classList.contains('visible'),
    banner: (document.querySelector('.demo-banner') || {}).textContent || '',
    greeting: document.getElementById('greeting').textContent,
    profile: document.querySelector('.profile-name').textContent,
    viewport: document.querySelector('meta[name=viewport]').content,
    body: document.body.innerText,
    emergency: [...document.querySelectorAll('a.emergency-card')].map(a => a.getAttribute('href')),
    sos: triggerSOS.toString().includes("'tel:112'"),
    gray400: getComputedStyle(document.documentElement).getPropertyValue('--gray-400').trim(),
    dueLabel: document.getElementById('homeDueLabel').textContent,
    payLabel: document.getElementById('paymentMonthLabel').textContent,
    month: new Date().toLocaleString('en-US', { month: 'long' }) + ' ' + new Date().getFullYear()
  }));
  t.check('renders without the fixed splash delay', s.splashHidden && s.visible);
  t.check('demo banner is shown', /Demo society/.test(s.banner), s.banner);
  t.check('no developer name anywhere', !/Karthik|Chandrasekaran/.test(s.body));
  t.check('no borrowed developer brand', !/Prestige/.test(s.body));
  t.check('greeting is neutral', !/,/.test(s.greeting), s.greeting);
  t.check('profile is a demo resident', s.profile === 'Demo Resident', s.profile);
  t.check('pinch-zoom allowed', !/user-scalable=no|maximum-scale/.test(s.viewport), s.viewport);
  t.check('emergency cards dial real numbers', JSON.stringify(s.emergency) === '["tel:112","tel:100","tel:101","tel:108"]', s.emergency);
  t.check('SOS dials 112', s.sos);
  t.check('meta text token passes AA', s.gray400.toUpperCase() === '#6B7280', s.gray400);
  t.check('dues show the current month', s.dueLabel.startsWith(s.month) && s.payLabel.startsWith(s.month), [s.dueLabel, s.month]);

  // Payment: demo wording, no transaction id, persists across reload.
  const pay = await t.evaluate(async () => {
    switchTab('payments');
    document.getElementById('payNowBtn').click();
    const confirmText = document.getElementById('paymentFlowContent').innerText;
    document.querySelector('#paymentFlowContent .btn-primary').click();
    const doneText = document.getElementById('paymentFlowContent').innerText;
    closePaymentModal();
    return { confirmText, doneText, status: document.getElementById('paymentStatusText').textContent };
  });
  t.check('payment confirm says no money moves', /No money moves/.test(pay.confirmText), pay.confirmText);
  t.check('payment result is a demo mark, not a fake success', /Marked as paid \(demo\)/.test(pay.doneText) && !/Transaction|Receipt sent|Successful/.test(pay.doneText), pay.doneText);
  t.check('payment status updated', pay.status === 'Marked paid (demo)', pay.status);

  // Visitors: honest toasts, index-based frequent approve, Escape closes the sheet.
  const v = await t.evaluate(async () => {
    switchTab('visitors');
    const before = APP_STATE.activeVisitors.length;
    quickApprove('Amazon');
    const toast1 = [...document.querySelectorAll('.toast')].pop().textContent;
    document.querySelector('#frequentVisitors .frequent-approve-btn').click();
    const toast2 = [...document.querySelectorAll('.toast')].pop().textContent;
    const freqOnclick = document.querySelector('#frequentVisitors .frequent-approve-btn').getAttribute('onclick');
    const qr = document.querySelector('.qr-label').textContent;
    openVisitorForm();
    const today = document.getElementById('visitorDate').value;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const modalOpen = document.getElementById('visitorModal').classList.contains('show');
    return { added: APP_STATE.activeVisitors.length - before, toast1, toast2, freqOnclick, qr, today, modalOpen, localToday: localDate() };
  });
  t.check('two passes added', v.added === 2, v.added);
  t.check('quick approve does not claim the gate was notified', /isn't notified/.test(v.toast1) && !/Gate notified/.test(v.toast1), v.toast1);
  t.check('frequent approve passes an index, not quoted data', /^quickApproveFrequent\(\d+\)$/.test(v.freqOnclick), v.freqOnclick);
  t.check('frequent approve works', /pass saved/.test(v.toast2), v.toast2);
  t.check('QR caption says demo', /Demo pass/.test(v.qr), v.qr);
  t.check('visitor date defaults to the local date', v.today === v.localToday, v);
  t.check('Escape closes the sheet', !v.modalOpen);

  // Complaint becomes a real WhatsApp message.
  const c = await t.evaluate(() => {
    let opened = null; const orig = window.open; window.open = (u) => { opened = u; return null; };
    showComplaintModal();
    document.getElementById('complaintSubject').value = 'Lift stuck';
    document.getElementById('complaintDetails').value = 'Block A lift 2';
    submitComplaint();
    window.open = orig;
    return opened;
  });
  t.check('complaint opens a prefilled WhatsApp message', c && c.startsWith('https://wa.me/?text=') && decodeURIComponent(c).includes('Lift stuck'), c);

  const demo = await t.evaluate(() => { document.querySelector('.amenity-card').click(); return [...document.querySelectorAll('.toast')].pop().textContent; });
  t.check('amenity booking says demo', /isn't live yet/.test(demo), demo);

  // Every tab + community sub-tab opens.
  const tabs = await t.evaluate(() => {
    const out = {};
    for (const tab of ['home', 'visitors', 'community', 'payments', 'more']) {
      switchTab(tab);
      out[tab] = document.querySelector('.tab-page.active').offsetHeight > 0;
    }
    switchTab('community');
    document.querySelectorAll('.community-tab-btn').forEach(b => { b.click(); out['sub:' + b.textContent.trim()] = document.querySelector('.community-section.active').offsetHeight > 0; });
    return out;
  });
  t.check('all 5 tabs and 4 community sections render', Object.values(tabs).every(Boolean), tabs);

  // Persistence.
  await t.reload();
  await t.sleep(500);
  const p = await t.evaluate(() => ({ passes: APP_STATE.activeVisitors.length, status: document.getElementById('paymentStatusText').textContent }));
  t.check('passes and paid month survive reload', p.passes >= 4 && p.status === 'Marked paid (demo)', p);
};
