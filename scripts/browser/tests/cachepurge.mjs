// Cross-app cache purge: does activating one app's SW delete another app's caches?
const B = 'http://localhost:8811/';
const waitCache = async (t, prefix, minEntries = 1) => t.evaluate(async (prefix, min) => {
  for (let i = 0; i < 100; i++) {
    for (const k of await caches.keys()) {
      if (k.startsWith(prefix) && (await (await caches.open(k)).keys()).length >= min) return k;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return null;
}, prefix, minEntries);

export default async (t) => {
  // 1. LingoLocal installs and precaches its clips.
  await t.goto(B + '5_lingo_local/index.html');
  const ll = await waitCache(t, 'lingolocal-', 100);
  t.check('LingoLocal precached its shell + clips', ll, ll);

  // 2. CardGuard writes its state mirror for the background worker.
  await t.goto(B + '7_card_guard/index.html');
  const cg = await waitCache(t, 'cardguard-v');
  const mirror = await t.evaluate(async () => { for (let i = 0; i < 50; i++) { if ((await caches.keys()).includes('cardguard-state')) return true; await new Promise(r => setTimeout(r, 200)); } return false; });
  t.check('CardGuard cached + mirrored state', cg && mirror, { cg, mirror });

  // 3. Another app activates its worker.
  await t.goto(B + '2_meter_smart/index.html');
  const ms = await waitCache(t, 'metersmart-');
  await t.sleep(1500); // let activate() finish its purge
  const keys = await t.evaluate(async () => caches.keys());
  t.check('MeterSmart installed', ms, ms);
  t.check('LingoLocal cache survives another app activating', keys.some(k => k.startsWith('lingolocal-')), keys);
  t.check('CardGuard state mirror survives another app activating', keys.includes('cardguard-state'), keys);
};
