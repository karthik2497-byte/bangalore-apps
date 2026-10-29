// play-shots.mjs: Thraasu's Play Store graphics from the live app, staged as a shop's morning in headless Chrome.
// Run from the repo root: node scripts/browser/cdp.mjs 8_thraasu/tools/play-shots.mjs   (OUT=dir, default ~/Desktop/thraasu-play)
// Writes icon-512.png (Play's 32-bit icon), six 1080 × 1920 phone screenshots and feature-graphic.jpg (1024 × 500);
// JPEG where Play wants no alpha. Re-run after a UI change: the staged shop lives only in cdp.mjs's throwaway profile.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const OUT = process.env.OUT || `${homedir()}/Desktop/thraasu-play`;
const APP = 'https://tinkerhouse.uk/8_thraasu/';
const ID = { tomato: 'P0000000449', onion: 'P0000000443', potato: 'P0000000444', chilli: 'P0000000448',
  coriander: 'P0000000466', rice: 'P0000000001', sugar: 'P0000000028' };
const OWN = { tomato: 42, onion: 58, potato: 30, chilli: 96, coriander: 180, rice: 64, sugar: 58 };   // the shop's ₹ a kg

// The icon's brass balance without its green square, for the feature graphic.
const BALANCE = '<svg viewBox="0 0 120 92" aria-hidden="true"><g fill="#E8B85C"><rect x="58" y="14" width="4" height="68" rx="2"/>' +
  '<path d="M38 90q0-8 8-8h28q8 0 8 8z"/><circle cx="60" cy="11" r="5"/><rect x="10" y="17" width="100" height="5" rx="2.5"/>' +
  '<path d="M16 21 4 50M16 21l12 29M104 21 92 50m12-29 12 29" fill="none" stroke="#E8B85C" stroke-width="2"/>' +
  '<path d="M0 50h32q-16 14-32 0zm88 0h32q-16 14-32 0z"/></g></svg>';
