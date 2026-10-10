# CardGuard — what is left, and who has to do it

Everything codeable from EXECUTION_PLAN §4.4 without a server is done (2026-08-20,
see WORK_LOG.md). What remains needs either an account you own, a server, or a
physical device.

## Needs you (no code)

1. ~~**Contact email in `privacy.html`**~~ — done 2026-10-10: ckventurestech@gmail.com in all five
   policies.
2. **Create the Play Console product** `cardguard_premium_yearly`, ₹99, yearly.
   Until it exists, `getDetails()` returns nothing and the upgrade button will
   say "Product not available yet" even inside the Play build.
3. **One-tap device check:** install the PWA (or the TWA), allow notifications,
   add a card due today, then Settings → Background Reminders → Test. Expect a
   notification with "Mark as Paid" and "Snooze". This is the one link automation
   could not prove — granting the OS permission needs a real tap.
   Then leave it overnight to confirm `periodicsync` fires on its own.

## Needs code, blocked on something

4. **Enable Play Billing in the TWA build.** Bubblewrap gates it behind
   `alphaDependencies.playBilling` in `twa-manifest.json`. `scripts/generate-twa.mjs`
   would set it per-app (CardGuard only — the other six must not ship the BILLING
   permission). Not wired up because `@bubblewrap/core` is not installed locally
   and the field name could not be verified; guessing it into CI risks breaking
   all seven builds. Verify once, then it is a two-line change here and in
   `.github/workflows/build-aab.yml`.
5. **Gmail OAuth to a Worker** (§6.2 #3) — the client secret and email parsing move
   server-side; the browser gets card metadata, never a token. The feature is
   currently labelled Advanced and Premium-gated as the interim honest position.
6. **Server-side receipt validation** for Premium. Today the purchase is
   acknowledged locally, so a determined user can unlock without paying. Costs
   nothing real; fix it when there is a Worker anyway.
7. **Family sharing** (the third Premium benefit in the plan) — needs accounts,
   which means a backend. Not built, and not currently promised in the paywall copy.
8. **iOS**: `periodicsync` does not exist in Safari, so background reminders are
   Android/Chromium-only. On iOS the app only reminds while open. Web Push is the
   only route, and it needs a server — revisit only at Phase D.

