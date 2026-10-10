const URL_ = 'http://localhost:8811/1_power_pulse/index.html';
export default async (t) => {
  await t.goto(URL_);
  await t.sleep(700);
  const a = await t.evaluate(() => ({
    splash: document.getElementById('splash-screen').classList.contains('hide'),
    status: document.getElementById('status-text').textContent,
    sub: document.getElementById('status-subtext').textContent,
    cards: document.querySelectorAll('#outage-list .outage-card').length,
    resolved: document.querySelectorAll('#resolved-list .outage-card').length,
    body: document.body.innerText,
    viewport: document.querySelector('meta[name=viewport]').content,
    tels: [...document.querySelectorAll('a.setting-value')].map(x => x.getAttribute('href')),
    toggles: document.querySelectorAll('.toggle-switch').length,
    refresh: !!document.getElementById('refresh-btn')
  }));
  t.check('renders without the fixed splash delay', a.splash);
  t.check('fresh install shows no invented outages', a.cards === 0 && a.resolved === 0 && a.status === 'No Outages Logged', a);
  t.check('status says where reports live', /stay on this phone/.test(a.sub), a.sub);
  t.check('no fabricated claims left on screen', !/people reported|transformer area sparking|Data refreshed|Dec 1\d, 2024/.test(a.body));
  t.check('pinch-zoom allowed', !/user-scalable|maximum-scale/.test(a.viewport), a.viewport);
  t.check('helplines dial', JSON.stringify(a.tels) === '["tel:1912","tel:1916"]', a.tels);
  t.check('dead alert toggles and fake Refresh removed', a.toggles === 1 && !a.refresh, a);

  // Old installs: invented seed rows are dropped, real reports kept.
  await t.evaluate(() => {
    const seed = [1, 2, 3, 4].map(id => ({ id, area: 'Whitefield', type: 'power', reports: 31, firstReported: Date.now() - 60000 }));
    const real = { id: Date.now() - 5000, area: 'Jayanagar', type: 'power', reports: 1, firstReported: Date.now() - 5000, severity: 2, description: '' };
    localStorage.setItem('pp_outages', JSON.stringify({ active: [...seed, real], resolved: [{ id: 101, area: 'Indiranagar', type: 'power', reports: 42, firstReported: Date.now() - 4 * 3600000, resolvedAt: Date.now() - 3600000 }] }));
  });
  await t.reload(); await t.sleep(600);
  const m = await t.evaluate(() => ({ areas: [...document.querySelectorAll('#outage-list .outage-area')].map(x => x.textContent), resolved: document.querySelectorAll('#resolved-list .outage-card').length }));
  t.check('legacy seed outages are dropped on load', JSON.stringify(m.areas) === '["Jayanagar"]' && m.resolved === 0, m);

  // Log an outage: instant, honest units, severity shown; a second report updates it.
  const r = await t.evaluate(async () => {
    const $ = s => document.querySelector(s);
    const submit = () => $('#report-form').dispatchEvent(new Event('submit', { cancelable: true }));
    $('#report-area').value = 'HSR Layout';
    document.querySelector('.type-toggle-btn.water').click();
    const s = $('#severity-slider'); s.value = 1; s.dispatchEvent(new Event('input'));
    $('#report-desc').value = 'Low pressure';
    submit();
    const immediate = [...document.querySelectorAll('#outage-list .outage-area')].map(x => x.textContent).includes('HSR Layout');
    const toast = $('#toast-msg').textContent;
    s.value = 3; s.dispatchEvent(new Event('input'));
    $('#report-desc').value = 'No water since 6am';
    submit();
    const card = [...document.querySelectorAll('#outage-list .outage-card')].find(c => c.querySelector('.outage-area').textContent === 'HSR Layout');
    return { immediate, toast, text: card.innerText, valuetext: s.getAttribute('aria-valuetext') };
  });
  t.check('report appears immediately (no fake spinner)', r.immediate);
  t.check('toast says it is on this phone, not "helping the community"', /logged on this phone/.test(r.toast) && !/community/i.test(r.toast), r.toast);
  t.check('a second report updates count, worst severity', /2 reports/.test(r.text) && /Severe/.test(r.text), r.text);
  t.check('slider announces severity in words', r.valuetext === 'Moderate', r.valuetext);

  // Share + Power's back.
  const s = await t.evaluate(() => {
    let shared = null; navigator.share = (d) => { shared = d.text; return Promise.resolve(); };
    const card = [...document.querySelectorAll('#outage-list .outage-card')].find(c => c.querySelector('.outage-area').textContent === 'HSR Layout');
    card.querySelector('[data-action="share"]').click();
    card.querySelector('[data-action="resolve"]').click();
    const stillActive = [...document.querySelectorAll('#outage-list .outage-area')].some(x => x.textContent === 'HSR Layout');
    return { shared, stillActive, resolvedTop: document.querySelector('#resolved-list .outage-time').textContent };
  });
  t.check('Share text names the area and the helpline', /No water supply in HSR Layout/.test(s.shared || '') && /1916/.test(s.shared || ''), s.shared);
  t.check("Water's back resolves it", !s.stillActive && /Resolved/.test(s.resolvedTop), s);

  // Patterns from the local log.
  await t.evaluate(() => document.querySelector('.nav-item[data-tab="patterns"]').click());
  await t.sleep(400);  // tabs fade in through a 0.3 s visibility transition
  const p = await t.evaluate(() => {
    document.querySelector('.area-chip[data-area="HSR Layout"]').click();
    const hsr = { history: document.getElementById('history-list').textContent, window: document.getElementById('predicted-windows').textContent };
    document.querySelector('.area-chip[data-area="Hebbal"]').click();
    return { hsr, hebbal: document.getElementById('history-list').textContent };
  });
  t.check('Patterns show the logged outage with a real duration', /Water Issue/.test(p.hsr.history) && /\dm/.test(p.hsr.history) && !/ongoing/.test(p.hsr.history), p.hsr);
  t.check('no prediction until there is enough data', /Log 3 or more/.test(p.hsr.window), p.hsr.window);
  t.check('an area with nothing logged says so', /Nothing logged for Hebbal/.test(p.hebbal), p.hebbal);

  // Keyboard: map tile opens the sheet, Escape closes it and returns focus.
  await t.evaluate(() => document.querySelector('.nav-item[data-tab="map"]').click());
  await t.sleep(400);
  const k = await t.evaluate(() => {
    const tile = document.querySelector('.map-tile[data-area="Jayanagar"]');
    tile.focus();
    tile.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const open = document.getElementById('area-detail-overlay').classList.contains('show');
    const helpline = (document.querySelector('#sheet-outages .sheet-helpline') || {}).getAttribute?.('href');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { open, helpline, closed: !document.getElementById('area-detail-overlay').classList.contains('show'), focusBack: document.activeElement === tile };
  });
  t.check('Enter on a map tile opens the area sheet', k.open, k);
  t.check('sheet offers the right helpline', k.helpline === 'tel:1912', k.helpline);
  t.check('Escape closes it and focus returns to the tile', k.closed && k.focusBack, k);

  const ui = await t.evaluate(() => {
    document.querySelector('.nav-item[data-tab="home"]').click();
    document.querySelector('.filter-pill[data-filter="water"]').click();
    const pressed = document.querySelector('.filter-pill[data-filter="water"]').getAttribute('aria-pressed');
    const theme = document.getElementById('toggle-theme'); theme.click();
    const themeState = theme.getAttribute('aria-checked') + '/' + document.documentElement.getAttribute('data-theme');
    theme.click();
    const tabs = {};
    document.querySelectorAll('.nav-item').forEach(n => { n.click(); tabs[n.dataset.tab] = document.querySelector('.tab-content.active').offsetHeight > 0; });
    return { pressed, themeState, tabs };
  });
  t.check('filter pills expose pressed state', ui.pressed === 'true');
  t.check('theme switch exposes checked state', ui.themeState === 'false/light', ui.themeState);
  t.check('all 5 tabs render', Object.keys(ui.tabs).length === 5 && Object.values(ui.tabs).every(Boolean), ui.tabs);

  await t.reload(); await t.sleep(600);
  const after = await t.evaluate(() => JSON.parse(localStorage.getItem('pp_outages')));
  t.check('log survives reload (1 active, 1 resolved)', after.active.length === 1 && after.resolved.length === 1 && after.resolved[0].area === 'HSR Layout', { a: after.active.length, r: after.resolved.length });
};
