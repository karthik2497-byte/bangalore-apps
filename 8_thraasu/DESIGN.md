---
name: Thraasu
description: Kerala counter billing on a phone; the shop's brass weighing balance, digitised.
colors:
  paper: "#F6F2E9"
  paper-2: "#EEE7D8"
  slip: "#FFFFFF"
  ink: "#1C2620"
  ink-2: "#4B584F"
  line: "#E1D9C8"
  field: "#8F836B"
  leaf: "#1E6B3A"
  leaf-deep: "#154F2A"
  leaf-wash: "#E2EEE0"
  brass: "#B8862B"
  brass-ink: "#7A5610"
  brass-wash: "#F4E8C9"
  chilli: "#B3301F"
  chilli-wash: "#F8E0DA"
  sack-veg: "#E2EED9"
  sack-veg-ink: "#2E5E22"
  sack-fruit: "#FAEDBF"
  sack-fruit-ink: "#6A4F00"
  sack-rice: "#EFE6D6"
  sack-rice-ink: "#5F4A2E"
  sack-pulses: "#F8DFC6"
  sack-pulses-ink: "#7C4112"
  sack-oil: "#EEEAC4"
  sack-oil-ink: "#545015"
  sack-dairy: "#DCE9F3"
  sack-dairy-ink: "#1F4C73"
  sack-spice: "#F6D9D2"
  sack-spice-ink: "#8A2B1D"
  sack-stat: "#E1E1F2"
  sack-stat-ink: "#34367A"
typography:
  display:
    fontFamily: "Anek Malayalam, Noto Sans Malayalam, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 760
    lineHeight: 1.1
    fontFeature: "tnum"
  headline:
    fontFamily: "Anek Malayalam, Noto Sans Malayalam, system-ui, sans-serif"
    fontSize: "25px"
    fontWeight: 720
    lineHeight: 1.2
  title:
    fontFamily: "Anek Malayalam, Noto Sans Malayalam, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 720
    lineHeight: 1.2
  tile:
    fontFamily: "Anek Malayalam, Noto Sans Malayalam, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 680
    lineHeight: 1.25
    fontVariation: "'wdth' 92"
  item:
    fontFamily: "Anek Malayalam, Noto Sans Malayalam, system-ui, sans-serif"
    fontSize: "17.5px"
    fontWeight: 640
    lineHeight: 1.3
    fontVariation: "'wdth' 90"
  body:
    fontFamily: "Anek Malayalam, Noto Sans Malayalam, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  label:
    fontFamily: "Anek Malayalam, Noto Sans Malayalam, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.3
rounded:
  field-sm: "10px"
  chip: "12px"
  r: "14px"
  bar: "18px"
  sheet: "22px"
  pill: "999px"
  pan: "50%"
spacing:
  tight: "8px"
  grid-gap: "10px"
  gutter: "16px"
  touch-min: "48px"
components:
  button-primary:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.slip}"
    rounded: "{rounded.r}"
    padding: "0 16px"
    height: "52px"
  button-primary-hover:
    backgroundColor: "{colors.leaf-deep}"
  button-ghost:
    backgroundColor: "{colors.slip}"
    textColor: "{colors.ink}"
    rounded: "{rounded.r}"
    height: "52px"
  button-quiet:
    textColor: "{colors.brass-ink}"
    rounded: "{rounded.r}"
    height: "48px"
  button-quiet-hover:
    backgroundColor: "{colors.brass-wash}"
  button-danger:
    backgroundColor: "{colors.slip}"
    textColor: "{colors.chilli}"
    rounded: "{rounded.r}"
    height: "52px"
  button-danger-hover:
    backgroundColor: "{colors.chilli-wash}"
  chip:
    backgroundColor: "{colors.slip}"
    textColor: "{colors.ink}"
    rounded: "{rounded.chip}"
    height: "54px"
  chip-selected:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.slip}"
  input-search:
    backgroundColor: "{colors.slip}"
    textColor: "{colors.ink}"
    rounded: "{rounded.r}"
    height: "54px"
    padding: "0 52px 0 46px"
  input-quantity:
    backgroundColor: "{colors.slip}"
    textColor: "{colors.ink}"
    rounded: "{rounded.r}"
    height: "58px"
    padding: "0 14px"
  category-tile:
    typography: "{typography.tile}"
    rounded: "{rounded.r}"
    padding: "10px 14px 12px"
  product-card:
    backgroundColor: "{colors.slip}"
    typography: "{typography.item}"
    rounded: "{rounded.r}"
    padding: "10px 12px 12px"
  bill-bar:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.slip}"
    rounded: "{rounded.bar}"
    height: "64px"
  in-bill-badge:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.slip}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.slip}"
    rounded: "{rounded.r}"
