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
| Default language | English (India) – en-IN (Malayalam is added later, in the store listing's language menu) |
| App or game | App |
| Free or paid | Free (permanent: a free app can never become paid) |
| Declarations | Tick both (Developer Program Policies, US export laws) |

Package: `uk.tinkerhouse.thraasu`, fixed by the first upload.

Then the Dashboard lists the rest as tasks. Sections 2 to 4 follow its "Finish setting up your app" list top to bottom,
under the same names; any order works. "Closed testing" (section 5) unlocks once all of them are done. Skip
"Internal testing": it is optional.

## 2. Let us know about the content of your app

| Dashboard task | Answer |
|---|---|
| Set privacy policy | https://tinkerhouse.uk/8_thraasu/privacy.html |
| Sign in details | Is any part restricted: Yes → Add details. Name `Shop account`; username `PLAYREVIEW`; password: the PIN in `~/Desktop/thraasu-play/review-login.txt`; other information (Play wants English, so Malayalam labels get a gloss): "Billing, printing and sharing need no sign in. Only the optional shop account (one shop's phones sharing prices, bills and stock) needs the username and password above. The app is in Malayalam: tap the shop icon at the top right, then the button 'കോഡ് ഉണ്ടെങ്കിൽ ലോഗിൻ ചെയ്യുക' (Log in with a code), enter PLAYREVIEW as the code and the password above as the PIN, and tap 'ലോഗിൻ' (Log in)." Tick "full access … including premium or paid content" (PLAYREVIEW is paid through 2027). |
| Ads | No, my app does not contain ads |
| Content rating | Email ckventurestech@gmail.com; category All Other App Types; tick the IARC Terms of Use. Online content: **Yes** (the item list and photos load from the server), then No to violence, sexuality, language and drugs. No to every other question. Result (2026-10-31): Everyone, PEGI 3, USK 0, ClassInd L |
| Target audience | 18 and over only; leave the optional "restrict users Google has determined to be minors" unticked |
| Data safety | below |
| Government apps | No |
| Financial features | My app doesn't provide any financial features (it records a shop's sales; it moves no money) |
| Health | No health features |

If they show up later: News apps, No; Advertising ID, No (the app has no ads or analytics SDK).

**Data safety**

- Collects or shares required user data: **Yes** (only with a shop account; without one nothing leaves the phone).
- Encrypted in transit: **Yes**.
- Account creation: **Username and password** (an owner asks for a shop in the app; the shop code and PIN are the username and password). Delete account URL: https://tinkerhouse.uk/8_thraasu/privacy.html#delete (the app links to it from the shop sheet). Delete some data without the account: No.
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

## 3. Select an app category and provide contact details

| Field | Answer |
|---|---|
| Category | Business |
| Tags | Business, Productivity (Play has no billing or point-of-sale tag) |
| Email | ckventurestech@gmail.com |
| Website | https://tinkerhouse.uk/8_thraasu/ |
| Phone | leave empty |

## 4. Set up your store listing

English first (the default). Then the language menu → Manage languages → Malayalam – ml-IN → Apply; switch to
Malayalam and paste each ml line. The Malayalam listing uses the English graphics. Upload the screenshots one
at a time: several at once land in random order. Then Next. AI asset declaration (images and video only): "Don't
label assets". The screenshots are real captures, and the icon and banner are drawn in code, not by an image
generator. Then Save.

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

## 5. Closed testing (personal account)

1. Test and release → Closed testing → Closed testing - Alpha → Manage track. Countries / regions: India. Testers: the
   email list "Thraasu testers" (12+ Gmail accounts used on Android phones; it can start with one and grow), feedback
   ckventurestech@gmail.com. Done 2026-10-31 with Karthik's Play Gmail only.
2. Create new release: upload `thraasu.aab` (Google signs releases by default; automatic protection on); release
   notes `<en-IN>First test version.</en-IN>`; Next, Save. Then Publishing overview → Submit N changes for review
   (Google's quick checks run first, up to ~15 min). Sent 2026-10-31.
3. Protected with Play → App signing shows Google's **app signing key** and an asset-links snippet naming it. Thraasu's
   is `5D:7C:9B:…:85:CA`, live in `.well-known/assetlinks.json` beside the upload key's since 2026-10-31, so the Play
   install opens without a browser bar.
4. Once approved, send the testers the "Join on Android" link. All 12 must stay opted in for 14 days in a row.
5. Dashboard → Apply for production; answer the questions about the test. Google's review can take up to a week.

During the test, check NEXT_STEPS §6 on a real Android phone: printing, sharing, and the paid account's paused flow.
