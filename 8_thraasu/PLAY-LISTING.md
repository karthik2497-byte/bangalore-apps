# Thraasu on Google Play: listing, forms and steps

Prepared 2026-10-29. Everything Play Console asks for, ready to paste. The graphics come from
`node scripts/browser/cdp.mjs 8_thraasu/tools/play-shots.mjs` (to `~/Desktop/thraasu-play`; re-run after a UI change).
The app file comes from GitHub Actions: Build Android AABs, app `8_thraasu` (artifact `Thraasu-aab`).
The Malayalam below is unreviewed, like the app's (NEXT_STEPS §4). The review shop's PIN is never written here:
this repo is public.

Never in the listing: the ₹199, a trial, or how a shop pays. Play bans steering users to pay outside Play, in the
listing as well as in the app.

## 1. Create the app (Play Console → Create app)

| Field | Answer |
|---|---|
| App name | Thraasu: Kerala Shop Billing |
| Default language | English (India) – en-IN; add Malayalam (ml-IN) as a translation |
| App or game | App |
| Free or paid | Free (permanent: a free app can never become paid) |
| Declarations | Tick both (Developer Program Policies, US export laws) |

Package: `uk.tinkerhouse.thraasu`, fixed by the first upload.

## 2. Main store listing

**App name** (30): `Thraasu: Kerala Shop Billing` · ml: `ത്രാസ്: കട ബില്ലിംഗ്`

**Short description** (80):
- en: `Shop billing in Malayalam: tap an item, set the weight, print or share the bill`
- ml: `സാധനം തൊടൂ, തൂക്കം നൽകൂ, വില തനിയെ: ബിൽ പ്രിന്റ് ചെയ്യാം, അയക്കാം`

**Full description, en** (4000):

```
Thraasu (ത്രാസ്, "the scale") is a billing app for Kerala's small shops: groceries, vegetables, provisions and bakeries. Everything is in Malayalam, and it works on one phone with no sign-up.

HOW IT WORKS
• Tap an item on the shelf, or search in Malayalam or English (thakkali, tomato).
• Type the weight or count in kg, g, litre, ml or pieces; the price is worked out.
• Pick how the bill was paid: cash, UPI or credit.
• Print the bill on a printer the phone can use, save it as a PDF, or share it as a picture.

MADE FOR THE COUNTER
• More than 400 common items in categories, many with photos.
• Your own prices: change a price once and it stays.
• Add your own items, and take off the ones you don't sell.
• Today's and yesterday's bills, with each day's total by payment, to print or share again.
• Billing keeps working without internet.
• Your own photos for your items.
• A backup file carries your prices and photos to a new phone.

NO ACCOUNT NEEDED
The app needs no account and has no limit on bills. Your prices and bills stay on your phone.

SHOP ACCOUNT (OPTIONAL)
A shop with more than one phone can ask for a shop account in the app. Every phone then shares the same prices and items, every phone's bills show in one place, and stock goes down as items sell. We set up an account for each shop that asks.

Privacy policy: https://tinkerhouse.uk/8_thraasu/privacy.html
```

**Full description, ml** (4000):

```
ത്രാസ്: കേരളത്തിലെ ചെറിയ കടകൾക്കുള്ള ബില്ലിംഗ് ആപ്പ്. പലചരക്ക്, പച്ചക്കറി, ബേക്കറി. എല്ലാം മലയാളത്തിൽ. ഒരു ഫോൺ മതി, രജിസ്ട്രേഷൻ വേണ്ട.

എങ്ങനെ
• സാധനം തൊടുക, അല്ലെങ്കിൽ മലയാളത്തിലോ ഇംഗ്ലീഷിലോ തിരയുക (thakkali, tomato).
• തൂക്കമോ എണ്ണമോ നൽകുക: കിലോ, ഗ്രാം, ലിറ്റർ, മില്ലി, എണ്ണം. വില തനിയെ കണക്കാക്കും.
• പണം എങ്ങനെ എന്ന് തിരഞ്ഞെടുക്കുക: ക്യാഷ്, UPI, കടം.
• ബിൽ ഫോണിൽ നിന്ന് പ്രിന്റ് ചെയ്യാം, PDF ആക്കാം, ചിത്രമായി അയക്കാം.

കൗണ്ടറിനായി
• 400-ലധികം സാധനങ്ങൾ, വിഭാഗങ്ങളായി; പലതിനും ഫോട്ടോ.
• നിങ്ങളുടെ വില: ഒരിക്കൽ മാറ്റിയാൽ അതുതന്നെ തുടരും.
• പുതിയ സാധനങ്ങൾ ചേർക്കാം, വിൽക്കാത്തവ നീക്കാം.
• ഇന്നത്തെയും ഇന്നലത്തെയും ബില്ലുകൾ, ഓരോ ദിവസത്തെയും ആകെ പണത്തിന്റെ തരം തിരിച്ച്; വീണ്ടും പ്രിന്റ് ചെയ്യാം, അയക്കാം.
• ഇന്റർനെറ്റ് ഇല്ലെങ്കിലും ബില്ലിംഗ് നടക്കും.
• സാധനങ്ങൾക്ക് സ്വന്തം ഫോട്ടോ ചേർക്കാം.
• ബാക്കപ്പ് ഫയൽ: വിലയും ഫോട്ടോയും പുതിയ ഫോണിലേക്ക്.

അക്കൗണ്ട് വേണ്ട
ആപ്പിന് അക്കൗണ്ട് വേണ്ട, ബില്ലുകൾക്ക് പരിധിയില്ല. വിലയും ബില്ലുകളും നിങ്ങളുടെ ഫോണിൽത്തന്നെ.

കടയുടെ അക്കൗണ്ട് (ആവശ്യമെങ്കിൽ)
ഒന്നിലധികം ഫോണുള്ള കടയ്ക്ക് ആപ്പിൽ നിന്ന് കടയുടെ അക്കൗണ്ട് ചോദിക്കാം. എല്ലാ ഫോണിലും ഒരേ വിലയും സാധനങ്ങളും, എല്ലാ ഫോണിലെയും ബില്ലുകൾ ഒരിടത്ത്, വിൽക്കുന്നതനുസരിച്ച് സ്റ്റോക്ക് കുറയും. ചോദിക്കുന്ന ഓരോ കടയ്ക്കും ഞങ്ങൾ അക്കൗണ്ട് ഒരുക്കും.

സ്വകാര്യതാ നയം: https://tinkerhouse.uk/8_thraasu/privacy.html
```

