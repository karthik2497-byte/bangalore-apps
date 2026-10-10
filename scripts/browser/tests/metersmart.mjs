const URL_ = 'http://localhost:8811/2_meter_smart/index.html';
export default async (t) => {
  await t.goto(URL_);
  await t.sleep(700);
  const a = await t.evaluate(async () => {
    const $ = id => document.getElementById(id);
    const r = {};
    r.splash = getComputedStyle($('splash')).opacity === '0' || $('splash').style.display === 'none' || $('splash').classList.contains('hide');
    r.viewport = document.querySelector('meta[name=viewport]').content;
    r.rides = state.rides.length;
    r.overpaidLabel = document.querySelector('#tabRideLog .stat-card.highlight .stat-label').textContent;
    r.autoNight = state.nightMode === isNightNow();
    state.nightManual = true; state.nightMode = false; calculateFare();  // pin day rate; it may be night right now
    r.base = $('fairFareAmount').textContent;
    $('distanceInput').value = 10; calculateFare(); r.ten = $('breakTotal').textContent;
    r.waitSub = $('lblWaitSub').textContent; r.lugSub = $('lblLugSub').textContent; r.rates = $('lblRatesNote').textContent;
    r.route8 = document.querySelector('.route-card[data-km="8"] .route-fare').textContent;
    // waiting + luggage + cap
    $('waitingInput').value = 20; calculateFare(); r.wait20 = $('breakWait').textContent;
    adjustLuggage(1); adjustLuggage(1); adjustLuggage(1); r.lugCount = $('luggageCount').textContent; r.lug = $('breakLug').textContent;
    // night via keyboard on the switch
    const wasNight = state.nightMode;
    $('nightToggle').focus();
    $('nightToggle').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    r.keyToggled = state.nightMode !== wasNight;
    $('waitingInput').value = 0; state.luggagePieces = 0; state.nightMode = true; calculateFare(); r.night10 = $('breakTotal').textContent;
    state.nightMode = false; calculateFare();
    r.tips = $('tabTips').innerText;
    r.tels = [...document.querySelectorAll('a.emergency-num')].map(x => x.getAttribute('href'));
    r.compDate = $('compDate').value; r.localDate = localDate();
    // auto-fill for a 5 km ride follows the clock's night rule
    $('logDistance').value = 5; $('logDistance').dispatchEvent(new Event('input'));
    r.autofill = Number($('logMeterFare').value); r.expectAutofill = meterFareFor(5, isNightNow());
    return r;
  });
  t.check('splash does not hold the app', a.splash);
  t.check('pinch-zoom allowed', !/user-scalable|maximum-scale/.test(a.viewport), a.viewport);
  t.check('no seeded fake rides on a fresh install', a.rides === 0, a.rides);
  t.check('stat is called Overpaid', a.overpaidLabel === 'Overpaid', a.overpaidLabel);
  t.check('night auto-detect matches the clock', a.autoNight);
  t.check('2 km shows the ₹36 minimum', a.base === '₹36', a.base);
  t.check('10 km shows ₹180', a.ten === '₹180', a.ten);
  t.check('night 10 km shows ₹270', a.night10 === '₹270', a.night10);
  t.check('20 min waiting = ₹10', a.wait20 === '₹10', a.wait20);
  t.check('luggage capped at 2 × ₹10', a.lugCount === '2' && a.lug === '₹20', [a.lugCount, a.lug]);
  t.check('labels describe the new rules', /after 5 free/.test(a.waitSub) && /20 kg/.test(a.lugSub), [a.waitSub, a.lugSub]);
  t.check('verified date is the real check date', /10 Oct 2026/.test(a.rates), a.rates);
  t.check('route cards re-priced (8 km = ₹144)', a.route8 === '₹144', a.route8);
  t.check('Enter toggles the night switch', a.keyToggled);
  t.check('no unsourced legal specifics in Tips', !/Section 66|₹500|since 2024/.test(a.tips));
  t.check('helplines dial (112, 103, 1091), unverified number gone', JSON.stringify(a.tels) === '["tel:112","tel:103","tel:1091"]' && !/2294/.test(a.tips), a.tels);
  t.check('complaint date defaults to the local date', a.compDate === a.localDate, [a.compDate, a.localDate]);
  t.check('ride-log auto-fill follows the night rule', a.autofill === a.expectAutofill, [a.autofill, a.expectAutofill]);

  // Log a ride, reload, it persists and Overpaid reflects it.
  await t.evaluate(() => {
    const $ = id => document.getElementById(id);
    $('logFrom').value = 'Indiranagar'; $('logTo').value = 'HSR';
    $('logDistance').value = 5; $('logMeterFare').value = 90; $('logChargedFare').value = 120;
    logRide();
  });
  await t.reload(); await t.sleep(600);
  const b = await t.evaluate(() => ({ rides: state.rides.length, overpaid: document.getElementById('statSaved').textContent, date: state.rides[0] && state.rides[0].date, local: localDate() }));
  t.check('logged ride survives reload', b.rides === 1 && b.overpaid === '₹30', b);
  t.check('ride stamped with the local date', b.date === b.local, b);

  // Old installs: seeded rides (ids 1-6) are removed on load; Clear All stays cleared.
  await t.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('meterSmart'));
    saved.rides = saved.rides.concat([1, 2, 3, 4, 5, 6].map(id => ({ id, from: 'X', to: 'Y', distance: 6, meterFare: 90, chargedFare: 350, date: '2024-12-15', fair: false })));
    saved.totalSaved = 340;
    localStorage.setItem('meterSmart', JSON.stringify(saved));
  });
  await t.reload(); await t.sleep(600);
  const c = await t.evaluate(() => ({ rides: state.rides.map(r => r.id > 6), overpaid: state.totalSaved }));
  t.check('legacy seeded rides are dropped, real ride kept', c.rides.length === 1 && c.rides[0] && c.overpaid === 30, c);
  await t.evaluate(() => { window.confirm = () => true; clearAllData(); });
  await t.reload(); await t.sleep(600);
  t.check('Clear All Data stays cleared after reload', (await t.evaluate(() => state.rides.length)) === 0);

  // Kannada + every tab.
  const d = await t.evaluate(() => {
    toggleLang();
    const kn = document.getElementById('lblWaitSub').textContent;
    toggleLang();
    const tabs = {};
    document.querySelectorAll('.nav-item').forEach(b => { b.click(); tabs[b.getAttribute('aria-label')] = document.querySelector('.tab-content.active').offsetHeight > 0; });
    return { kn, tabs };
  });
  t.check('Kannada waiting label mentions the free minutes', /ಉಚಿತ/.test(d.kn), d.kn);
  t.check('all 5 tabs render', Object.values(d.tabs).length === 5 && Object.values(d.tabs).every(Boolean), d.tabs);
};
