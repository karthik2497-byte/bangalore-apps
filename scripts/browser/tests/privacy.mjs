// The privacy pages render under their app's CSP, link back, and CardGuard no
// longer contacts Google on launch.
const B = 'http://localhost:8811/';
export default async (t) => {
  for (const app of ['2_meter_smart', '5_lingo_local', '6_stock_ping', '7_card_guard', '8_thraasu']) {
    await t.goto(B + app + '/privacy.html');
    const r = await t.evaluate(() => ({ h1: document.querySelector('h1').textContent, back: document.querySelector('footer a').getAttribute('href'), fonts: /fonts\.googleapis\.com/.test(document.body.textContent) }));
    t.check(`${app} policy renders, names Google Fonts, links back`, /Privacy Policy/.test(r.h1) && r.back === './index.html' && r.fonts, r);
  }
  // Play's account-deletion URL (privacy.html#delete) must show the steps, what is deleted or kept, and how long.
  await t.goto(B + '8_thraasu/privacy.html#delete');
  const del = await t.evaluate(() => {
    const h = document.getElementById('delete'), s = [];
    for (let e = h.nextElementSibling; e && e.tagName !== 'H2'; e = e.nextElementSibling) s.push(e.textContent);
    return { steps: [...h.parentElement.querySelectorAll('h2#delete ~ ol li')].length, text: s.join(' ') };
  });
  t.check('Thraasu delete section: steps, what is deleted and kept, 7 and 30 days',
    del.steps === 3 && /ckventurestech@gmail\.com/.test(del.text) && /What is deleted/.test(del.text) && /What is kept/.test(del.text) && /7 days/.test(del.text) && /30 days/.test(del.text), del);

  await t.goto(B + '6_stock_ping/privacy.html');
  t.check('StockPing policy names both proxies', await t.evaluate(() => /api\.allorigins\.win/.test(document.body.textContent) && /corsproxy\.io/.test(document.body.textContent)));

  // CardGuard: no request to accounts.google.com until Gmail import is used.
  await t.goto(B + '7_card_guard/index.html');
  await t.sleep(800);
  const g = await t.evaluate(() => ({
    gsiTag: !!document.querySelector('script[src*="accounts.google.com"]'),
    hasLoader: typeof loadGsi === 'function',
    entries: performance.getEntriesByType('resource').map(e => e.name).filter(n => n.includes('accounts.google.com'))
  }));
  t.check('CardGuard launch makes no request to accounts.google.com', !g.gsiTag && g.hasLoader && g.entries.length === 0, g);
  await t.goto(B + '5_lingo_local/index.html');
  await t.sleep(400);
  const ll = await t.evaluate(() => !!document.querySelector('a[href="./privacy.html"]'));
  await t.goto(B + '6_stock_ping/index.html');
  await t.sleep(400);
  const sp = await t.evaluate(() => !!document.querySelector('a[href="./privacy.html"]'));
  t.check('LingoLocal and StockPing link their new policies', ll && sp, { ll, sp });
};
