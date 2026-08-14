# Work Log

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
