# Work Log

## Phase A — deploy config, and two CSP bugs only a browser could find (2026-08-29)

Scope: §7 Phase A, repo side only. No app code touched. Creating the Cloudflare
Pages project, granting it GitHub access and buying the domain are account actions
and a purchase — those stay with Karthik.

### The site is not the repo
Cloudflare Pages serves whatever sits in the output directory. Pointing it at the
repo root would have published `EXECUTION_PLAN.md`, `WORK_LOG.md`, `PLAYBOOK.html`,
`MISTAKES.md` and every `test-*.mjs` on the live domain — the revenue plan included.

`scripts/build-site.sh` copies `index.html`, `_headers` and the 7 app folders into
`dist/`, excluding `*.md`, `tools/` and `test-*.mjs`, then **fails** if anything it
did not intend is in the output. Pages config: build command
`bash scripts/build-site.sh`, output directory `dist`.

The exclusion could have been a list of paths in the Pages dashboard. It is a script
in the repo instead, because a dashboard setting is invisible from here and nothing
would have caught it drifting.

### Testing the headers instead of reading them
`_headers` had a CSP for 3 of 7 apps and had never been served to a browser. Rather
than write the other 4 by inspection, I served `dist/` through a small local server
that parses `_headers` and applies the matching rules verbatim, then drove the real
apps against it. Two bugs surfaced that reading would not have shown:

1. **All 7 apps load their typeface from Google Fonts** — including MeterSmart and
   LingoLocal, whose existing CSPs allowed only `style-src 'self'`. Both would have
   gone live unstyled.

2. **A service worker inherits its app's CSP, and that governs its pass-through
   fetch.** `service-worker.js` is served from `/5_lingo_local/`, so the `/5_lingo_local/*`
   rule applies to it. Its handler ends in `fetch(event.request)` — and from inside a
   worker that is a `connect-src` fetch, whatever the page's original request was for.
   With `connect-src 'self'` every webfont failed as `TypeError: Failed to fetch` the
   moment the SW took control. Allowing the origin in `style-src` and `font-src` is
   not enough; it has to be in `connect-src` as well.

   This one cost the most time because it looks like a CSP violation and is not one:
   no `securitypolicyviolation` event fires, the console stays clean, and the only
   evidence is the rejected promise inside the worker. It also hid behind Chrome's
   HTTP cache — a re-registered SW kept serving the *old* script with the *old*
   CSP, so the first verification of the fix still failed. Registering the probe
   under a fresh filename was what proved the fix.

`scripts/build-site.sh` now fails the build if any per-app CSP loses one of the three
font allowances. Mutation-checked: dropping `fonts.googleapis.com` from one
`connect-src` fails the build.

### Verified in a browser, under the real headers
- **LingoLocal** — SW controlling, Poppins and Noto Sans Kannada both `loaded`, and a
  bundled clip fetched and decoded to 0.94 s through `connect-src 'self'` /
  `media-src 'self'`.
- **PG Buddy** — 8 listings fetched from `pgs.json` and cached, listings rendered, and
  the response carried `public, max-age=0, must-revalidate` (new rule, matching
  `fares.json` — a newly verified PG has to reach clients on the next launch).
- **CardGuard** — `reminder-core.js` loaded under `script-src 'self'`, app rendered.
- All 4 test suites still PASS.

### Not done, on purpose
- **SW cache version bump (Phase A item 4)** — nothing is live, so no client holds a
  stale cache. A bump now is churn. It applies from the second deploy onward.
- **StockPing's proxy origins** are in its `connect-src`, but the request path was not
  exercised — driving it would have hit the live CORS proxies and real retail sites.

### Found in the working tree, not mine
`4_nest_hub/index.html` and `6_stock_ping/index.html` had uncommitted `showToast`
fixes (`innerHTML = icon + message` → `innerHTML = icon; append(message)`) with
matching SW bumps, from another session. They are correct and they close a real §0.2
XSS path, but they are not this change-set — left in place, uncommitted, and reported.

