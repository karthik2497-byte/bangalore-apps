# PowerPulse — Review

**Date:** 2026-10-10 · **Reviewer:** Claude (Opus 5.5) · **Baseline:** `c6d74dd`
**Read in full:** `index.html` (CSS 16–1886, markup 1888–2285, script 2289–3028),
`service-worker.js`, `manifest.json`, the `/1_power_pulse/*` block in `_headers`,
EXECUTION_PLAN §4.5, WORK_LOG history. Design detector: `impeccable detect.mjs`.
Line numbers refer to the baseline commit.

## Verdict

The shell is good. The data is not. PowerPulse is live at
`tinkerhouse.uk/1_power_pulse/` and presents itself as a crowdsourced, real-time outage
tracker, but there is no backend. Every number a first-time user sees is invented.
A timer adds fake reports every 30 seconds and saves them, and the Patterns tab shows
"predictions" from hardcoded December 2024 data. The roadmap calls the app "a demo
until the backend lands", but the UI does not say so anywhere. That is the main
problem. The useful part is a personal outage log with real one-tap actions (call
BESCOM, share to the society WhatsApp group), and it can stay honest without a server.

## Keep: works, don't change

- Single file, no dependencies, `'use strict'` IIFE. Every storage key is `pp_`-prefixed
  (`pp_outages`, `pp_userArea`, `pp_darkMode`, `pp_notif*`), which follows the shared-origin rule.
- The 12-hour auto-expiry of active outages (2350–2358). Stale reports must not live forever.
- `showToast` writes the message via `textContent` (2513). The report description is escaped
  before it reaches the sheet (2764).
- Area `<select>`s are built with `createElement` + `textContent` (2782–2799), so they are safe.
- The report form calls `preventDefault()`. That is required, because the CSP has `form-action 'none'`.
- Visual identity: dark navy, the bolt mark, and the Bangalore skyline strip in the header
  (1936–1941). It is distinctive. Keep it. The light theme is complete, not a stub.
- The area bottom sheet (2267–2276) is the right pattern for drill-down on mobile.
- `100vh` → `100dvh` fallbacks (188–189, 312–313) handle mobile browser chrome correctly.

## Findings

Severity: **P0** breaks data, trust or the core flow · **P1** real bug or WCAG AA failure ·
**P2** minor, workaround exists · **P3** polish.

### P0

- [x] **Every app's service worker deletes every other app's caches.** `service-worker.js:21–24`
  keeps only `CACHE_NAME` and deletes every other cache. Cache Storage is per *origin*, and all 7
  apps share `tinkerhouse.uk`. So when this worker activates, it wipes LingoLocal's 108 precached
  clips, MeterSmart's shell, and CardGuard's `cardguard-state` mirror. That last one silently
  stops CardGuard's background bill reminders. All 7 workers have the same bug, so any app can
  break any other. After a wipe, the victim app fails to launch offline, because its fetch handler
  falls through to the network. **Fix:** delete only this app's own old caches:
  `keys.filter(k => k.startsWith('powerpulse-') && k !== CACHE_NAME)`. Bump `CACHE_NAME` → `powerpulse-v2`.
  This is the cache equivalent of AGENTS.md rule 2 (namespace every `localStorage` key).
- [x] **Fabricated live activity.** `init()` runs a `setInterval` (3006–3014). Every 30 s it adds
  1–3 reports to a random active outage and *persists* them. A user's single report reads
  "7 people reported" a few minutes later. **Fix:** delete it. Reuse the timer to re-run expiry
  and re-render, so "47m ago" labels stop freezing (see P1 *expiry only at load*).
- [x] **Seed data shown as live.** Four active and two resolved outages are hardcoded with
  timestamps relative to `now` (2305–2339). A fresh install says "Whitefield, *transformer area
  sparking reported*, 31 people reported, 35m ago". Once those expire, "All Clear, *No outages
  reported in Bangalore*" is just as unfounded. **Fix:** start empty. Status copy should only
  claim what the device knows ("No outages logged", "Reports you log are kept on this phone").
