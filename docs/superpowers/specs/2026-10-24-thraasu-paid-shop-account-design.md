# Thraasu: the shop account is the paid part, with a 30-day trial

Approved by Karthik 2026-10-24: free = the app with no account, as today; paid = the shop account (sync,
the shop's bills on every phone, stock). A new shop gets 30 days on approval, then ₹199 a month, collected
outside the app (Play's consumption-only route: no pay button or link in the app). Free shops learn about it
from option B: the shop sheet, plus one hint in the bills sheet and one in the price list. NANMA (the pilot)
runs until 31 Mar 2027.
Design canvas: https://claude.ai/artifact/TXfR7oud4K7ynpbcFjcA88 (option B; the states row, with the
account line's wording changed as below).

## 1. The paid-until date (server)
- **Stored:** `shops.paid_until`, epoch ms, exclusive: the account works while `now < paid_until`. It is
  always an IST midnight, so a shop never pauses in the middle of a counter day. `0` until approved.
- **One rule for trial and renewal:** `paidThrough(paidUntil, days, now)` =
  `max(paidUntil, start of tomorrow IST) + days`. Approving on 24 Oct gives 24 Nov 00:00 IST: the shop's
  last day is 23 Nov, 30 days after the approval day. Renewing before the end extends from the end;
  renewing after a lapse runs from today. `TRIAL_DAYS = 30` and `paidThrough` are exported by the API
  module, so `shop-admin.mjs` uses the same numbers.
- **The check:** the session lookup joins `shops` and returns `paid_until` with the shop (no extra D1
  query). A session whose shop is past its date gets `402 {"error":"paused","until":<paid_until>}` on every
  route except `POST logout`. `login` is unchanged, so a new phone of a paused shop logs in and shows why.
- **`GET state`** also returns `paid` (the shop's `paid_until`), so phones can count down.
- **Approving** (the email's Approve button and `shop-admin.mjs approve`) and `shop-admin.mjs add` set
  `paid_until = paidThrough(0, TRIAL_DAYS)`.
- **Lapsing deletes nothing.** The shop's list, prices, photos, items, stock and bills stay on the server
  until it is renewed or removed.

## 2. Your commands
- `shop-admin.mjs paid CODE +30`: `paidThrough(current, 30)`. `paid CODE 2027-03-31`: runs through that
  day (until the next IST midnight). Prints the shop's new last day.
- `shop-admin.mjs list` adds `paid_through` (the last day, IST) and sorts by it, soonest first: the shops
  to call this week are at the top.
- **Collecting:** you call the owner on the mobile from their request before their last day, take ₹199 by
  UPI, and run `paid CODE +30`. The app never shows a number or a pay link.

## 3. The app: a free phone (no account)
- **Shop sheet, signed out** (canvas A): കടയുടെ അക്കൗണ്ട്, "അക്കൗണ്ട് ഉണ്ടെങ്കിൽ:" and three uses, each
  an icon, a bold line and one sentence: എല്ലാ ഫോണിലും ഒരേ വില / എല്ലാ ഫോണിലെയും ബില്ലുകൾ ഒരിടത്ത് /
  വിൽക്കുന്നതനുസരിച്ച് സ്റ്റോക്ക്. Then "30 ദിവസം സൗജന്യം · പിന്നെ മാസം ₹199" (from `TRIAL_DAYS` and
  `MONTHLY_FEE = 199`). പുതിയ കട രജിസ്റ്റർ ചെയ്യുക becomes the primary button; the login form moves behind a
  ghost button, കോഡ് ഉണ്ടെങ്കിൽ ലോഗിൻ ചെയ്യുക, and shows at once when this phone has a request waiting.
- **Bills sheet hint:** between the payment chips and the list, a strip (paper ground, line edge):
  "ഈ ഫോണിലെ ബില്ലുകൾ മാത്രം" / "കടയിലെ എല്ലാ ഫോണിലെയും ബില്ലുകൾ ഒന്നിച്ച് ഇവിടെ കാണാൻ: കട അക്കൗണ്ട്".
- **Price list hint:** under the search field: "സ്റ്റോക്ക് എത്ര ബാക്കി?" / "ബിൽ ചെയ്യുമ്പോൾ ഓരോ
  സാധനത്തിന്റെയും സ്റ്റോക്ക് തനിയെ കുറയും: കട അക്കൗണ്ട്".
- Tapping a hint closes its sheet and opens the shop sheet. Its ✕ hides it on this phone for good
  (`thraasu_hints`: `{ bills: 1, prices: 1 }`). No hint on the shelf, the quantity sheet or the bill, and every
  strip hides while a keyboard is up (`.kb`), so searching the price list keeps its foot above an iPhone keyboard.

## 4. The app: a shop account
- **Account box:** under the shop's name, a line "കാലാവധി 23 Nov വരെ · 23 ദിവസം ബാക്കി" (leaf wash). The
  canvas says സൗജന്യം here; this neutral wording reads right after a shop pays too. Days left = whole
  days after today; on the last day it reads "ഇന്ന് അവസാന ദിവസം".
- **Last 5 days** (days left under 5): that line turns brass wash, and the bills sheet shows a strip in the
  hint's place, brass wash, no ✕: "കാലാവധി 3 ദിവസം കൂടി" (or "കാലാവധി ഇന്നു തീരും") /
  "23 Nov വരെ · തുടരാൻ മാസം ₹199 · ഞങ്ങൾ വിളിക്കും". Tapping it opens the shop sheet.
- **A link** in the account box, കടയുടെ അക്കൗണ്ട് ഇല്ലാതാക്കാൻ, to `privacy.html#delete` (§4 of the privacy
  page gets that id). Play requires an in-app path to account deletion.
- **The privacy page** says today "A shop account is free for now (₹0 a month)". It becomes: free for 30
  days from approval, then ₹199 a month paid to us directly; the app itself needs no account; when an
  account lapses nothing is deleted, and sync resumes when it is renewed.

## 5. The app: paused (a 402)
Changed by Karthik 2026-10-24: sync stops at once, and the phone gets only 5 more bills and 5 more new
products before those ask to renew too.
- `api()` keeps `account.paused = until` (in `thraasu_session`) on a 402; the next good `GET state` clears it,
  with the grace counts.
- **Grace, per phone:** from the first 402 this phone sees, it may finish 5 more bills (`markSold`, the one
  place a bill becomes sold) and add 5 more new products (the add flow's save); `account.grace =
  { bills, items }` counts them. Price edits, photos, removing items, and viewing, printing and sharing the
  bills already made keep working. Once a count reaches 5, the first item of an empty bill, or
  + പുതിയ സാധനം, opens the shop sheet at the paused box instead (a bill already started can be finished).
- **The shop's own list stays** during the grace: `fetchCatalog` answers a 402 with the list from the last
  sync (`thraasu_catalog`), never the public template; only a phone with no saved list gets the template.
- **Stock counts hide** (`stockLeft` → null): they stop counting other phones' sales.
- **Changes wait:** `queue()` still writes the outbox but sets no sync timer. Sync still runs on opening
  the app, the shop sheet or the bills sheet, coming online, and the button, so a renewal is seen within one
  of those; then the outbox goes up and the shop's changes come down.
- **Account box:** the line becomes "കാലാവധി 23 Nov-ന് കഴിഞ്ഞു" (brass wash) with
  "സിങ്കും എല്ലാ ഫോണിലെയും ബില്ലുകളും സ്റ്റോക്കും നിർത്തിവെച്ചു.", then "ഈ ഫോണിലെ ബില്ലുകളും വിലയും
  ഇവിടെത്തന്നെയുണ്ട്; പുതിയ മാറ്റങ്ങളും ഫോണിൽ സൂക്ഷിക്കും. പുതുക്കിയാൽ അവ തനിയെ മറ്റു ഫോണുകളിലെത്തും."
  and "തുടരാൻ മാസം ₹199 · ഞങ്ങൾ വിളിക്കും". Under it, the grace left: "ഈ ഫോണിൽ ഇനി 3 ബില്ലും 5 പുതിയ
  സാധനവും കൂടി", or once either is used up "പുതിയ ബില്ലും സാധനവും ഇനി പുതുക്കിയ ശേഷം", and
  "അല്ലെങ്കിൽ ലോഗൗട്ട് ചെയ്ത് ഈ ഫോണിൽ സൗജന്യമായി തുടരാം; കടയുടെ വിവരങ്ങൾ സെർവറിൽ സുരക്ഷിതം. ബാക്കപ്പ്
  എടുത്താൽ വിലയും ഫോട്ടോയും കൂടെ കൊണ്ടുപോകാം." ഇപ്പോൾ സിങ്ക് reads വീണ്ടും നോക്കുക. The waiting count
  shows as now.
- **Elsewhere:** the shop button's dot is brass (`data-state="paused"`); the shop sheet's subtitle reads
  "സിങ്ക് നിർത്തിവെച്ചു · ഈ ഫോണിൽ സൂക്ഷിക്കുന്നു"; the bills sheet's subtitle ends "സിങ്ക് നിർത്തിവെച്ചു" and
  its strip reads "സിങ്ക് നിർത്തിവെച്ചു" / "മറ്റു ഫോണുകളിലെ പുതിയ ബില്ലുകൾ വരില്ല: കട" (tapping it opens the
  shop sheet, like the others).
- **Logging out is the way to go free,** so it is never blocked while paused: with unsent changes the first
  tap says "N മാറ്റം കടയിലേക്ക് പോകില്ല · ഒന്നുകൂടി തൊട്ടാൽ ലോഗൗട്ട്" and a second tap logs out. As any
  logout, nothing of the shop stays on the phone (it becomes a free phone with the sample list); the shop's
  data stays on the server, and renewing then logging in brings it back, less what was never sent. Not paused,
  logout still waits for unsent changes, as now.
- **Free use stays as it is:** unlimited bills and new products on one phone, with the sample list.

## 6. Rollout
- `shop-admin.mjs list` first: NANMA should be the only active shop.
- `8_thraasu/tools/migrate-paid.sql` on the live D1, before the push: adds the column (default 0) and sets
  every active shop's `paid_until` to 1 Apr 2027 00:00 IST (NANMA runs through 31 Mar 2027). Old code
  ignores the column; new code without it would pause every shop, hence the order.
- Push, `verify-deploy.sh`, then a throwaway shop on the live API: approve → `GET state` has `paid`; its
  `paid_until` set in the past → 402 on `state`, 200 on `logout`; `paid +30` → 200; then `remove` it.

## 7. Checks
- **test-sync:** `paidThrough` (trial from an approval at 13:00 IST; renewal before and after a lapse);
  approval from the review page and from a direct insert sets the trial; `GET state` returns `paid`; past
  the date, every route but logout answers 402 with `until`, and login still answers 200; the query count
  per request is unchanged.
- **Browser suite (thraasu.mjs):** a free phone shows both hints and the three uses with ₹199; ✕ keeps a
  hint hidden after a reload; the login form opens from its button and shows at once with a request
  waiting; an account 3 days from its end shows the brass line and the bills strip; a paused fake server
  (402) shows the paused box and dot, keeps the shop's own list (not the template), hides stock; after 5
  sold bills the first item of a new bill opens the shop sheet, and after 5 new products so does
  + പുതിയ സാധനം, while a started bill still finishes; logout while paused takes two taps; it schedules
  no sync after a price change, and gives the paused logout message; the delete link points at
  `privacy.html#delete`.
- All 8 unit suites and `browser-smoke.sh`, the service worker's cache name bumped.

## Not built
- A reminder to you before a trial ends (`list` sorts them instead), or an email when a shop lapses.
- Paying in the app: no UPI link, Razorpay or Play Billing (the Play build stays consumption-only).
- Partial free limits (e.g. sync for one extra phone), or clearing a lapsed shop's server data after a time.
- An App Store build.
- The new Malayalam copy is unreviewed, like the rest (NEXT_STEPS §4).
