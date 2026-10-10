# MeterSmart — Review

**Date:** 2026-10-10 · **Reviewer:** Claude (Opus 5.5) · **Baseline:** `c6d74dd`
**Read in full:** `index.html` (CSS 16–936, markup 938–1667, script 1669–2695),
`service-worker.js`, `manifest.json`, `fares.json`, `privacy.html` (placeholders),
`test-fares.mjs` (PASS: 22 rejected, 7 accepted). Also the `/2_meter_smart/*` block in
`_headers` and EXECUTION_PLAN §4.1. Design detector: `impeccable detect.mjs`.
Line numbers refer to the baseline commit.

## Verdict

The architecture is the best in the repo. The fares come from a versioned, validated,
remotely updatable `fares.json`, and every number on screen is derived from it. **But the
numbers in it are wrong.** Bengaluru auto fares changed on **1 Aug 2025**. The app still
calculates with the old tariff and labels it "Official rates · verified 1 Aug 2026". A
fare calculator that understates the legal fare by 17–20% flags honest drivers as
overcharging and pre-fills complaints against them. That is the most serious defect in this
app, and it is a config fix plus one formula. The second problem is fake ride history that
comes back after "Clear All Data".

## Keep: works, don't change

- **The `fares.json` pipeline.** Monotonic `version`, reject-whole `validRates()`, network-first
  in the SW, and `must-revalidate` at the edge. A tariff change is a one-file deploy. That is
  exactly why the P0 below is cheap to fix.
- `test-fares.mjs` pulls the real validator out of `index.html`, so it cannot drift out of sync.
- One rate object drives every label, the route-card fares, the share text and the
  app-estimate rows (`renderLabels`, 1956–1983).
- `esc()` is used on every ride and complaint render. The complaint preview uses `textContent`.
- WhatsApp / mailto complaint intents. An unset number opens the chooser instead of a dead chat.
- Night auto-detect, where a manual override wins for the session.
- The Kannada toggle, including putting the time-of-day word first ("ರಾತ್ರಿ 10", not "10 PM").
  That detail shows care.
- Ride-app prices are shown as a *range* and labelled as estimates. That is honest.
- The look: yellow-and-black auto-meter styling and JetBrains Mono meter digits fit the domain.
- Toggle switches already carry `role="switch"` + `aria-checked`, which most apps here lack.

## Findings

Severity: **P0** breaks data, trust or the core flow · **P1** real bug or WCAG AA failure ·
**P2** minor · **P3** polish.

### P0