const FEATURE = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anek+Malayalam:wght@500;700&display=block">
<style>
  html, body { margin: 0; width: 1024px; height: 500px; overflow: hidden; }
  body { position: relative; background: #1E6B3A; color: #F6F2E9; font-family: 'Anek Malayalam', sans-serif; }
  .copy { position: absolute; left: 76px; top: 0; bottom: 0; width: 540px; display: flex; flex-direction: column; justify-content: center; }
  .brand { display: flex; align-items: center; gap: 24px; }
  .brand svg { width: 112px; height: 86px; flex: none; }
  h1 { margin: 0; font-size: 92px; line-height: 1; font-weight: 700; }
  .en { margin-top: 8px; font: 600 21px/1 system-ui, sans-serif; letter-spacing: .14em; color: #E8B85C; }
  p { margin: 36px 0 0; font-size: 34px; line-height: 1.4; font-weight: 500; }
  .phone { position: absolute; right: 92px; top: 38px; width: 240px; height: 426px; padding: 9px; border-radius: 34px;
    background: #10321D; box-shadow: 0 24px 60px rgba(0, 0, 0, .35); }
  .phone img { display: block; width: 100%; height: 100%; border-radius: 26px; object-fit: cover; object-position: top; }
</style>
<div class="copy">
  <div class="brand">${BALANCE}<div><h1>ത്രാസ്</h1><div class="en">THRAASU · SHOP BILLING</div></div></div>
  <p>തൂക്കം നൽകൂ, വില തനിയെ.<br>ബിൽ പ്രിന്റ് ചെയ്യാം, ഫോണിൽ അയക്കാം.</p>
</div>
<div class="phone"><img src="4-bill.jpg" alt=""></div>`;

export default async t => {
  mkdirSync(OUT, { recursive: true });
  const metrics = (width, height, deviceScaleFactor, mobile) =>
    t.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile });
  const save = async (name, format = 'jpeg') => {
    const { data } = await t.send('Page.captureScreenshot', { format, ...(format === 'jpeg' && { quality: 92 }) });
    writeFileSync(`${OUT}/${name}`, Buffer.from(data, 'base64'));
    t.check(name, data.length > 1000);
  };
  // Fonts, and the pictures on screen (lazy ones further down never load, so they are not waited for).
  const settle = () => t.evaluate(async () => {
    await document.fonts.ready;
    const shown = [...document.images].filter(i => !i.complete && i.getBoundingClientRect().top < innerHeight);
    await Promise.race([Promise.all(shown.map(i => new Promise(r => { i.onload = i.onerror = r; }))), new Promise(r => setTimeout(r, 4000))]);
    await new Promise(r => setTimeout(r, 600));
  });

  await metrics(360, 640, 3, true);
  await t.goto(APP);
  // Play wants a 32-bit icon: a screenshot of the opaque icon comes out RGB, a canvas's PNG keeps its alpha channel.
  const icon = await t.evaluate(async url => {
    const img = new Image(); img.src = url; await img.decode();
    const c = Object.assign(document.createElement('canvas'), { width: 512, height: 512 });
    c.getContext('2d').drawImage(img, 0, 0, 512, 512);
    return c.toDataURL('image/png').split(',')[1];
  }, APP + 'icon-512.svg');
  writeFileSync(`${OUT}/icon-512.png`, Buffer.from(icon, 'base64'));
  t.check('icon-512.png', icon.length > 1000);
  await t.evaluate(() => {
    localStorage.setItem('thraasu_hints', JSON.stringify({ bills: 1, prices: 1 }));   // the hints dismissed
    localStorage.setItem('thraasu_shop', 'ശ്രീ സ്റ്റോർസ്');                          // a made-up shop, not a real one
  });
  await t.reload();
  await settle();
  await save('1-shelf.jpg');

  await t.evaluate((ID, OWN) => {
    for (const k in OWN) setRate(byId.get(ID[k]), OWN[k] * 100);
    window.__add = (pid, qty) => { openSheet(asItem(byId.get(pid))); setQty(qty); update(); commit(); };
    __add(ID.tomato, 1000); __add(ID.potato, 2000);
    openCat('veg');
  }, ID, OWN);
  await settle();
  await save('2-category.jpg');

  await t.evaluate(ID => { openSheet(asItem(byId.get(ID.onion))); setQty(1500); update(); }, ID);
  await settle();
  await save('3-quantity.jpg');

  await t.evaluate(ID => {
    commit();
    __add(ID.chilli, 250); __add(ID.coriander, 100); __add(ID.rice, 5000); __add(ID.sugar, 1000);
    openBill(); bill.pay = 'upi'; saveBill(); renderBill();
    $('payRow').scrollIntoView({ block: 'center' });   // the total and how it was paid, under the last lines
  }, ID);
  await settle();
  await save('4-bill.jpg');

  await t.evaluate(ID => {
    newBill();
    __add(ID.rice, 2000); __add(ID.sugar, 1000); bill.pay = 'cash'; newBill();
    __add(ID.tomato, 500); __add(ID.onion, 1000); __add(ID.chilli, 100); bill.pay = 'credit'; newBill();
    __add(ID.potato, 1000); bill.pay = 'cash'; newBill();
    hideToast(); closeBill();
  }, ID);
  await t.sleep(600);                                  // closeBill goes back in history; its popstate closes open sheets
  await t.evaluate(() => openBills());
  await settle();
  await save('5-bills.jpg');

  await t.evaluate(() => [...document.querySelectorAll('#billsList .past-row')].find(b => b.textContent.includes('0001')).click());
  await settle();
  await save('6-kept-bill.jpg');

  writeFileSync(`${OUT}/feature.html`, FEATURE);
  await metrics(1024, 500, 1, false);
  await t.goto(`file://${OUT}/feature.html`);
  await t.evaluate(async () => { await document.fonts.ready; await new Promise(r => setTimeout(r, 400)); });
  await save('feature-graphic.jpg');
  rmSync(`${OUT}/feature.html`);
};