---

# Design System: Thraasu

## Overview

**Creative North Star: "The Brass Thraasu on the Bill Pad"**

Thraasu is an operate-mode counter tool: one shelf screen, a quantity bottom sheet, and a receipt slip. Its world is the Kerala shop counter: a warm bill-pad paper ground, a white receipt slip with a torn zigzag edge, banana-leaf green for the action that commits, the brass of the weighing balance for the brand and the scale, and chilli red for taking things off the bill. Products are photo tiles in produce-sack tints, one tint per category; in search rows and on the bill the photo sits on a round "pan" (scale pan).

Density is phone-counter density: large tiles in the thumb zone, a pinned live total, every control at least 48 px. Type is a single family, Anek Malayalam, using its width axis to condense names on tiles and its weight range for money. All numbers are tabular. The system is light-only (a brand commitment in PRODUCT.md).

It rejects the POS-dashboard look: no sidebars, no KPI tiles, no on-screen data tables.

**Key Characteristics:**
- Warm paper ground, white slip surfaces, one green for commit and money.
- Brass is the instrument: scale drawing, brand mark, pan rims, focus ring.
- Eight produce-sack tint pairs keyed by category, with a brass fallback.
- One family (Anek Malayalam), condensed on tiles, heavy and tabular for totals.
- 48 px touch floor; a single authored motion (the beam settling).

## Colors

A warm paper-and-brass neutral field with one leaf-green action colour, one chilli removal colour, and a set of category sack tints.

### Primary
- **Banana Leaf** (leaf): fills the primary button, the bill bar, a selected preset chip, the in-bill badge, the border of a product already on the bill, and the focus edge of inputs. **Leaf Deep** (leaf-deep) is its hover state and the colour of every money figure: product rate, bill grand total, sheet amount, brand wordmark. **Leaf Wash** (leaf-wash) is the 3 px focus halo around inputs.

### Secondary
- **Thraasu Brass** (brass): only as fill or stroke in drawings: the scale in the quantity sheet, the empty-bill illustration, the pan rim (at 30% alpha). It never carries text.
- **Brass Ink** (brass-ink): the brass that does carry text and outlines: the global `:focus-visible` ring (3 px), quiet buttons, the sample-prices pill text, and the fallback category ink.
- **Brass Wash** (brass-wash): sample-prices pill, quiet-button hover, fallback category tint.

### Tertiary
- **Chilli** (chilli): removal and validation only: the per-line remove control, the danger button that removes a line from the quantity sheet, and the quantity hint under an invalid entry. **Chilli Wash** (chilli-wash) is their hover ground.

### Neutral
- **Bill-pad Paper** (paper): page ground, sticky header, sheet footer, theme colour.
- **Paper Shade** (paper-2): bill panel ground and skeleton base, one step below paper so the white slip lifts off it.
- **Slip White** (slip): every surface you touch or read a total on: cards, search field, results list, slip, sheet, chips.
- **Ink** (ink): body text, grand-total rule, selected unit toggle, toast ground. **Ink 2** (ink-2): secondary text and icons.
- **Field Edge** (field): the edge of every input, preset chip and unit toggle; at least 3:1 on slip and paper (WCAG 1.4.11). Also the dashed underline of the shop-name field.
- **Divider** (line): card and list borders, row and line dividers, the bill panel's left edge on wide screens, the edge of label-bearing buttons (back, ghost).