- [x] **The tariff is a year out of date.** `fares.json` and `DEFAULT_RATES` (1676–1701) say
  ₹30 for 2 km + ₹15/km, waiting ₹5 per 15 min, luggage ₹5 per piece. The **Bengaluru
  revision effective 1 Aug 2025** sets:
  - ₹36 for the first 2 km, ₹18/km after that
  - waiting: first 5 min free, then ₹10 per 15 min *or part thereof*
  - luggage: first 20 kg free, then ₹10 per extra 20 kg (max 50 kg)
  - night: 1.5× from 10 PM to 5 AM (unchanged)

  For a 10 km trip the app says ₹150 and the legal fare is ₹180. So "Overcharged" is shown for
  honest drivers, and the complaint text says "as per Bangalore Transport Authority rules".
  **Fix:** ship `fares.json` v2 and `DEFAULT_RATES` v2 together. The waiting formula
  (`Math.floor(min / 15) * 5`, 2099) has no free period and rounds down where the rule rounds
  up: add an optional `waitingFreeMinutes` and use `ceil`. Relabel luggage as "per extra 20 kg".
  Sources: [The Week](https://www.theweek.in/news/biz-tech/2025/07/15/bengaluru-auto-fare-hike-everything-you-need-to-know-about-the-price-revision-from-august-1.amp.html),
  [The South First](https://thesouthfirst.com/karnataka/auto-fares-revised-in-bengaluru-effective-from-august-1/),
  [Deccan Herald](https://www.deccanherald.com/amp/story/india%2Fkarnataka%2Fbengaluru%2Fbengaluru-auto-fares-to-increase-from-august-1-3630129).
  **Also:** do not set `lastVerified` to a date unless someone has actually checked the source
  on that date.
- [x] **Fake ride history that will not stay deleted.** `initDefaults` seeds 6 mock rides
  (Dec 2024–Jan 2025) and "Total Saved ₹340" whenever `rides` is empty (1764–1776; default
  `totalSaved: 340` at 1716). A new user sees someone else's rides and a 67% "Fair Ride
  Score". *Clear All Data does not stick*: after a reload, `rides.length === 0` reseeds the
  fakes. **Fix:** delete the seed and default `totalSaved` to 0. The empty state already exists (2378).
- [x] **Every app's service worker deletes every other app's caches.** `service-worker.js:10`
  keeps only `CACHE_NAME` across the whole shared origin. The details are in
  `1_power_pulse/REVIEW.md`. **Fix:** `k.startsWith('metersmart-') && k !== CACHE_NAME`, and bump to `metersmart-v3`.

### P1

- [x] **"Total Saved" counts money lost.** It sums the overcharges the user *paid*
  (2366–2374). A rider overcharged ₹80 sees "Saved ₹80". **Fix:** rename it "Overpaid" in both
  places (1219, 1561).
- [x] **Logging a night ride marks it overcharged.** The log form auto-fills the *day* fare
  (2679–2685). A ride paid at the legal 1.5× night rate is logged as "Overcharged +50%".
  **Fix:** apply the night multiplier when `isNightNow()`. The field stays editable.
- [x] **Dates are UTC, not local.** `toISOString().split('T')[0]` (1781, 2337) gives
  *yesterday's* date between 00:00 and 05:30 IST, which is inside the night window where
  overcharging is most common. Complaint dates come out wrong. **Fix:** format the local date.
- [x] **Unverified legal claims in Tips / Your Rights.** "Under Section 66 of the Motor
  Vehicles Act all autos must ply by meter" (1459): Section 66 is *Necessity for permits*.
  "Fine ₹500" (1423) and "one-way return charge abolished since 2024" (1445) have no source.
  Riders will quote these in a dispute. **Fix:** verify each claim against a source and cite
  it, or remove the specific number or section.
- [x] **Switches cannot be used from the keyboard.** The `role="switch"` divs have
  `tabindex="0"` but only `onclick` (1055, 1590), so Enter and Space do nothing. Popular-route
  cards are clickable `<div>`s (1151–1200). **Fix:** use `<button>`.
- [x] **Pinch-zoom disabled** (line 5, `user-scalable=no`). Fails WCAG 1.4.4.
- [x] **Contrast failures.**
  - Light `--text-muted` `#94A3B8` on white: 2.56:1. Used by section titles, inactive nav and sub-labels.
  - Dark `--text-muted` `#64748B` on `#1E293B`: 3.07:1.
  - `--green` text on white: 2.54:1 ("Fair ✓", fair amounts).
  - `--yellow-dark` on white: 3.19:1 (active nav).

  Fails WCAG 1.4.3.
- [x] **No visible keyboard focus.** There is no `:focus-visible` rule, and the distance input
  sets `outline: none` (360).

### P2

- [ ] No way to delete a single ride or complaint. "Clear All Data" is the only eraser.
- [ ] **Saved Locations do nothing.** Home/Work are entered via `prompt()` (2599–2613),
  stored, and then never used. **Fix:** make them one-tap From/To fill chips in Log and
  Complaint, or remove the card.
- [ ] **Distance rounding is unverified.** `Math.ceil(km - baseKm) * perKm` charges 2.1 km as
  3 km (₹54 vs ₹37.80 pro-rata). Check how Bengaluru meters actually step (per km or per
  100 m) before "You Should Pay" claims a rupee figure.
- [x] Splash: 1.5 s + 0.5 s fade on every launch (1743–1749).
- [x] Toast has no `aria-live` (1664). Form `<label>`s have no `for` (1238–1335).
- [x] Emergency numbers are not `tel:` links (1478, 1487, 1496). Add 112.
- [x] "No complaints filed yet" (2545): these are generated drafts, not filed complaints.
- [ ] Kannada covers only the calculator. Ride Log, Tips and Profile are English (a known open item).
- [x] Night auto-detect runs once at load. An app left open across 10 PM keeps the day rate.
- [ ] `privacy.html` still has `REPLACE_WITH_CONTACT_EMAIL` (known, NEXT_STEPS §3).

### P3 / design-detector findings (taste: leave unless redesigning)

- Side-tab borders (663, 763). Splash bounce (105). Overshoot easings (417, 620, 857).
  `height` transition on the fare bars (620). Yellow glow on dark (351).
- Profile filler: "MeterSmart User", "Riding smart since 2024".
- SVG-only icons (cross-app; see PowerPulse).

## Status — 2026-10-10

Fixed this session (`test-fares.mjs` PASS: 10 tariff cases, 24 rejected, 8 accepted,
9 load-path cases. 3/3 mutants killed: floor-for-ceil on waiting, free minutes ignored,
fractional km. Headless Chrome 24/24: every tab, reload persistence, legacy-seed
migration, Clear All stays cleared, 0 app console errors):

- `fares.json` and `DEFAULT_RATES` are v2 at ₹36 / 2 km + ₹18/km, waiting ₹10 per 15 min after
  5 free (ceil), luggage ₹10 per extra 20 kg capped at 2, night 1.5×. Both are verified
  against press reports of the 14 Jul 2025 notification, and a test now fails if the
  two drift apart.
- One pure `fareBreakdown()` prices everything.
- Seeded rides are deleted, and existing installs drop ids 1–6 on load. "Overpaid" replaces "Total Saved".
- Night-aware auto-fill. Local dates.
- Tips: the unsourced Section 66, ₹500 and "since 2024" claims are removed.
- The unverified "080-2294 2222" helpline is replaced by 112. 103 and 1091 are now `tel:` links.
- Keyboard-operable switches and route cards. Zoom on. `:focus-visible`. Contrast tokens.
- Labelled inputs. Live toast. No splash delay. Night re-check every minute.
- SW `metersmart-v3` with a scoped purge.

Still open: per-ride delete; Saved Locations; distance rounding (needs a source, marked
`ponytail:` in `fareBreakdown`); Kannada for the other tabs; the privacy contact email;
confirming the tariff against the official notification itself (press-sourced today).

## Work order

1. Fares v2: config, bundled defaults, waiting free period + ceil, luggage label. Extract a
   pure fare function and test it against the official examples.
2. Remove the seed rides, fix "Overpaid", night-aware auto-fill, local dates.
3. SW purge scope + `metersmart-v3`.
4. A11y: buttons for switches and route cards, zoom, focus ring, contrast tokens, labels, live toast.
5. Legal-claims pass on Tips (verify or soften). P2 items as time allows.