**Graphics** (in `~/Desktop/thraasu-play`): App icon `icon-512.png` (512 × 512, 32-bit) · Feature graphic
`feature-graphic.jpg` (1024 × 500) · Phone screenshots `1-shelf.jpg` … `6-kept-bill.jpg` (1080 × 1920, in that order).
The same graphics serve the Malayalam listing.

## 3. Store settings

| Field | Answer |
|---|---|
| Category | Business |
| Tags | the closest of: Point of sale, Invoicing, Small business |
| Email | ckventurestech@gmail.com |
| Website | https://tinkerhouse.uk/8_thraasu/ |
| Phone | leave empty |

## 4. App content (Policy → App content)

| Section | Answer |
|---|---|
| Privacy policy | https://tinkerhouse.uk/8_thraasu/privacy.html |
| Ads | No, my app does not contain ads |
| App access | All or some functionality is restricted. Instructions: "Billing, printing and sharing need no login. The optional shop account (one shop's phones sharing prices, bills and stock) needs a shop code and PIN. Tap the shop icon at the top right, then കോഡ് ഉണ്ടെങ്കിൽ ലോഗിൻ ചെയ്യുക, and enter code PLAYREVIEW and the PIN below." The PIN: `~/Desktop/thraasu-play/review-login.txt` |
| Content rating | Category: all other app types (utility, productivity). Answer No to every question. Expect Everyone / 3+ |
| Target audience | 18 and over only |
| News app | No |
| Government app | No |
| Financial features | My app doesn't provide any financial features (it records a shop's sales; it moves no money) |
| Health | No health features |
| Advertising ID | No (the app has no ads or analytics SDK) |
| Delete account URL | https://tinkerhouse.uk/8_thraasu/privacy.html#delete (the app links to it from the shop sheet) |
| Delete some data without the account | No |

**Data safety**

- Collects or shares required user data: **Yes** (only with a shop account; without one nothing leaves the phone).
- Encrypted in transit: **Yes**. Users can request deletion: **Yes** (the URL above).
- Shared with third parties: **none** (Cloudflare hosts it for us, which Play does not count as sharing).
- Every type below: **Collected**, not processed ephemerally, **optional** (users choose to have a shop account).

| Data type | What it is | Purposes |
|---|---|---|
| Personal info: Name | the shop's name | Account management, App functionality |
| Personal info: Phone number | the owner's mobile, given when asking for a shop | Account management, Developer communications |
| Personal info: User IDs | the shop code | Account management, App functionality |
| Financial info: Other financial info | the shop's sold bills: items, prices, how each was paid | App functionality |
| Photos and videos: Photos | product photos the shop adds | App functionality |
| App activity: Other user-generated content | the shop's prices, items and stock | App functionality |

## 5. Release (personal account)

1. Test and release → Closed testing → create a track, country India, testers: an email list of at least 12 Google
   accounts that use Android phones.
2. Create release: upload `thraasu.aab`; accept Play App Signing with a Google-generated key; release notes
   "First test version". Send for review.
3. Test and release → App integrity → App signing: copy the **app signing key** SHA-256 and send it to Claude. It
   goes into `.well-known/assetlinks.json` beside the upload key's, so the Play install opens without a browser bar.
4. Once approved, send the testers the "Join on Android" link. All 12 must stay opted in for 14 days in a row.
5. Dashboard → Apply for production; answer the questions about the test. Google's review can take up to a week.

During the test, check NEXT_STEPS §6 on a real Android phone: printing, sharing, and the paid account's paused flow.