### Produce-sack tints
Each category in `products.json` sets a `--tint` / `--tint-ink` pair through `data-cat` (veg, fruit, rice, pulses, spice, oil, dairy, drinks, snacks, instant, sauces, care, clean, pooja, misc: fifteen, each ink at least 5.9:1 on its tint). The tint fills category tiles, the photo area of product tiles, and pans; the ink colours tile text and the category heading. A category without a pair falls back to brass-wash / brass-ink.

### Named Rules
**The Edge Is Not A Divider Rule.** Controls a user types into or toggles (inputs, preset chips, the unit segmented toggle) take a 1.5 px field edge. The line colour is for dividers and for buttons whose label already identifies them; it never outlines an input.

**The Brass Carries No Text Rule.** Brass (#B8862B) is for drawn metal. Any brass-coloured text, ring or outline uses brass-ink.

**The Chilli Removes Rule.** Chilli appears only where something is taken off the bill or an entry is wrong. The spice category's red ink is a sack tint, not chilli.

## Typography

**Display Font:** Anek Malayalam (with Noto Sans Malayalam, system-ui)
**Emoji Font:** Noto Color Emoji, loaded as a subset of exactly the price list's icons.

**Character:** One variable family carries everything. The width axis condenses product and category names (90-92%) so long Malayalam words fit two-up on a phone; the weight axis (400-760) separates reading text from money.

### Hierarchy
- **Display** (760, 32px, 1.1): the money a shopkeeper reads aloud: bill grand total and the quantity sheet's computed amount. Leaf-deep.
- **Headline** (720, 25px, 1.2): product name in the quantity sheet. The brand wordmark sits beside it at 750 / 24px.
- **Title** (720, 21px, 1.2): category heading in the crumb, bill heading. Bill bar total uses 750 / 23px.
- **Tile** (680, 19px, 1.25, width 92%): category tile names.
- **Item** (640, 17.5px, 1.3, width 90%): product names on cards; bill line names use 640 / 16.5px.
- **Body** (400, 16px, 1.45): base text; buttons are 650 / 16px, chips 650 / 15.5px, rates 640 / 15px.
- **Label** (500, 13-14px): English sub-names, counts, meta, hints.

### Named Rules
**The Tabular Money Rule.** `font-variant-numeric: tabular-nums` is set on body; every price, quantity and total inherits it so columns of figures align.

**The Two Languages Rule.** Malayalam leads; the English gloss sits underneath at label size in ink-2, marked `lang="en"`.

## Layout

Phone first. A sticky top (brand, sample-prices pill, search) over a shelf of tiles laid on `repeat(auto-fill, minmax(148px, 1fr))` with a 10px gap, which yields two columns at 412 px. Side gutter is 16px throughout, with safe-area insets added on top, bottom and the bill bar.

Below 900px the bill is a full-screen panel that slides up from the bottom, opened from a fixed green bill bar floating 12px from the screen edges. At 900px and above the body becomes a two-column grid (`minmax(0, 1fr) 400px`): the shelf on the left, the bill as a sticky full-height side column on the right; the bill bar is hidden and tiles widen to a 164px minimum. The quantity sheet is a bottom sheet (max 560px wide) under 600px and a centred dialog above it.

Print is its own layout: everything but the receipt is hidden, and the receipt is a 72mm column on 5mm margins in black on white, which suits an 80mm roll and still reads on A4.

## Elevation & Depth

Hybrid: tonal layering does most of the work (paper-2 under paper under slip white), with a soft, warm-tinted shadow on white surfaces and stronger shadows only on things that float over the page.

### Shadow Vocabulary
- **Lift** (`--lift`): two-layer warm brown at 6% alpha; product cards, results list, disabled bill bar.
- **Slip drop**: `drop-shadow` (not box-shadow) on the receipt slip so the torn edge casts too.
- **Floating bar**: leaf-tinted shadow under the bill bar.
- **Sheet**: upward shadow on the quantity sheet over a 50% ink backdrop.
- **Pan rim**: an inset 2px brass ring at 30% alpha; a material edge, not elevation.

### Named Rules
**The Warm Shadow Rule.** Shadows are tinted with the paper's brown (rgb 60,45,15) or the leaf, never neutral grey, except the toast, which floats over everything.

## Shapes

One working radius (14px) for cards, tiles, inputs, buttons and the slip's top corners. Smaller 10-12px for compact controls (rate and discount inputs, chips, icon buttons); 18px for the floating bill bar; 22px for the sheet's top corners (all four on wide screens). Pills (999px) for the sample-prices tag, the in-bill badge and the back button. Pans are circles.

The receipt slip is the signature silhouette: rounded top, flat sides, and a zigzag torn bottom edge cut with a conic-gradient mask in 16px teeth. Bill lines are separated by dashed rules, echoing the bill pad.

## Components

### Buttons
Solid, 650 weight, 52px tall, 14px radius; press nudges down 1px.
- **Primary:** leaf ground, white text; hover leaf-deep. One per surface: add to bill in the sheet, print / PDF in the bill (Share sits beside it as a ghost button: the bill as a 576 px PNG for WhatsApp, or for printing from browsers whose print does nothing).
- **Ghost:** slip ground with a divider edge; hover darkens the edge to ink-2.
- **Quiet:** no ground, brass-ink text, 48px; hover brass-wash.
- **Danger:** slip ground, chilli text, pale chilli edge; hover chilli-wash.
- **Icon buttons:** 48 x 48, no ground, ink-2; hover paper.

### Chips (quantity presets)
Five across, 54px tall, 12px radius, field edge on slip. Hover turns the edge leaf; selected (`aria-pressed`) fills leaf with white text.

### Unit toggle
Segmented kg/g or L/ml control beside the quantity input: field edge, 62px segments, selected segment filled ink with white text.

### Inputs / Fields
- **Style:** slip ground, 1.5px field edge, 14px radius (10px for the compact rate and discount fields). Search is 54px with a leading magnifier and a 48px clear button; the quantity input is 58px at 23px / 680.
- **Focus:** border turns leaf with a 3px leaf-wash halo; no outline.
- **Shop name:** borderless, centred, with a dashed field-colour underline that turns leaf on focus.

### Category tiles
Full-tint sack colour, no border: a 16:10 photo across the top (the 40px emoji on the tint until a photo exists), then the name in tile type, English gloss and item count. Press scales to 0.97.

### Product tiles
Slip white, divider border, lift shadow: a 4:3 photo across the top (the 46px emoji on the tint until a photo exists), then the Malayalam name over the English one and the rate in leaf-deep at the bottom. A product already on the bill gets a 2px leaf edge (an outline, so it paints over the photo, dropped while the focus ring shows) and a leaf badge with its quantity top-right over the photo.

### Photos
`img/<id>.webp`, 400×400 WebP, named per product and category in `products.json`. Every photo covers its emoji and is removed if it fails to load, so the emoji always shows through. Photos are cached on first view, not at install.

### Pan
A 50px circle (44px in search rows, 40px in the price list, 38px on bill lines) in the category tint with a brass rim, holding the product emoji, or its photo in search rows and on the bill.

### Logo (home)
The scale mark and ത്രാസ് are one button: back to the category grid from a category or a search. 48px tall inside the 40px top row (negative block margin), pressed scale 0.97.

### Shop button and sheet ("കട")
A 48px storefront icon at the top right, after the price pill, with an 11px status dot: field-grey on this phone only, leaf when synced, brass while a change waits. It opens a tall sheet (the price list's shell): an account box (code and PIN fields, 52px, and a full-width leaf login button; signed in: shop name and code, a sync line in leaf-deep or brass-ink, sync-now and logout side by side) and a backup box (save and restore side by side). Boxes are paper-ground with a divider edge on the slip-white sheet. Signed out, a ghost "പുതിയ കട രജിസ്റ്റർ ചെയ്യുക" button under Login swaps the account box for a sign-up box: a short explainer, the fee line (leaf-deep, 650), shop name, mobile, PIN twice (52px fields), back and send side by side, and a 14px privacy line with a leaf-deep link. A sent request shows above Login as a leaf-wash note with the shop code at 26px / 750, letter-spaced. Errors in the sheet are chilli.

### Price pill
The door to the price list, top right. Brass-wash "മാതൃകാ വിലകൾ" while every price is the sample; brass "സ്വന്തം വില n/68" once some are the shop's own; leaf-wash "വിലകൾ" when none are sample (or the list is not sample at all). A 7px transparent border with padding-box background keeps a 34px pill on a 48px target. A trailing chevron says it opens something.

### Placeholder tile
A product with no photo at all keeps its emoji, 46px, on the sack tint, with a camera button (34px white circle, 48px target) on the photo's top-left corner. The tile and the camera are siblings in a `.slot` wrapper, since a button cannot hold a button. A photo taken or picked there replaces the placeholder.

### Price list ("വിലയും ഫോട്ടോയും", prices and photos)
A tall sheet (same sheet shell, `min(92dvh, 820px)`): title and an "n/459 … ഫോട്ടോയിൽ തൊട്ടാൽ മാറ്റാം" line, the shelf search, then every product grouped under sticky category headings in the category's tint-ink. A row: 40px pan inside a 48px photo button with a small camera badge, Malayalam name (16px) over "മാതൃകാ വില" (brass, sample lists only) or "പട്ടിക ₹40" / "മാതൃക ₹40" (ink-2) once changed, then " · സ്റ്റോക്ക് 25 kg" (ink-2) for a counted item, a 72px rate input with its per-unit label, and a ↺ reset only on changed rows (no empty slot, so names keep the width). A shop price fills its input leaf-wash with a leaf edge. Saves on change; a non-price entry puts the old value back.

### Keep-rate row
In the quantity sheet, after the rate field is edited away from the shelf price: a 48px checkbox row in leaf-deep, "ഈ നിരക്ക് എന്റെ വിലയായി സൂക്ഷിക്കുക", checked by default.

### Bill bar
Fixed at the bottom on narrow screens: leaf, 18px radius, item count over the live total (750 / 23px) and a translucent "view bill" pill. Empty, it turns to slip white with ink-2 text and the lift shadow. Adding an item bumps it (scale 1.035, 280ms).

### Quantity sheet
A native `<dialog>`; no drag grip. Header: the brass balance drawing beside the product name (with "സ്റ്റോക്ക് 25 kg" under the English name for a counted item) and an editable rate. Body: preset chips, then a custom quantity row with the unit toggle. Footer on paper: the computed line and amount in display type, then a danger remove button (only when editing a line already on the bill) and a full-width primary.

**The One Settle Rule.** The beam settle (760ms: dip to -7deg, swing past level to 3.2deg, rest) is the single authored motion moment, replayed each time the valid quantity changes. Everything else is functional feedback: press scale, bar bump, sheet rise (260ms), bill slide (280ms), toast. All share `--ease` and collapse under `prefers-reduced-motion`.

### Toast
Ink pill-ish bar above the bill bar with a brass-gold undo action, sliding up 16px.

## Do's and Don'ts

### Do:
- **Do** keep every control at or above 48px; primary buttons are 52px and chips 54px.
- **Do** edge inputs, chips and toggles with field (#8F836B); keep line (#E1D9C8) for dividers.
- **Do** show money in leaf-deep, tabular, at display weight when it is the figure being read out.
- **Do** give every new category a tint / tint-ink pair; the brass fallback is a safety net, not a style.
- **Do** put product photos across the top of the tile (a round pan in search rows and on the bill), always over the emoji, never in place of it.
- **Do** keep the receipt print-only, black on white, within 72mm.

### Don't:
- **Don't** use brass (#B8862B) for text or rings; use brass-ink.
- **Don't** use chilli for anything but removal and invalid input.
- **Don't** add a second primary (leaf) button to a surface.
- **Don't** add a dark theme.
- **Don't** introduce dashboard furniture: sidebars, KPI tiles, on-screen data tables.
- **Don't** add a drag grip or a second decorative animation to the sheet; the beam settle is the one.
