# Thraasu shop sign-up (request, then approve)

Approved by Karthik 2026-10-10. Shop owners request a shop from the app; Karthik approves it
from the terminal. A monthly fee is shown but set to ₹0.

## Owner (app, shop sheet "കട", signed out)
- "പുതിയ കട രജിസ്റ്റർ ചെയ്യുക" opens a form in the sheet: shop name, owner mobile (10 digits,
  Indian, `+91`/`0` prefix accepted), PIN, PIN again. Fee line from `MONTHLY_FEE` (₹0 → "ഇപ്പോൾ
  സൗജന്യം"). Link to `privacy.html`.
- Success: the server's 6-character code (no 0/O/1/I) is shown large, remembered on the phone
  (`thraasu_signup`) and filled into Login. Cleared on a successful login.
- Login with the right PIN before approval: "waiting for approval" (403 `pending`). Wrong PIN
  answers as today (401), lockout unchanged.

## Karthik (terminal, `8_thraasu/tools/shop-admin.mjs`)
- `requests` lists pending shops (code, name, mobile, when). `approve CODE` activates;
  `reject CODE` deletes a pending shop. `list` shows status. No notification of new requests.

## Server (`functions/api/thraasu/[[path]].js`)
- `POST signup` (no session): validate, PBKDF2 the PIN, insert `status = 'pending'` with a random
  code (retry on collision), return `{code}`. 400 bad input, 409 a pending request with that mobile
  exists, 429 when 20 requests are pending.
- `login`: after the PIN check, a pending shop gets 403 and no session.
- Schema: `shops.status` (default `active`, so existing shops are unaffected), `shops.mobile`;
  `created` is the request time. One-off migration `tools/migrate-signup.sql`.

## Capacity (D1 Free: 500 MB per database)
- Photos: 25 MB per shop (≈500 photos), checked on upload with the count cap.
- Sales records older than 60 days are deleted on each `POST sales` (index on `sales(shop, at)`);
  stock counts are not affected.

## Fee
`MONTHLY_FEE = 0` in the app is a label only. Charging needs a payment step, built when the fee
goes above ₹0: manual UPI (approve after payment, paid-until date) or Razorpay UPI AutoPay.

## Privacy
`8_thraasu/privacy.html`: what a shop account stores (name, mobile, PIN hash, prices, photos, list,
stock, sold items for 60 days), where (Cloudflare), who sees it, deletion on request. Contact email
is the `REPLACE_WITH_CONTACT_EMAIL` placeholder, as in the other four policies.

## Tests
Sync server: sign-up validation, code shape, 409, 429, pending login, approval, photo budget,
sales pruning. Browser: the form's messages, success state, pending login message, privacy page.
Live: sign up through the API, `approve`, log in, remove.
