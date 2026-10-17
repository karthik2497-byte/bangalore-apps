// A home-screen launch opens the manifest's start_url (./index.html), which Pages 308-redirects to ./ .
// A service worker that answers a page load with the redirected copy it precached fails it
// (net::ERR_FAILED): every installed app failed its first launch until 2026-10-17. Same for the
// privacy page's link back to ./index.html.
const B = 'http://localhost:8811/';
const APPS = ['1_power_pulse', '2_meter_smart', '3_pg_buddy', '4_nest_hub', '5_lingo_local', '6_stock_ping', '7_card_guard', '8_thraasu'];
const PRIVACY = ['2_meter_smart', '5_lingo_local', '6_stock_ping', '7_card_guard', '8_thraasu'];

export default async (t) => {
  for (const app of APPS) {
    const base = B + app + '/';
    await t.goto(base);
    await t.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await t.reload();                                     // the worker controls the page from here on
    const start = new URL(await t.evaluate(() => fetch('manifest.json').then(r => r.json()).then(m => m.start_url)), base).href;
    for (const url of [start].concat(PRIVACY.includes(app) ? [base + 'privacy.html', start] : [])) {
      await t.goto(url);
      const r = await t.evaluate(() => ({ href: location.href, controlled: !!(navigator.serviceWorker && navigator.serviceWorker.controller) }));
      t.check(`${app}: ${url.slice(base.length)} opens under its worker`, r.href.startsWith(base) && r.controlled, r);
    }
  }
};
