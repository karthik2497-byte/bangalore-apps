const ORIGIN = 'http://localhost:8811';
const URL_ = ORIGIN + '/6_stock_ping/index.html';
export default async (t) => {
  await t.grant(ORIGIN, ['notifications']);
  await t.goto(URL_);
  await t.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await t.reload(); await t.sleep(300);

  // Stub the network: no real proxy or retailer is ever contacted.
  const setup = await t.evaluate(() => {
    const page = (avail, price) => '<html><head><script type="application/ld+json">' +
      JSON.stringify({ '@type': 'Product', name: 'Test Phone', offers: { price: String(price), availability: 'https://schema.org/' + avail } }) +
      '</script></head><body>' + 'x'.repeat(200) + '</body></html>';
    window.__mode = 'in';
    window.__calls = 0;
    const realFetch = window.fetch;
    window.fetch = async (u, o) => {
      if (!String(u).includes('allorigins') && !String(u).includes('corsproxy')) return realFetch(u, o);
      window.__calls++;
      if (window.__mode === 'fail') throw new TypeError('Failed to fetch');
      return new Response(page(window.__mode === 'in' ? 'InStock' : 'OutOfStock', 999), { headers: { 'content-type': 'text/html' } });
    };
    // Chrome for Android: the page Notification constructor throws.
    window.Notification = class extends Notification { constructor() { throw new TypeError("Failed to construct 'Notification': Illegal constructor."); } };
    settings.notifications = true;
    return {
      splash: document.getElementById('splashScreen').classList.contains('hidden'),
      viewport: document.querySelector('meta[name=viewport]').content,
      about: document.querySelector('.built-with').textContent,
      hint: document.querySelector('.input-hint').textContent,
      fab: document.getElementById('fabBtn').getAttribute('aria-label'),
      btnColor: getComputedStyle(document.getElementById('btnTrack')).color
    };
  });
  t.check('renders without the 2 s splash', setup.splash);
  t.check('pinch-zoom allowed', !/user-scalable/.test(setup.viewport), setup.viewport);
  t.check('About no longer claims "No servers required"', !/No servers required/.test(setup.about) && /proxies/.test(setup.about), setup.about);
  t.check('Add modal discloses the proxies', /allorigins\.win, corsproxy\.io/.test(setup.hint), setup.hint);
  t.check('FAB has an accessible name', setup.fab === 'Add product');
  t.check('accent button text is dark (passes contrast)', setup.btnColor === 'rgb(13, 17, 23)', setup.btnColor);

  // Add an Amazon link carrying someone's tracking params.
  const add = await t.evaluate(async () => {
    window.__mode = 'out';
    await processUrl('https://www.amazon.in/Test-Phone/dp/B0ABCDEF12/ref=sr_1_1?tag=someone-21&utm_source=wa');
    trackProduct();
    return { url: products[0].url, status: products[0].status, priceApprox: products[0].priceApprox, lowest: products[0].lowestPrice };
  });
  t.check('stored link is canonical /dp/ASIN', add.url === 'https://www.amazon.in/dp/B0ABCDEF12', add);
  t.check('JSON-LD price is exact and seeds lowestPrice', add.priceApprox === false && add.lowest === 999, add);

  // Restock with the Android-style constructor: the loop completes and the worker shows it.
  const restock = await t.evaluate(async () => {
    window.__mode = 'in';
    await checkAllProducts();
    const reg = await navigator.serviceWorker.getRegistration();
    let shown = [];
    for (let i = 0; i < 20 && !shown.length; i++) { await new Promise(r => setTimeout(r, 100)); shown = await reg.getNotifications(); }
    return { perm: Notification.permission, status: products[0].status, spinning: document.getElementById('btnCheckAll').classList.contains('checking'),
             shown: shown.map(n => n.title), alerts: alerts.length };
  });
  t.check('Check All completes even though new Notification() throws', restock.status === 'in_stock' && !restock.spinning, restock);
  t.check('restock notification shown via the service worker', restock.shown.includes('Back in Stock! 🎉'), restock.shown);

  // Proxy failure, then recovery: no false alert, no second notification.
  const flap = await t.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    (await reg.getNotifications()).forEach(n => n.close());
    const alertsBefore = alerts.length;
    window.__mode = 'fail';
    await checkAllProducts();
    const during = products[0].status;
    window.__mode = 'in';
    await checkAllProducts();
    return { during, after: products[0].status, newAlerts: alerts.length - alertsBefore, notes: (await reg.getNotifications()).length };
  });
  t.check('a failed check keeps "In Stock"', flap.during === 'in_stock', flap);
  t.check('no false "Back in Stock" after the proxy recovers', flap.newAlerts === 0 && flap.notes === 0, flap);

  // Overlapping runs do not double up.
  const overlap = await t.evaluate(async () => {
    window.__mode = 'out';
    const calls = window.__calls;
    await Promise.all([checkAllProducts(), checkAllProducts()]);
    return { fetches: window.__calls - calls, stockAlerts: alerts.filter(a => a.newStatus === 'out_of_stock').length };
  });
  t.check('a second concurrent Check All is ignored', overlap.fetches === 1 && overlap.stockAlerts === 1, overlap);

  // A crafted export file.
  const imp = await t.evaluate(async () => {
    window.__pwned = 0;
    const evil = { products: [
      { id: "x');window.__pwned=1;('", url: 'https://www.flipkart.com/p/itm9?pid=AB', name: 'Evil id' },
      { id: 'ok1', url: 'javascript:window.__pwned=2', name: 'Evil url' },
      { url: 'https://www.myntra.com/123?utm_source=x', name: 'Fine' }
    ], alerts: [{ productId: "y');window.__pwned=3;('", productName: 'x', type: 'stock' }, { productId: 'abc', productName: 'z', type: 'price', oldPrice: 'NaN' }] };
    const before = products.length;
    handleImport({ target: { files: [new File([JSON.stringify(evil)], 'e.json')], value: '' } });
    await new Promise(r => setTimeout(r, 300));
    switchTab('alerts'); switchTab('track');
    return { added: products.length - before, ids: products.map(p => p.id), urls: products.map(p => p.url), pwned: window.__pwned,
             badIds: products.filter(p => !/^[a-z0-9]+$/i.test(p.id)).length };
  });
  t.check('javascript: URL rejected, crafted id replaced', imp.added === 2 && imp.badIds === 0 && !imp.urls.some(u => u.startsWith('javascript')), imp);
  t.check('no script ran from the import', imp.pwned === 0, imp.pwned);

  // Keyboard on a switch + every tab + reload.
  const kb = await t.evaluate(() => {
    const el = document.getElementById('toggleAutoCheck');
    const before = el.getAttribute('aria-checked');
    el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    const out = { before, after: el.getAttribute('aria-checked') };
    for (const tab of ['track', 'alerts', 'settings']) { switchTab(tab); out[tab] = document.getElementById('screen' + tab[0].toUpperCase() + tab.slice(1)).offsetHeight > 0; }
    return out;
  });
  t.check('Space toggles a switch and updates aria-checked', kb.before === 'true' && kb.after === 'false', kb);
  t.check('all 3 tabs render', kb.track && kb.alerts && kb.settings, kb);
  await t.reload(); await t.sleep(300);
  const r = await t.evaluate(() => ({ n: products.length, status: products[0] && products[0].status, autoCheck: settings.autoCheck }));
  t.check('products + settings survive reload', r.n === 3 && r.autoCheck === false, r);
};