- [x] **"Community" claims with no community.** "Help your community stay informed" (2023),
  "Thank you for helping your community" (2853), "N people reported" (2622, 2647),
  "Data refreshed!" from a refresh button and pull-to-refresh that fetch nothing (2665–2692),
  and a 1.5 s fake submit spinner (2831). **Fix:** delete the fake refresh, pull-to-refresh and
  delay. Use honest units ("1 report"). Add a one-line on-device notice. Give the report a real
  community channel: **Share** (Web Share, falling back to `wa.me/?text=`). Posting to the
  society WhatsApp group is how Bangalore residents actually spread outage news.

### P1

- [x] **Patterns tab is fabricated.** Weekly counts, "Predicted Outage Windows, *based on
  historical patterns*", and "Past Outages" dated Dec 2024 are hardcoded for 4 areas, and the
  other 11 areas get one shared `defaultPattern` (2375–2447). **Fix:** derive the weekly chart
  and the history from the device's own logged outages. Show a "Nothing logged for X yet" empty
  state. Show "most frequent window" only when there are ≥ 3 logged outages, otherwise hide it.
- [x] **No "power's back" action.** An outage can only end by auto-expiring at 12 h. Every
  resolved duration is therefore a 12-hour artefact, and the history cannot be trusted.
  **Fix:** add a "Power's back" / "Water's back" button on the active card and in the area sheet
  that sets `resolvedAt = Date.now()`.
- [x] **Notification toggles do nothing.** Power/Water/Resolved alerts (2145–2180) save a
  preference that no code reads. Nothing ever notifies. **Fix:** remove the group until the
  §4.5 area-subscription push exists.
- [x] **Severity is collected, never shown, and sometimes thrown away.** No card or sheet
  displays it. A second report for the same area and type discards the new description and
  severity (2844–2847). This was flagged as "invisible as UX" in WORK_LOG, not fixed.
  **Fix:** show a severity chip. On a duplicate, keep the max severity and the latest description.
- [x] **Severity labels start wrong.** The markup marks "Severe" active (2060) while the slider
  value is 2 (2062). **Fix:** mark `data-sev="2"` active.
- [x] **Expiry only at load.** The filter at 2351 runs once. An outage that passes 12 h while
  the app is open stays active, and every relative time freezes. **Fix:** run expiry + render
  on the 30 s timer.
- [x] **Pinch-zoom disabled.** `maximum-scale=1.0, user-scalable=no` (line 5). Fails WCAG 1.4.4.
  **Fix:** remove both.
- [x] **Keyboard focus is invisible.** There is no `:focus-visible` rule anywhere, and toggles
  and the slider set `outline: none` (1215, 1731). Fails WCAG 2.4.7. **Fix:** one global
  `:focus-visible` ring.
- [x] **Muted text fails contrast.** `--text-muted` is 3.81:1 in dark (`#64748B` on `#0A1628`)
  and 2.32:1 in light (`#94A3B8` on `#F0F4F8`). It is used for timestamps, empty states and
  labels. Fails WCAG 1.4.3. **Fix:** retune both tokens to ≥ 4.5:1.
- [x] **Semantics.** Toggles have no `role="switch"` / `aria-checked`. Filter pills have no
  `aria-pressed`. Map tiles are clickable `<div>`s (2711) that keyboard and screen-reader users
  cannot reach. The bottom sheet has no `role="dialog"`, Escape key, close button or focus
  return. Form `<label>`s are not tied to their controls (2027, 2038, 2051, 2055). The toast
  has no `aria-live` (2279).

### P2

- [x] **Helplines are not tappable.** BESCOM 1912 and BWSSB 1916 are plain text (2215, 2224).
  During an outage, calling is the most useful action the app offers. **Fix:** `tel:` links.
  Also show the right helpline inside the area sheet when an outage is active.
- [x] **Splash adds ~2 s to every launch.** It waits for `load` + 1500 ms + a 500 ms fade
  (2471–2476). A tool you open during a power cut should open instantly. **Fix:** hide the
  splash right after the first render.
