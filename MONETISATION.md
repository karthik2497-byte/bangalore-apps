# Monetisation — what is actually passive

Written 2026-09-07. The question asked: what monetisation is available for these
7 apps that is **truly passive** — i.e. earns without ongoing labour.

Short answer: truly passive rules out most of the list, and the two options that
survive are already half-built in this repo.

## Ranked by actual passivity

| Model | Labour after setup | Fits |
|---|---|---|
| **Affiliate links** | None. Wire once, earns forever | StockPing |
| **Ads (AdMob)** | None | Any app with volume |
| **One-time / subscription IAP** | Low but nonzero — refunds, support mail | CardGuard, LingoLocal |
| **Featured listings, lead-gen** | It is a sales job | PG Buddy — not passive |
| **Sponsorships** | Ongoing relationship | Not passive |

Everything below the line is a business, not passive income. The existing note in
`NEXT_STEPS.md` that PG Buddy's featured placement "needs the sales motion, not
code" is the same judgement and it is correct.

## The uncomfortable number

Indian traffic is the worst-monetising traffic in the world for ads. Sources
disagree on the exact figure — one puts India display eCPM at **$0.30–0.80**,
another quotes materially higher rewarded rates — but the direction is consistent:
**one US user is worth roughly 15–20× one Indian user** to AdMob.

Best case, run the arithmetic. MeterSmart at 10,000 monthly users × 3 sessions ×
one banner per session = 30k impressions ≈ **₹700–2,000/month**. That is the
ceiling for a hyper-local Bangalore utility monetised with ads. Not nothing, not
a business.

IAP trends better — India's revenue per download has more than doubled in three
and a half years — but download-to-paid conversion is still **1.4%** vs 2.6% in
North America, and Y1 lifetime value per payer is **$14** vs $32.

## Which of the seven actually monetise

Only two, and the hooks for both are already written and tested:

- **StockPing — the best passive asset by a distance.** The only app where the
  user has *purchase intent at the moment of use*: an alert fires, they buy.
  Amazon Associates India pays roughly 1–9% depending on category. The
  `AFFILIATE` config already exists in `6_stock_ping/index.html` and ships blank.
  Signup is ~30 minutes, then it earns unattended.
- **CardGuard — already has the ₹99/yr premium tier** via Play Billing. Recurring
  engagement (monthly bills) means people keep opening it. Play handles billing,
  tax and refunds, so subscription revenue here is genuinely passive.
- **MeterSmart** — most potential *volume*, zero purchase intent. Ads only.
- **LingoLocal** — could support a one-time ₹49 unlock. Small, clean, passive.
- **PowerPulse, NestHub, PG Buddy** — do not monetise. They need backends that do
  not exist yet, and their revenue models are all sales motions.

## The recommendation

**Monetisation is not the current constraint — distribution is.** Seven apps,
zero users. Wiring AdMob into all seven would take a week and earn ₹0, because
₹0 × any CPM is ₹0.

1. **Fill the two blanks that already exist.** The Amazon Associates tag in
   StockPing, and the CardGuard premium product in Play Console. Both are config,
   not code, both already written and tested. See `NEXT_STEPS.md` §3.
2. **Ship to Play and watch MAU for 3 months.** The kill criterion in
   `EXECUTION_PLAN.md` §7 already says it: under 100 MAU and ₹0 after 3 months →
   freeze the app. That rule is good; trust it.
3. **Then monetise only the winner.** Whichever app shows real usage gets ads or
   IAP. The other six stay free and cost nothing to keep running.

The genuinely passive part of what is built here is not the revenue — it is that
seven live apps cost **$5.30/yr in total**. That is what buys the patience to
wait for one of them to find users, which is the only thing that turns any of
these mechanisms into money.

## Sources

- [AdMob eCPM benchmarks 2026](https://www.revenuelab.fyi/blog/admob-ecpm-benchmarks-2026)
- [India mobile app market Q1 2026 — Sensor Tower](https://sensortower.com/blog/india-mobile-market-q1-2026)
- [State of App Monetization 2026 — RevenueCat / Adapty](https://chuvak-pavel.medium.com/state-of-app-monetization-2026-key-trends-from-revenuecat-and-adapty-8bdc23a4bb6f)
- [Amazon India affiliate commission rates 2026](https://fluxnote.io/guides/amazon-india-affiliate-commission-rates-2026)
