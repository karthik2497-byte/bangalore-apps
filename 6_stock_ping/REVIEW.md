# StockPing — Review

**Date:** 2026-10-10 · **Reviewer:** Claude (Opus 5.5) · **Baseline:** `c6d74dd`
**Read in full:** `index.html` (CSS 20–1199, markup 1201–1460, script 1461–2617),
`service-worker.js`, `manifest.json`, `test-stockping.mjs` (PASS, 26 cases), the
`/6_stock_ping/*` block in `_headers`, EXECUTION_PLAN §4.3 / §6.2 #2, and MONETISATION.md.
Design detector: `impeccable detect.mjs`. Line numbers refer to the baseline commit.

## Verdict

StockPing is the most important app commercially (MONETISATION: one of only two with a
passive-revenue path). For a stock-alert app, the one thing that matters is that **a ping
means something**. Today it doesn't, in either direction:

- **False positives.** Any failed fetch (a proxy timeout, an Amazon bot-check page) sets the
  product to "Unknown". The next good check then fires **"Back in Stock! 🎉"** for an item
  that never went out of stock. The free CORS proxies fail often, so this happens often.
- **False negatives on Android.** `new Notification()` is an illegal constructor on Chrome
  for Android, and so in the Play TWA too. Android is the main platform, and there the first
  real restock *throws*. That aborts the check loop, leaves products stuck on "Checking…",
  and shows no notification at all.

Both are small, testable fixes. Behind them sit a fake-price-drop risk from the fallback
parser, an import path that can run script on the shared origin, and a "No servers required"
claim that hides the fact that two third-party proxies see every URL.

## Keep: works, don't change

- **The parser order:** schema.org JSON-LD first, keyword regex only as fallback (1714–1773).
  It walks `@graph` and arrays. This is the right fix for "Sold Out in a carousel decides the answer".
- **`applyCheckResult` as the single post-check path** (1786–1812). A failed price read does
  not clobber the known price. Only a genuine drop alerts. Coming back from "checking" is not
  a change. All three are tested.
- **Affiliate design:** one `affiliateUrl()` choke point that never throws and passes URLs
  through untouched when unset. The disclosure appears only once a tag is set (2427–2433).
  `openProductPage(id)` looks the product up by id. That was the 2026-07-11 inline-URL XSS fix.
- `escapeHtml()` on product names and domains. The toast appends the message as text (2564–2566).
- Export/Import exists. For a no-account app, that is the only backup story. Keep it, and harden it (below).
- The in-app settings copy says honestly that interval checks need the tab open (Settings info text).

## Findings

Severity: **P0** breaks data, trust or the core flow · **P1** real bug or WCAG AA failure ·
**P2** minor · **P3** polish.

### P0

- [x] **False "Back in Stock" after any failed check.** `checkProduct()` returns
  `{status:'unknown'}` when both proxies fail or return a page with no signal, for example
  Amazon's robot-check page (1777–1778). `applyCheckResult` then writes `product.status = 'unknown'`
  and logs an "In Stock → Unknown" alert. On the next good check, `unknown → in_stock` calls
  `notifyUser()` (1797–1801). **Fix:** an unknown result is *no information*. Keep the last
  known status and update only `lastChecked`. Notify a restock only on `out_of_stock → in_stock`.
  Add both cases to `test-stockping.mjs`.
- [x] **Notifications throw on Android.** `new Notification(...)` (1875, 1888, 1925, 1935) is an
  illegal constructor on Chrome Android and in the TWA. It throws inside `applyCheckResult`, so
  `checkAllProducts()` aborts mid-loop. The remaining products stay saved as `checking`, the
  Check All spinner never stops, and Send Test fails silently. **Fix:** use
  `(await navigator.serviceWorker.ready).showNotification(...)` inside a try/catch. The
  worker's `notificationclick` handler already exists.
- [x] **Every app's service worker deletes every other app's caches.** `service-worker.js:10`.
  Details are in `1_power_pulse/REVIEW.md`. **Fix:** `k.startsWith('stockping-') && k !== CACHE_NAME`,
  and bump to `stockping-v4`.

### P1

- [x] **Fake price drops from the fallback parser.** `parsePriceFallback()` takes the *first*
  ₹ amount anywhere in the HTML (1736–1741). That could be an EMI, a delivery fee, or a
  carousel item. With no JSON-LD on the page, two checks can read different numbers. The
  result is "Price dropped ₹49,999 → ₹2,083" with a notification, and a permanently wrong
  `lowestPrice`. **Fix:** record where each price came from. Alerts and `lowestPrice` use
  structured prices only. Fallback prices display as approximate.