## Browser smoke test of all 7 apps + toast XSS fix (2026-08-29)

The 2026-07-11 review pass shipped fixes to all 7 apps but only ever cleared `node --check`
— its own log line said the browser smoke test was NOT done. PowerPulse and NestHub were
still carrying that debt (every other app has been driven in a browser since, during its
roadmap build). Closed it for all 7.

### New finding — XSS in `showToast()` (NestHub + StockPing)

The 07-11 pass escaped the render paths but missed the toast, which builds its body with
`toast.innerHTML = icon + message` while callers interpolate user input straight in:

- NestHub `approveVisitor()` → ``showToast(`QR pass generated for ${name}!`)`` — visitor name
  is free text. **Reproduced live: a visitor named `<img src=x onerror=...>` executed.**
- StockPing `addProduct()` → ``showToast(`Now tracking: ${name}`)`` — the name comes from
  `detectedProductData`, i.e. a *scraped remote page*. Worse than user input: the payload
  arrives from a third-party site the user never typed.

Fixed once in each shared `showToast()` rather than at the five call sites — the icon stays
markup, the message becomes a text node:

```js
toast.innerHTML = iconSvg;
toast.append(message);   // string arg → text node, no parsing
```

Checked every `showToast` caller in both apps first: none passes markup as the message, so
nothing regresses. The other 5 apps build their toasts with `textContent` and were never
affected. SW caches bumped: `nesthub-v1` → `v2`, `stockping-v2` → `v3`.

### Verification (§0.3 gate — all four)

Every app was tested after unregistering its service worker and deleting its caches first —
the 2026-08-07 entry records a test loop invalidated by a cache-first SW serving stale
`index.html`, and both apps did have a live SW + populated cache from earlier sessions.

1. **Syntax:** 14 inline blocks + 7 service workers, `node --check` → PASS (before and after
   the fix).