- [x] **Unguarded `localStorage.setItem`** (2361, 2946, 2962, 2978). A storage quota error
  thrown by `saveOutages()` at 2363 aborts the IIFE before any handler is bound, which leaves a
  dead app. **Fix:** try/catch inside `saveOutages`.
- [x] **No `prefers-reduced-motion`.** The splash pulse is infinite, the status ring pulses, and
  the bars overshoot. **Fix:** one reduced-motion block.
- [x] **Bar chart animates `height` with overshoot easing** (1418). That is a layout
  transition per bar. **Fix:** `transform: scaleY()` with `transform-origin: bottom`.
- [x] **No `esc()` helper.** Templates interpolate persisted `o.area` / `o.type` into
  `innerHTML` (2611, 2711–2713, 2881). This is safe today because every value comes from the
  fixed `AREAS` list. It becomes stored XSS the day areas come from a backend feed or free
  text. **Fix:** add `esc()` and use it for every interpolated string, per §0.2.
- [x] Copy: "1 people reported"; the profile name "Bangalore Resident" is static filler;
  `openAreaDetail` computes an unused `patterns` (2728).

### P3 / design-detector findings (taste: leave unless redesigning)

- Side-tab accent `border-left: 3px` (1496), zero-offset blue glow (209), overshoot easing
  (767, 1418, 1772), Inter (15). The detector flags them as generic, but they are consistent
  within the app.
- Theme defaults to dark and ignores `prefers-color-scheme`.
- Icons are SVG only. iOS ignores an SVG `apple-touch-icon` and uses a screenshot instead.
  There is no `maskable` icon, so Android's adaptive mask shrinks the icon onto a white disc.
  This is a cross-app fix (all 7), best done once before the Play listings.

## Deferred: needs the backend (EXECUTION_PLAN §4.5)

- Shared reports: Supabase realtime + Worker rate limit (1 report / area / 10 min / device).
- BESCOM scheduled-outage scrape (Workers cron). This solves cold start.
- Area-subscription push. That is when the notification settings come back.

## Status — 2026-10-10

Fixed this session. The new `test-powerpulse.mjs` has 7 cases (12 h expiry, weekday counts,
usual window ≥ 3, late-night labels, history cap). 5/5 mutants killed. Headless Chrome ran
24/24 checks:

- A fresh install shows no invented data.
- Legacy seed rows are dropped on load.
- A report appears instantly. A second report updates the count and severity.
- Share names the area and the helpline.
- "Water's back" resolves the outage, and Patterns show its real duration.
- An empty area says so.
- The map tile opens with Enter. Escape closes it and focus returns.
- Pills, switches and every tab work. The log survives reload. 0 console messages.

What changed:

- **Removed:** the 30 s report inflation, the seed outages (plus a load-time migration), the
  fake Refresh and pull-to-refresh, the 1.5 s spinner and the dead alert toggles.
- **New actions:** "Power's back" / "Water's back", and Share (Web Share, falling back to
  WhatsApp).
- **Patterns:** derived from the local log, with an `autoExpired` flag so a 12 h timeout is
  never shown as a duration.
- **Severity:** shown on cards and merged on repeat reports.
- **Helplines:** `tel:` links.
- **A11y:** `role="dialog"` sheet with close / Escape / focus return, `esc()`, contrast tokens,
  `:focus-visible`, reduced motion, `scaleY` bars.
- **Robustness:** guarded storage, and no splash delay.
- **SW:** `powerpulse-v2` with a scoped purge.

Still open (P3): the theme ignores `prefers-color-scheme`; SVG-only icons (cross-app);
everything under *Deferred*. Report counts that the old timer inflated on existing installs
cannot be un-inflated, since the real count was never stored.

## Work order

1. SW purge scope + `powerpulse-v2`.
2. Remove the fakes: interval, seed data, refresh, spinner. Fix the copy and add the
   on-device notice.
3. "Power's back" action. Patterns derived from the local log. Severity shown and merged.
4. A11y pass: zoom, focus ring, contrast tokens, roles, dialog behaviour, labels, live toast.
5. P2: `tel:` links, instant splash, guarded storage, reduced motion, `esc()`, scaleY bars, share.
