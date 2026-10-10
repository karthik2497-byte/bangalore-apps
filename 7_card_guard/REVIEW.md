# CardGuard — Review

**Date:** 2026-10-10 · **Reviewer:** Claude (Opus 5.5) · **Baseline:** `c6d74dd`
**Read in full:** `index.html` (CSS 20–698, markup 700–950, script 951–2420),
`reminder-core.js`, `service-worker.js`, `manifest.json`, `TODO.md`, `privacy.html`
(placeholders), `test-cardguard.mjs`, the `/7_card_guard/*` and `/*` blocks in `_headers`,
EXECUTION_PLAN §4.4 / §6.2 #3. Design detector: `impeccable detect.mjs`.
Line numbers refer to the baseline commit.

## Verdict

CardGuard has the best engineering in the repo. One shared `reminder-core.js` is used by the
page, the worker and the tests. Background reminders work with no server. The paywall
refuses to fake a sale on the open web. **But the model of a bill cycle ends the moment the
due date passes.** After that, `nextDueDate()` jumps to next month, which causes three problems:

1. "Overdue" can never be shown (that branch is unreachable).
2. A user who pays **late** and taps *Mark as Paid* marks **next month's** cycle paid, which
   silently cancels next month's reminder. That reminder is the whole product.
3. The most valuable reminder never fires. Under the RBI credit-card rule, an issuer cannot
   charge a late fee or report you "past due" until the bill is **more than 3 days late**.
   A "you missed it, pay today, still no late fee" nudge is worth real money.

The fix is one concept in `reminder-core.js` (a 3-day grace cycle) plus tests. Next come
two Android problems: in-app reminders use `new Notification()`, which throws on Android,
and the global `Cross-Origin-Opener-Policy: same-origin` very likely breaks the Gmail OAuth
popup. Last, an import path renders unvalidated card fields.

## Keep: works, don't change

- **`reminder-core.js`**: one implementation loaded three ways (page, `importScripts`,
  tests). The `dueDay` range check guards imported data in the worker. `pruneNotified` stops
  the dedupe map growing without bound.
- **The background reminder chain**: page → Cache Storage mirror → `periodicsync` → worker →
  `showNotification`, with a **Test** button that reports what the worker actually did
  (2025–2040). The settings copy says Active / "Install to enable" / "Not supported here"
  instead of overpromising.
- **The honest paywall**: outside the Play TWA the button says purchases are not available,
  and there is a Restore path (1122–1171).
- **Last-4 only**, validated `^\d{4}$` on manual entry. The privacy policy states it.
  `esc()` is used on nicknames.
- The on-time rate counts only bills whose due date has arrived (1407–1412). Spend insights
  are computed on-device.
- Snooze writes the same dedupe key the worker reads, so both paths go quiet (1940–1947).
- Visual identity: the dark navy with a gold accent and bank-gradient cards reads as
  "finance" without copying any bank. Keep it.

## Findings

Severity: **P0** breaks data, trust or the core flow · **P1** real bug or WCAG AA failure ·
**P2** minor · **P3** polish.

### P0

- [x] **Mark-as-Paid after the due date marks the wrong month.** `confirmPayment()` keys the
  bill on `getBillingCycleKey()`, which is `CORE.cycleKey(nextDueDate(now))` (1908). From the
  day after the due date, `nextDueDate` returns *next* month. So a late payment records next
  month as paid. Next month's reminder is then suppressed (`paidCycleKeys`), the dashboard
  shows "Paid", and the cycle actually paid stays "✗ Missed" in History. **Fix:** a cycle
  stays current until it is paid or until 3 days after its due date (below). Mark-paid then
  hits the cycle the user is looking at.
- [x] **No overdue state, and no grace-window reminder.** `daysUntilDue()` can never be
  negative, so `getStatusInfo`'s "Overdue" branch (1089) is dead code. The day after a
  missed due date, the card reads "Due in 30d". **Fix (in `reminder-core.js`):** while the
  most recent due date is ≤ 3 days past and unpaid, it is the current cycle with negative
  `daysLeft`. The UI shows "Overdue by N days". The reminder body says "pay within N days
  to avoid a late fee". Under [RBI's credit-card directions (2022, amended 2024, para
  9(b)(v))](https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12620), issuers may levy
  late charges or report "past due" only after **more than three days**. Interest can still
  accrue, and the copy must say so. Test it in `test-cardguard.mjs`.
- [x] **Every app's service worker deletes every other app's caches.** CardGuard's worker
  protects `cardguard-state` from its *own* purge (service-worker.js:21–23). The other six
  apps' workers delete it. After that, the background check returns "no state mirrored
  yet" until CardGuard is opened again, so **reminders silently stop**. Details are in
  `1_power_pulse/REVIEW.md`. **Fix:** every worker deletes only its own prefix. Here:
  `k.startsWith('cardguard-v') && k !== CACHE_NAME`, and bump to `cardguard-v3`.

### P1

- [x] **In-app reminders never show on Android.** `checkAndNotify()` uses `new Notification()`
  (1999). That is an illegal constructor on Chrome Android. The `try/catch` swallows it, so
  nothing fires. This is exactly the path Settings promises on devices without
  `periodicSync` ("open the app to get reminders"). **Fix:** use
  `registration.showNotification()`, as the worker does. The worker's `notificationclick`
  already routes `markPaid` and `snooze`.