2. **Runtime:** served at `:8899`, driven in Chrome.
   - *PowerPulse:* submitted a report for Hebbal with an `<img onerror>` payload in the
     description → sheet renders it as an inert text node (0 child elements, handler never
     fired). Auto-expiry: aged the report to −13h, reload moved it active → resolved
     (5→4 active, 2→3 resolved), resolved list capped at 10.
   - *NestHub:* RSVP 18 → 19 attending with all 3 SVG `width`/`height` attributes unchanged
     (the 07-11 bug corrupted `width="14"`). Visitor pass with an XSS payload: fired before
     the fix, inert after (toast's only child element is the `<svg>`). Cancel Pass 3 → 2.
   - *StockPing:* `showToast()` called directly with a payload → inert, 0 injected nodes.
3. **Persistence:** reload → PowerPulse kept the Hebbal outage (5 active); NestHub kept all
   3 visitors and still rendered the injected name as text.
4. **Regression:** every tab of all 7 apps opened and rendered non-empty content —
   PowerPulse 5, MeterSmart 5, PG Buddy 4, NestHub 5, LingoLocal 3, StockPing 3, CardGuard 4.
   **0 app console errors anywhere** (only MetaMask extension noise on one load).

Incidental confirmation: LingoLocal shows `{"count":1}` for a first-time visitor — the 07-11
streak off-by-one is fixed.

### Not fixed (deliberate)

- PowerPulse has no `esc()` helper; its one user-input sink escapes with
  `.replace(/</g,'&lt;')` inline. That is sufficient — `&lt;` in text content cannot re-open
  a tag — but it is off-pattern versus §0.2, and a second sink added carelessly would not be
  covered.
- PowerPulse `#report-form`: when an active outage already exists for the same area+type, the
  submission only does `existing.reports += 1` — the user's description and severity are
  silently discarded. Reasonable as aggregation, invisible as UX.

---

## CardGuard — backend-free reminders, premium tier, privacy (2026-08-20)

Scope: §4.4 everything that does not require a server, plus §6.2 items 1, 3 and 5
for this app. No new dependencies. SW `cardguard-v1` → `cardguard-v2`.

### The core value proposition, without the backend
The plan assumed "reminders with the app closed" needs Workers + Supabase + Web
Push. It does not: every input to the decision (due days, paid cycles, remind-days
preference) is already on the device. What was missing was a way to *wake up* and a
way for the worker to *see* the data — a service worker cannot read `localStorage`.

- **`reminder-core.js`** (new) — due-date maths, the reminder rule, dedupe keys and
  formatting, in one file loaded three ways: `<script src>` in the page,
  `importScripts` in the service worker, and directly by the tests. The page's own
  `getNextDueDate` / `getDaysUntilDue` / `formatDate` / `formatCurrency` /
  `getBillingCycleKey` are now one-line wrappers over it, so there is a single
  implementation instead of one per surface.
- **State mirror** — the page writes `{cards, settings, paidCycleKeys, notified}`
  into Cache Storage (`cardguard-state`, separate from the versioned app cache so
  the activate purge cannot eat it) on every `saveCards`/`saveBills`/`saveSettings`.
  That is the worker's only view of the data.
- **`periodicsync`** (`cardguard-check`, 12 h) fires the same `dueReminders()` in the
  worker and shows the notification. Chromium-only and installed-PWA-only, so
  Settings reports the real state — Active / "Install to your home screen" / "Not
  supported here" — instead of implying delivery that never happens.
- **Test button** in Settings runs the worker's check on demand over a
  `MessageChannel` and reports what actually happened, including the failure reason.
- A notification that fails to display is **not** recorded as sent, so it retries
  once the user grants permission.

### Premium (P1)
- Free plan = 2 cards, manual entry. `cardLimitReached()` gates both `saveCard()`
  and the Gmail importer; the paywall explains which limit was hit.
- ₹99/year via **Play Billing through the Digital Goods API** (`getDigitalGoodsService`
  + `PaymentRequest`), with Restore purchase via `listPurchases()`. Outside the
  Play-installed TWA the service does not resolve and the button says so — no fake
  purchase flow. Receipt validation is server-side work, deferred with the rest of
  Phase C2.
- The header badge was a decorative "PREMIUM" label on every install. It now shows
  the real plan and taps through to Settings.

### Gmail import (§6.2 #3)
Relabelled **Advanced**, gated behind Premium, and carrying a warning that states
plainly what the current design means: the read-only token stays in this browser,
which is also to say no server is protecting it. Moving it to a Worker stays open.

### Spend insights (P2)
Six-month bar chart, monthly average and highest-spend card, derived on-device from
payments already recorded here. No statement parsing, no upload — the recorded
payments are the same numbers a parser would produce.

### Fixes found on the way
- The worker's notification actions opened `/` — the landing page, not the app. Now
  `./index.html`, with the card id preserved.
- `?action=snooze` from the notification's Snooze button was never handled by the
  page; it silently did nothing. Snooze now writes one dedupe key that silences the
  page check and the background check together.
- On-time payment rate counted bills due *next month* as unpaid — a perfect record
  showed as 50%. The denominator is now bills whose due date has arrived.
- `dueReminders` range-checks `dueDay` (1–31). An imported backup with a negative
  day walks the date maths into the past and reminds forever. Found by mutation
  testing, not by review.

### Verification (§0.3 gate — all four)
1. **Syntax:** `node --check` on both inline blocks, `service-worker.js`,
   `reminder-core.js` — PASS.
2. **Tests:** `node 7_card_guard/test-cardguard.mjs` — 34 cases PASS. Mutation
   tested 16/16 killed. (One further mutant — the day stamp swapped for
   `toISOString()` — is equivalent: both are deterministic per local day.)
3. **Runtime:** served at :8904 with the SW and all caches cleared. Fresh install
   cached 7 files into `cardguard-v2`; free plan admitted 2 cards and paywalled the
   3rd; `buyPremium()`/`restorePurchases()` on the plain web reported "only in the
   Play Store version" and granted nothing; the Test button proved the whole
   background chain — page mirror → worker read → `importScripts` core → correct
   reminders selected → `showNotification` attempted → failure reported back to the
   page — and left `notified` empty so it retries; marking a bill paid removed it
   from the worker's due list; snooze silenced today and not tomorrow; insights
   arithmetic checked by hand (avg ₹13,300, Aug ₹26,700, top card ₹27,500).
4. **Regression:** all 4 tabs render, card flip, bill expand, every modal opened and
   closed, reload persistence (3 cards, premium, 5 paid bills, snooze key), privacy
   page renders with 11 sections. 0 app console errors.

**Not verifiable here:** the notification actually painting. Granting the OS
notification permission needs a click on a browser prompt, and calling
`Notification.requestPermission()` from automation froze the tab. Everything up to
and including the `showNotification` call is proven; the remaining step is a
one-tap check on a real device.

## PG Buddy — real listings pipeline (2026-08-15)

Implements EXECUTION_PLAN §4.6 as far as it goes without a backend. The Supabase-dependent
P1 items (photo storage, featured placement) are untouched.

- **Listings left the source file.** The 8 PGs were 264 lines of object literal inside
  `index.html`; they are now `pgs.json`, loaded through the same shape MeterSmart already
  proved: versioned, schema-validated, localStorage cache first, network refresh after, SW
  serving the file network-first so a newly verified PG is never pinned stale. **Adding a
  listing is now editing one file.** The rows are flat enough to become a Supabase table, and
  that migration is changing the fetch URL in `refreshPGs()`.
- **The validator rejects a payload whole**, never row by row. A half-valid publish showing
  half the listings is worse than showing the previous set, and duplicate ids would make
  `openDetail()` and `toggleSave()` ambiguous, so those are rejected too.
- **Owner submission funnel** (Profile tab): five fields → a prefilled WhatsApp or mailto
  intent, recipients configurable via `listingContact` in `pgs.json`. Deliberately not a
  database write — submissions come to you and you verify by visiting, which is the only thing
  that makes the "Verified" badge worth charging for.
- **The Contact button was a lie.** It toasted "Contact details copied!" and copied nothing.
  It is now a real `wa.me` deep link with a prefilled message naming the PG and area, and a
  10-digit Indian number gets `91` prepended. **Numbers ship blank in `pgs.json`** — inventing
  plausible mobile numbers would have pointed real users at real strangers — and the button
  says no number is listed rather than opening an empty chat.
- **Budget slider is a real filter** (WORK_LOG below lists it as a deliberate skip). It
  defaults to the top of its range, meaning "Any budget", so the app does not open with two
  thirds of the listings hidden behind a default nobody chose.
- Distinct empty state for "couldn't load listings" — telling someone to adjust filters they
  never set is the wrong answer to a network failure.
- SW → `pgbuddy-v2`.

### Verification (§0.3 gate — all four)
1. Syntax: `node --check` on both inline blocks + service-worker.js → PASS. `pgs.json` parses.
2. Runtime: served at `:8903`, SW and caches cleared first. 8 listings loaded from JSON and
   cached; budget filter correct at every stop (20k/10k/7k/5k → 8/5/2/0 shown); WhatsApp and
   mailto intents correct; owner form rejects a short phone and a negative rent.
   **0 console errors.**
3. Persistence: reload → listings cache, saved PGs and reviews all survived.
4. Regression: all 4 tabs render; compare and the detail modal build from the loaded data;
   featured/list/swipe views and both `<select>`s populate from it.
5. **Live publish test:** wrote a v2 `pgs.json` with a 9th listing while the app was running.
   Reload picked it up into the deck, the selects and its contact button, and `listingContact`
   from the file drove the submission target. File restored to v1 afterwards.
6. `test-pgs.mjs`: 28 cases. Mutation tested, 14/14 killed. The `res.ok` survivor was a real
   gap — the validator was catching my 404 stub, so the HTTP check itself was untested; added
   a case where a non-OK response carries a *valid* body, which a CDN error page can.

Note on the test harness: the first run reported PASS and then threw. The async cases share
fixtures and the runner was not awaiting them, so one case's `reset()` landed inside another's
refresh. The runner now collects and awaits sequentially.

**Still demo data:** the 8 rows are the original mock listings with blank contacts. Real
listings replace them; nothing else has to change.

---

## StockPing — affiliate + price tracking (2026-08-15)

Implements EXECUTION_PLAN §4.3 P0 affiliate rewrite and both P1 items. The other P0
(server-side checking) is **not** done — it needs a Cloudflare Worker that does not exist yet.

- **Affiliate rewrite (the revenue).** `affiliateUrl()` sets `tag=` for Amazon and `affid=`
  for Flipkart, preserving path and existing query params, replacing rather than duplicating
  an existing tag, and returning the URL untouched on anything it does not recognise or cannot
  parse. Every outbound click routes through `openProductPage()`, so the tag is applied in
  exactly one place. **`AFFILIATE` ships with empty tags** — an unset tag is a pass-through, so
  this is safe to deploy before the Associates accounts exist.
- **Buy now on alerts.** Restock and price-drop alert cards get a button (the highest-intent
  click in the app), shown only when the alert is actionable and the product is still tracked.
- **Price tracking.** `price` + `lowestPrice` per product, rendered on the card, with drop
  alerts and notifications. Only a genuine drop alerts: first-seen, unchanged and rising prices
  do not. This matters because checks run on a timer — an off-by-one here spams forever.
- **JSON-LD scrapers.** schema.org `Product` / `offers` is now the primary source for name,
  price and availability, walking `@graph` and array forms and skipping malformed blocks; the
  old keyword regex is the fallback. This fixes the real failure mode: a "Sold Out" string in
  a recommendation carousel deciding the answer for the product you actually tracked.
- **Deduplication, not addition.** `checkProduct` and `fetchAndDetect` each carried their own
  copy of the proxy list, the stock regexes and the parse logic, and the copies had already
  drifted (different length floors, different patterns). Both now share `fetchPage()` and
  `extractProductData()`. `checkSingleProduct` and `checkAllProducts` likewise shared nothing
  and now both call `applyCheckResult()` — otherwise price bookkeeping needed writing twice.
- SW → `stockping-v2`.

### Verification (§0.3 gate — all four)
1. Syntax: `node --check` on both inline blocks + service-worker.js → PASS.
2. Runtime: served at `:8902`, SW and caches cleared first, `window.fetch` stubbed so the
   third-party CORS proxies were never contacted and the test stayed deterministic. Added a
   product through the real `processUrl`/`trackProduct` flow (name, price and status all read
   from JSON-LD), then a restock at a lower price produced exactly one stock alert and one
   price alert, both rendering correctly. **0 console errors.**
3. Persistence: reload → products (with `price`/`lowestPrice`) and all alerts survived.
4. Regression: all 3 tabs render; stats bar correct.
5. `test-stockping.mjs`: 26 cases. Mutation tested, 13/14 killed. The `<=` survivor was a real
   gap — with it, an unchanged price alerts on every timer pass — so it got a test. The
   remaining survivor is the `oldPrice != null` guard, redundant only because `null` coerces to
   0 in the comparison; kept deliberately and commented, since leaning on that coercion on a
   money path is exactly the kind of thing that breaks later.
6. Affiliate behaviour verified through the real button: tagged exactly once, `ref` preserved,
   Flipkart got `affid` and not `tag`, Myntra untouched, empty config passed through clean.
7. Backward compatibility: alerts saved before this change have no `type` field. Injected a
   synthetic legacy record and confirmed it still renders as a stock change.

**Still open (§4.3 P0):** server-side checking. The client still routes every tracked URL
through allorigins/corsproxy, which see all of them — flagged with a `ponytail:` comment at
the proxy list. That is a Worker job and belongs to Phase C.

---

## LingoLocal — roadmap build-out (2026-08-15)

Implements EXECUTION_PLAN §4.2 P0+P1. One app, no new dependencies, no backend.

- **Bundled phrase audio (the P0 moat).** 108 Opus clips, 487 KB total, precached by the
  service worker at install — the app is fully voiced offline even on the many Android
  devices that ship no Kannada TTS voice. `tools/gen-audio.mjs` generates them from the
  macOS `kn_IN` system voice, reading `SCENARIOS` straight out of `index.html` so the clip
  set can never drift from the phrase set. Placeholders are stripped before synthesis
  (`"[place] ಗೆ ಎಷ್ಟು?"` must not be read aloud as the word "place"), while the card still
  shows the bracket. Playback is clip-first, device TTS second — the reverse of before.
  **The audio is synthesised, not a native speaker.** It fixes availability, not accent;
  human recordings drop in under the same filenames.
- **Spaced repetition (SM-2-lite).** `ll_srs` holds `{ease, interval, due, reps}` per phrase.
  One scheduler, two surfaces: the flashcard deck opens most-overdue-first and the quiz asks
  the most-overdue phrase. Grades come from what the user already does — Learned = 5, quiz
  correct = 4, quiz wrong = 2 — so no new buttons appeared. The quiz shuffles before a stable
  sort so a fresh install (everything equally due) doesn't ask the same phrase forever.
- **Deck ordering is keyed, not positional.** `currentPhraseIdx` is now a position in
  `state.deck`; every phrase lookup, learned flag and bookmark goes through
  `state.deck[currentPhraseIdx]`. Getting this wrong would have silently attached progress to
  slots rather than phrases — verified in the browser that learned markers follow the phrase.
- **3 new packs**: At the Office, At the Hospital, Temples & Festivals. 16 → 19 scenarios,
  90 → 108 phrases. Placed in existing categories/themes, so no CSS changed.
- SW → `lingolocal-v2`, precaching clips individually (`cache.addAll` is all-or-nothing and
  one missing clip must not fail the install).

### Verification (§0.3 gate — all four)
1. Syntax: `node --check` on both inline blocks + service-worker.js → PASS.
2. Runtime: served at `:8901`, driven in Chrome after unregistering the SW and clearing all
   caches (the 2026-08-07 entry below records a test loop poisoned by a stale cache-first SW).
   Fresh install → 19 scenarios / 108 phrases / 19 cards; Speak requested the correct clip for
   the reordered deck; quiz picked the most-overdue phrase and graded it. **0 console errors.**
3. Persistence: reload → `ll_srs`, learned and bookmarks survived; deck stayed in scheduled
   order (`2,3,4,6,7,0,1,5`), not authored order.
4. Regression: all 3 tabs render; 6 category rings, 20 numbers, stats correct.
5. `test-srs.mjs`: 15 scheduler cases PASS. Mutation tested, 10/10 killed — the one survivor
   was an explicit `|| (a - b)` tie-break that ES2019's stable-sort guarantee makes dead code
   on a `[0,1,2,…]` input; deleted it rather than write a test that cannot fail.
6. Audio proven to decode without playing it: valid `OggS`, `canPlayType('audio/ogg;
   codecs=opus')` = `"probably"`, `decodeAudioData` → 2.30s / mono / 48 kHz, matching ffprobe.

**Known gap:** `clip.play()` under a real user gesture is not verifiable in this harness — the
automation tab stays `visibilityState: "hidden"` and Chrome refuses media playback there, so
`readyState` stays 0 no matter the gesture. A missing clip provably falls back to
`speakPhrase()`, so the worst case is the old TTS behaviour. Tap Speak once on a real device.

---

## MeterSmart — roadmap build-out (2026-08-01)

Implements EXECUTION_PLAN §4.1 end to end. One app, no new dependencies, no backend.

- **Remotely updatable rates.** `DEFAULT_RATES` (bundled) → `fares.json` (same origin) with a
  monotonic `version`. Flow: bundled → localStorage cache → network refresh; only applied if
  `validRates()` passes *and* the version is higher. A tariff revision is now a one-file edit
  and a redeploy. SW serves `fares.json` network-first so it can never be pinned stale.
- **Nothing hardcoded any more.** Breakdown rows, option sub-labels, popular-route fares, the
  meter status line and the share text all derive from `FARE_RULES`. Route fares moved to
  `data-km` + `meterFareFor()`, which also deduped the fare formula that the ride-log
  distance listener was repeating.
- **"Verified {date}" line** under the fair-fare badge, plus source + version in Profile.
- **Ride-app estimate card** (Ola/Uber/Rapido): a *range* from the meter fare × configurable
  multipliers + flat fee, explicitly labelled an estimate — these apps price dynamically, so a
  single number would be a lie.
- **Night auto-detect**: 10 PM–5 AM (configurable) turns the surcharge on at launch; touching
  the toggle sets `nightManual` so auto-detect never fights the user again that session.
- **Complaint → WhatsApp / email intents.** `wa.me` opens the contact chooser when no number is
  configured; `mailto:` with subject + body prefilled. Recipients live in `fares.json`.
- **Kannada toggle** (`data-i18n` + `I18N`): header, nav, calculator, breakdown, badge, share.
  Ride Log / Tips / Profile bodies are still English-only.
- **New:** `privacy.html` (Play Store + AdSense prerequisite), repo-root `_headers` (CSP for
  MeterSmart + LingoLocal, security headers site-wide). SW cache → `metersmart-v2`.

### Verification (§0.3 gate — all four)
1. Syntax: `node --check` on both inline blocks + service-worker.js → PASS. `fares.json` parses.
2. Runtime: served at `:8899`, driven in Chrome. Fresh install, Kannada toggle round-trip,
   complaint generation + intent URLs (window.open stubbed), night math (₹161 surcharge on a
   ₹215 base at 1.75×), validator rejecting 5 malformed configs. **0 console errors.**
3. Persistence: reload → language, 6 rides and 1 complaint survived and re-rendered.
4. Regression: all 5 tabs opened, all render.
5. Live rate push (real fetch, not a stub): served `fares.json` v2 with `perKm: 18` → app
   applied it on reload, 10 km went ₹150 → ₹174, all route cards recomputed, v2 cached.
   File restored to v1 afterwards.

### Validator verification, finished (2026-08-07)

The review left the hardened `validRates()` verified only in isolation, and the earlier
in-browser passes were suspect anyway — a cache-first service worker had been serving stale
`index.html` through every reload of that test loop. Redone without the browser in the path:

- **`test-fares.mjs` extended** with 9 load-path cases that run the *real* `loadCachedRates()`
  / `refreshRates()` / `applyRates()` (pulled out of `index.html`, never copied) against stub
  `localStorage` + `fetch`. Asserts `FARE_RULES` is unchanged when: nothing is served, the
  served config is invalid, it isn't newer, the fetch 404s, the cache is corrupt, the cache is
  newer-but-poisoned, or the cache is the same version — and that it *does* move, toast, and
  persist on a valid newer config. A validator nothing gates on is decoration; this is the part
  that proves the gate is wired.
- **Mutation-tested, 10/10 killed.** Each mutant is a plausible regression applied to
  `index.html`, with the suite expected to fail: dropping either gate in `refreshRates`,
  dropping either gate in `loadCachedRates`, `>` → `>=` on the cache version, ignoring
  `res.ok`, skipping the `FARE_RULES` assignment, skipping the localStorage write, dropping the
  `perKm` range check, `int` → `num` on `nightStartHour`, dropping the `max < min` estimate
  check. The first run had 2 survivors on the cache path (no case was both version-valid and
  rate-invalid, and none sat at the boundary version) — both cases added, both mutants now die.
- Control run on unmutated source: PASS. `node --check` on the inline script: PASS.
- Suite now reports: `PASS — 22 rejected, 7 accepted, 9 load-path cases, fares.json v1 valid`.

Unchanged from the review: `applyRates()` shares the `DEFAULT_RATES.appEstimates` array by
reference rather than cloning it. Nothing mutates those entries, so it's harmless today.

---

# Work Log — Code Review & Fixes (2026-07-11)

Full review of all 7 PWA apps. Each app's JS logic was read end-to-end; fixes below are
committed to the working tree (not yet committed to git). All inline scripts pass `node --check`.

## 1. PowerPulse (outage tracker)
- **Added localStorage persistence** for outages — user reports previously vanished on reload.
- **Auto-expiry**: active outages older than 12h move to resolved (capped at 10) so stale data doesn't live forever.
- Fixed toast timer race (overlapping toasts cut each other short).
- Report descriptions are now shown in the area detail sheet (were collected but never displayed), HTML-escaped.

## 2. MeterSmart (auto fare calculator)
- **Fixed XSS**: ride from/to and complaint plate/route (user input) were rendered via innerHTML unescaped — added `esc()`.
- Fixed `adjustDistance` relying on global `event.currentTarget` (breaks in Firefox) — now passes `this`.
- Removed dead savings logic in `logRide` (was overwritten by `recalculateSavings()` immediately).
- Complaint generator now rejects charged ≤ meter fare (previously produced negative overcharge complaints).
- Toast timer race fixed.

## 3. PG Buddy (PG finder)
- **Swipe deck end state**: previously showed misleading "No PGs found" with no way to continue — now shows "You've seen all N PGs" with a Start Over button (`restartDeck()`).
- **Fixed XSS**: user review best/worst text escaped before innerHTML render.

## 4. NestHub (apartment community)
- **Fixed RSVP counter bug**: `innerHTML.replace(/\d+/)` hit `width="14"` inside the SVG icon first — corrupted the icon and never updated the count. Now updates only the text node.
- **Added Cancel Pass**: visitor passes persisted forever with no way to remove them — expanded card now has a cancel button.
- **Fixed XSS**: visitor name/purpose (user input) escaped.

## 5. LingoLocal (Kannada phrasebook)
- **Fixed streak bug**: first-time visitors saw "0 Day Streak" — off-by-one in `updateStreak`; now day 1.
- **Added real audio**: the "Speak" button previously only showed a text popup. Now uses native `speechSynthesis` — Kannada voice (`kn-IN`) when installed, otherwise reads the transliteration in `en-IN`.

## 6. StockPing (stock tracker)
- **Removed duplicate `checkAllProducts`** — the file defined it twice; the first (buggy) version was dead code (~40 lines).
- **Fixed XSS**: "open product page" used `onclick="window.open('${url}')"`; `escapeHtml` doesn't escape single quotes, so a URL containing `'` could inject JS. Now opens by product id.
- Removed a no-op `visibilitychange` listener.

## 7. CardGuard (credit card bill reminders)
- **Fixed "due today" bug**: `getNextDueDate` rolled a bill due *today* to next month (`<=` → `<`), so it showed "due in ~30 days". Also the "Due Today" badge branch was unreachable (dead code ordering) — fixed.
- **Fixed notifications never firing in Chrome**: `new Notification()` with an `actions` array throws (actions are SW-only); the try/catch swallowed it, silently killing the app's core feature. Removed `actions`.
- **Snooze now works**: was a fake toast; now sets the per-day suppression key that `checkAndNotify` checks.
- last-4 digits now validated as numeric (`/^\d{4}$/`).
- **Fixed XSS**: card nickname escaped in all 4 innerHTML render sites.

## Verification
- `node --check` on extracted inline scripts of all 7 apps: PASS.
- Not yet done: in-browser smoke test of each app; git commit.

## Deliberate skips (YAGNI)
- No backend/real data for the demo apps (PowerPulse/NestHub/PG Buddy are mock-data by design).
- PG Buddy budget slider still a preference, not a filter.
- NestHub complaints still toast-only (no complaint list UI exists to render into).