- [x] **Import trusts ids and URLs.** `id: p.id` from the file (2477) is interpolated into
  inline `onclick="checkSingleProduct('${product.id}')"` (2061, 2064, 2067, 2121). A crafted
  "my deals" export therefore runs script on `tinkerhouse.uk`, the origin that holds all 7
  apps' storage. `p.url` is also not checked, so a `javascript:` URL reaches `window.open`
  through Open and Buy now. **Fix:** keep an imported id only if it matches `^[a-z0-9]+$`,
  otherwise generate one. Accept only `http(s)` URLs. Validate imported alerts the same way.
- [x] **The privacy claim is wrong.** About says "Built with HTML, CSS & JS. *No servers
  required.*" In fact every tracked URL goes to `api.allorigins.win` and `corsproxy.io`
  (1677–1680, §6.2 #2), and nothing in Add or Settings says so. **Fix:** add one honest line
  in the Add modal and in Settings, and replace the About claim. The real fix is the §4.3 P0 Worker.
- [x] **Checks can overlap.** The interval timer, auto-check on open and a manual Check All can
  run `checkAllProducts()` at the same time (2415–2419, 2598), which duplicates alerts and
  notifications. **Fix:** a single in-flight guard.
- [x] **A11y.**
  - Zoom is disabled (line 5).
  - Settings toggles are `<div onclick>` with no role, state or keyboard support (1298, 1323).
  - The FAB has no accessible name (1274). The action buttons rely on `title` only.
  - White text on the `--accent` buttons is **2.53:1** ("Add Product", "Track").
    **Fix:** use dark text (`--bg` on `--accent` is 7.49:1).
  - `outline: none` (633) and no `:focus-visible` rule.

### P2

- [x] **AudioContext leak.** `playChime()` creates a new `AudioContext` on every alert and never
  closes it (1899). Browsers cap live contexts, so after a burst of alerts the chime stops.
  **Fix:** reuse one context.
- [x] **Unbounded alerts.** Alerts grow without limit (`pushAlert`). Hourly checks for months
  keep growing `stockping_alerts`. **Fix:** cap at ~200.
- [x] **Canonical URLs.** Store a canonical URL: Amazon `/dp/<ASIN>`, and strip `utm_*`,
  `ref`, `tag` and other tracking params. Dedupe then works across shared links, and less of
  the user's referral trail leaks to the proxies.
- [x] **Double processing.** Paste and Enter both call `processUrl()`, so a paste followed by
  Enter fetches twice (2233–2246).
- [x] The splash takes a fixed 2 s, and the app frame stays `display:none` until then (2586).
- [ ] `AFFILIATE` ids are blank (known, NEXT_STEPS §3), and `privacy.html` is missing
  (known, NEXT_STEPS §4).

### P3 / design

- The palette is GitHub Primer dark, nearly value for value (`#0D1117`, `#161B22`, `#58A6FF`,
  `#3FB950`, `#F85149`). It is coherent, but it makes StockPing look like a GitHub page. That
  is a taste call for a later identity pass. The detector also flags Inter (14) and a
  zero-offset glow (184).

## Deferred: needs the backend (EXECUTION_PLAN §4.3)

- Server-side checking (Workers cron + KV) + Web Push. This removes the proxies, the
  open-tab requirement and most false signals at once.
- A public deal feed (P2).

## Status — 2026-10-10

Fixed this session. `test-stockping.mjs` passes 37 cases (11 new). 6/6 mutants killed:
status clobbering, unknown alerts, the exact-price gate, `lowestPrice` from approximate prices,
untyped `safeId`, and the URL protocol check. Headless Chrome, with `fetch` stubbed so no
proxy or retailer was contacted, ran 18/18 checks:

- With `new Notification()` forced to throw (Android), Check All completed and the restock
  appeared through the worker.
- A proxy failure then recovery produced no alert and no notification.
- Two concurrent Check Alls made one fetch.
- A crafted import ran nothing: the `javascript:` URL was rejected and the bad id replaced.
- Canonical `/dp/ASIN` links are stored.
- The proxy disclosure shows in Add and About.
- Accent buttons use dark text. Switches work from the keyboard.
- All 3 tabs render and data survives reload.

SW `stockping-v4` with a scoped purge.

Still open: `AFFILIATE` ids and `privacy.html` (config / Karthik); the deferred server-side
checker (§4.3) that removes the proxies entirely; the identity pass (P3).

## Work order

1. Status semantics: unknown is not a change, restock only from out_of_stock, plus tests.
2. Notifications via `registration.showNotification`, guarded.
3. SW purge scope + `stockping-v4`.
4. Price source tracking. Import validation. Check-in-flight guard. Proxy disclosure copy.
5. A11y: zoom, toggles as switches, FAB label, accent button contrast, focus ring. Then P2.