- [x] **The Gmail OAuth popup is probably broken by COOP.** The global `/*` block in
  `_headers` sends `Cross-Origin-Opener-Policy: same-origin`. GIS `initTokenClient()`
  (2089) opens an accounts.google.com popup and needs the opener link, which Google
  documents as requiring `same-origin-allow-popups`. Premium's "Gmail auto-sync" therefore
  likely never returns a token in production. **Fix:** in the `/7_card_guard/*` block, use
  `! Cross-Origin-Opener-Policy` + `Cross-Origin-Opener-Policy: same-origin-allow-popups`.
  Confirm on a Pages preview with `verify-deploy.sh` before relying on it.
- [x] **Backup import is not validated.** `handleImportFile()` (2301–2333) accepts cards,
  bills and settings as they are. `card.bank`, `card.last4` and `card.dueDay` render
  unescaped (1285, 1298, 1363, 1368, 1372). `card.id` goes into inline
  `onclick="…('${card.id}')"` (1281, 1305, 1309, 1361, 1382). `settings.gmailClientId` goes
  into a `value="…"` attribute (1637). A crafted "backup" therefore runs script in the app
  that may be holding a live `gmail.readonly` token, on the origin that holds all 7 apps'
  data. **Fix:** validate imported cards with the same rules as `saveCard()` (known bank,
  `^\d{4}$`, `dueDay` 1–31, `id` `^[a-z0-9]+$`) and escape at render anyway. Do not import
  `premium*` from a file; Restore goes through Play.
- [x] **Gmail import invents due dates.** An unparsed due day becomes **15**
  (`dc.dueDay || 15`, 2257), and an unparsed last-4 becomes `0000` (2179). The card then
  reminds on a made-up date. **Fix:** the detected-cards sheet must ask for the missing day
  and last-4, or skip the card. It must never default.
- [x] **A11y.** Zoom is disabled (line 5). There is no `aria-*` or `role` anywhere: the
  Notifications switch is a `<div onclick>` (1602); bill rows, the flip cards and history
  month headers are clickable `<div>`s; the icon buttons (show Client ID, sound preview)
  have no names. There is no `:focus-visible` style.

### P2

- [x] **"BILLING DATE" vs due date.** The card face says "BILLING DATE" (1371) and the
  details say "Billing Day" (1301), but the field is the *due* day ("Monthly Due Date",
  834). On a credit card, the billing (statement) date and the due date are different days,
  about 15–20 days apart. **Fix:** label it "DUE DAY" throughout.
- [x] **Corrupt storage kills the app.** `JSON.parse(localStorage…)` runs at top level with no
  guard (1002–1016). One corrupt value prevents everything from rendering.
- [x] **Stored settings are not merged with defaults** (1004). A settings object saved by an
  older version misses newer keys.
- [ ] **AudioContext leak.** `playSound()` creates a new `AudioContext` per sound and never
  closes it (1715).
- [x] `input-last4` is `type="number"` (831), where `maxlength` is ignored. **Fix:** use
  `inputmode="numeric"` with a pattern.
- [x] Splash: fixed 2 s on every launch (1189).
- [x] **Stale TODO.** `TODO.md` item 9 (the MeterSmart/LingoLocal font CSP) was fixed on
  2026-08-29. Delete it.
- [ ] `privacy.html` still has `REPLACE_WITH_CONTACT_EMAIL` (known, TODO.md #1).

### P3 / design-detector findings

- Zero-offset gold glow (50). `max-height` transitions on the expanding rows (195, 425).
  Single-font (Poppins only). These are taste calls; leave them.

## Deferred: needs a server or an account (TODO.md / EXECUTION_PLAN §4.4)

- Gmail OAuth via a Worker (§6.2 #3). Server-side receipt validation. Family sharing.
  iOS background reminders (Web Push, Phase D). Play Console product
  `cardguard_premium_yearly`. Bubblewrap `playBilling` field (verify against the installed
  `@bubblewrap/core`).

## Status — 2026-10-10

Fixed this session. `test-cardguard.mjs` 43 cases PASS (9 new on the overdue/grace cycle).
5/5 mutants of the new core logic were killed. Headless Chrome ran 19/19 checks:

- An overdue bill shows "Overdue 2d" with the RBI advice.
- With `new Notification()` forced to throw (Android), the reminder still showed via
  `registration.showNotification`.
- A late Mark as Paid recorded the overdue cycle, and next month became current.
- A crafted backup (script in the id, `<img onerror>` as the bank, Premium in settings)
  ran nothing, granted nothing, and kept 1 valid card.
- A Gmail detection without a due day was not imported.
- COOP is detached on CardGuard only.
- All 4 tabs render, data survives reload, and there are 0 app console errors.

Changes:

- `reminder-core.js`: `currentCycle()` + `graceDaysLeft()`. `_headers`: `! Cross-Origin-Opener-Policy`
  for `/7_card_guard/*`.
- Labelled switches and icon buttons, keyboard-operable rows and cards, zoom on, `:focus-visible`.
- SW `cardguard-v3` with a scoped purge.

**Not verifiable here:**

- The Google OAuth popup itself, which needs a real Client ID and account. After deploy,
  confirm `curl -sI https://tinkerhouse.uk/7_card_guard/ | grep -i opener` prints nothing,
  then try Sync Now once.
- A notification painting on a real device (unchanged from before).

Still open: `AudioContext` reuse, the privacy contact email, everything under *Deferred*.

## Work order

1. `reminder-core.js`: a grace-window current cycle (overdue ≤ 3 days, unpaid). It drives
   `dueReminders`, the status and mark-paid. Tests first.
2. SW purge scope + `cardguard-v3`. In-page notifications via `registration.showNotification`.
3. Import validation + escaping. No invented Gmail due dates.
4. COOP override for CardGuard in `_headers` (verify on a preview deploy).
5. A11y + P2 copy and robustness.
