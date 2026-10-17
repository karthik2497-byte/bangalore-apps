# Thraasu: bill time, daily bill numbers, the last two days' bills, and removing items

Approved by Karthik 2026-10-17 (every-morning numbering; removal option A).
Design canvas: https://claude.ai/artifact/Y86cJdu28pyaeHgdNTM7kr

## 1. Bill time and number
- **One time per bill: when its first item goes on** (`bill.started`). The on-screen slip, the print, the
  shared image and the bills list all show it, so a reprint shows the time of the sale, not of the reprint.
  Until now the print stamped the print time and the screen the time the empty bill was made.
- **Format:** `17 Oct 2026 · 2:16 PM`: 12-hour, AM/PM in capitals, whatever the phone's clock setting.
- **Number:** goes back to 0001 every morning. An empty bill always shows today's next number (1 + the
  highest number among today's kept bills), so a bill opened last night and first used this morning
  is 0001. Four digits, as before.
- **Where:** the number, date and time move from the bill head into the slip, under the shop name, the way
  the print has them: `ബിൽ നം. 0007 · 17 Oct 2026 · 2:16 PM`. The receipt keeps one meta line, in the new
  format. A saved PDF or shared image is named `Thraasu-Bill-2026-10-17-0007`, since numbers now repeat.

## 2. The last two days' bills (ബില്ലുകൾ)
- **Kept on this phone** (`thraasu_bills`, newest first): every bill once it is sold (printed, shared or
  closed with പുതിയ ബിൽ), updated while it is edited after that, dropped if all its lines are removed.
  Only today's and yesterday's are kept; older ones are removed at launch and on every save. Each keeps
  only what its receipt needs: number, time, discount and lines (name, quantity, unit, rate).
  ponytail: localStorage, capped at 1000 bills; IndexedDB if a shop ever bills more than that in two days.
  Not synced: each phone shows the bills it made (the server keeps sales only as stock counts).
- **Doors:** a ബില്ലുകൾ pill at the right of the bill head (always visible on wide screens). On phones, the
  bill bar of an empty bill reads ബില്ലുകൾ › and opens the list directly when there are kept bills;
  with none it stays disabled as before.
- **List:** the tall sheet shell of the price list. Title ബില്ലുകൾ, "ഇന്നും ഇന്നലെയും · ഈ ഫോണിൽ". A heading
  per day, ഇന്ന് · 17 Oct with "6 ബില്ലുകൾ · ₹2,052" on the right in leaf-deep; ഇന്നലെ only when it has
  bills; today with none says "ഇന്ന് ബില്ലുകളൊന്നുമില്ല". A row per bill: നം. 0006, "2:16 PM · 5 ഇനങ്ങൾ", the
  total in leaf-deep, ›.
- **One bill:** a row swaps the list for that bill inside the same sheet: ‹ back, title ബിൽ നം. 0004,
  "ഇന്ന് · 12:40 PM · 4 ഇനങ്ങൾ", the receipt as it prints on a white slip, and പ്രിന്റ് / PDF (primary) with
  ഷെയർ beside it. Read only. ‹, Esc and Android back return to the list; ✕ closes.

## 3. Removing items from the price list (option A)
- **Normal mode** has no ✕ on any row: the ✕ that items the shop added had goes too. A foot under the list
  holds one quiet button, 🗑 സാധനങ്ങൾ നീക്കുക; it hides while a price box is being typed in.
- **Remove mode:** the title reads നീക്കേണ്ടവ തൊടുക with "2 എണ്ണം തിരഞ്ഞെടുത്തു" under it. Each row becomes
  one toggle (`aria-pressed`): pan, name, its price and stock, a tick circle where the price box was; ticked
  rows turn chilli-wash with a filled chilli tick. Search still filters, and ticks survive it. The foot:
  റദ്ദാക്കുക and a danger "2 എണ്ണം നീക്കുക" (off at none; short enough for one line at 320 px).
- **Confirmation:** a small centred dialog: "2 സാധനങ്ങൾ നീക്കണോ?", the names as chips (up to 6, then
  "+N"), "ഷെൽഫിലും തിരച്ചിലിലും വിലപ്പട്ടികയിലും ഇനി കാണില്ല. കടയിലെ എല്ലാ ഫോണിൽ നിന്നും മാറും (or ഈ
  ഫോണിൽ നിന്ന് മാറും, logged out). ഇതുവരെയുള്ള ബില്ലുകളെ ബാധിക്കില്ല.", വേണ്ട and നീക്കുക.
- **Removed:** the list leaves remove mode, a toast "2 സാധനങ്ങൾ നീക്കി" offers പഴയപടി (undo).
  An item the shop added is deleted, as its ✕ did. Any other item (the shop's list or the template) is
  hidden: `thraasu_hidden` on the phone, D1 `hidden` for a logged-in shop, so every phone of the shop
  drops it and a `catalog` re-import does not bring it back. Its price and photo stay on the server.
  A hidden item's name can be added again as a new item. Bills keep their own copy of every line.
  Not built: a list of removed items to bring back (undo only; a row deleted from D1 `hidden` brings one back).
- **Sync:** outbox `hide` {id: true to hide, false to show again}; `POST hidden {hide, show}`;
  `GET state` returns `hidden` (ids). Login sends the phone's hidden ids up. The backup file carries them.
  At most 2000 hidden ids per shop.
