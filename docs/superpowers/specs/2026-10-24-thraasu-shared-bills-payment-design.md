# Thraasu: the shop's bills on every phone, and how each bill was paid

Approved by Karthik 2026-10-24: one bill-number series per shop; payment option B (a toggle on the bill)
with no default, required before the bill is finished.
Design canvas: https://claude.ai/artifact/X27aJ8zrw1txdhFAjZZ9J2 (option B; the canvas draws a cash default,
which this spec replaces with none).

## 1. Payment on the bill
- **Three kinds:** ക്യാഷ് (cash), UPI, കടം (credit: paid later, not a card). Icons: a banknote, a scan frame,
  a ledger. Colours: leaf / indigo (`#34367A` on `#E1E1F2`, the stationery sack pair) / brass-ink on
  brass-wash. Chilli stays for removal and for the "not picked" error.
- **Where:** in the slip under ആകെ: the label പണം and a three-segment toggle (48 px, field edge; picked:
  filled in its colour with white text). Hidden while the bill is empty. **No default:** a new bill has none.
- **Required:** പ്രിന്റ് / PDF, ഷെയർ and പുതിയ ബിൽ do nothing until one is picked. The row's edge turns
  chilli, "ആദ്യം പണം തിരഞ്ഞെടുക്കൂ" shows under it, and it scrolls into view with the focus on its first
  segment. Picking clears it; the shopkeeper then taps the button again. Going back to the shelf to add
  items needs no payment. Those three buttons are the only ways a bill is sold, so every sold bill has one.
- **Changing it:** the same toggle while the bill is on the counter (after printing too); later, from the
  bill's view in ബില്ലുകൾ.
- **Receipt** (slip, print, shared image): a row പണം · UPI under ആകെ, when the bill has a payment.
- **Stored:** `bill.pay`: `'cash' | 'upi' | 'credit'`, or `null` (not picked yet, or a bill kept before this).

## 2. The shop's bills on every phone
- A logged-in phone shows the shop's sold bills of today and yesterday from every phone; older ones go,
  as before. Logged out: this phone's own, as now.
- **One number series per shop:** a new bill takes 1 + the highest number among today's bills the phone
  knows, from all phones. An unfinished bill whose number another phone's bill took meanwhile moves to the
  next free number. Two phones finishing within the same few seconds, or one offline, can still print the
  same number; both bills are kept and listed by time.
- **Server:** D1 table `bills (shop, id, body, started, at)` and `shops.bills_at`, a per-shop counter that
  strictly increases on every write (`MAX(old + 1, now)`), stamped on the rows written.
  `POST bills {bills: {id: bill}}`, at most 50 per call; a bill with no lines is its removal and stays as
  such until it ages out. `GET bills?since=N` → `{at, bills: [{id, bill}]}` for rows changed after N (the
  counter is read before the rows, so nothing is skipped). `GET state` returns `bills` (the counter).
  Rows whose bill started more than 3 days ago are deleted on every write. The server checks every bill
  (`cleanBill`, the same rules as `bill-core.js`).
- **Phone:** `outbox.bills`; saving a sold bill queues it, as it queues its stock. Sync pushes, then pulls
  when the counter moved; a change not yet sent wins over the server's copy. A payment changed on another
  phone reaches the counter's bill too.
- Login, and the first sync after this update, send up the bills the phone has kept. Logout (which waits
  until everything is sent) removes the kept bills from the phone. Opening ബില്ലുകൾ syncs.

## 3. The bills sheet
- **Subtitle:** "ഇന്നും ഇന്നലെയും · കടയിലെ എല്ലാ ഫോണിലും" logged in, "ഇന്നും ഇന്നലെയും · ഈ ഫോണിൽ" logged out.
- **Filter chips** under the head: എല്ലാം · ക്യാഷ് · UPI · കടം (48 px, four across, field edge; picked:
  filled in its colour, എല്ലാം in ink). It filters both days; each day's heading shows the count and total
  of what is shown, in the chip's colour. A day with bills but none of that kind says so ("ഇന്ന് UPI
  ബില്ലുകളൊന്നുമില്ല"). Back to എല്ലാം each time the sheet opens.
- **Rows:** a badge (icon and label in the kind's wash and ink) before the total. A bill kept before this
  change has no badge and shows only under എല്ലാം.
- **One bill:** the receipt with its പണം row; the footer adds the toggle above print and share, with
  "മാറ്റിയാൽ കടയിലെ എല്ലാ ഫോണിലും മാറും" under it when logged in. A change saves and syncs at once.

## 4. Privacy
`privacy.html`: a shop account now also keeps each sold bill as printed (items, prices, discount and which
of the three ways it was paid), deleted three days after the sale. Still no customer name, number, UPI ID
or card detail.

## Not built
- A customer name on a credit bill, or a credit book of who owes what.
- Per-kind day totals without a tap (each chip shows them).
- Bills older than yesterday.
