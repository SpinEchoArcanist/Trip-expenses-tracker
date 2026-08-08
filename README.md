# ✈️ Vacation Expense Tracker

A fully self-contained, multi-currency expense tracking system for iOS, built with [Scriptable](https://scriptable.app). No subscription, no server, no account — everything runs on-device and syncs via iCloud Drive.

---

## Features

- **Log expenses in seconds** — two-step native alert: amount + category, then description
- **Multi-currency** — EUR, CHF, and a fully configurable third currency (default: GBP). Adaptive display shows each day's dominant currency with a CHF equivalent sub-note
- **Trip name & description** — give the trip a short name shown at the top of the dashboard and the large widget, plus a longer free-text description viewable on demand
- **Trip Dates for accurate averages** — define explicit trip start/end dates so zero-expense days count toward AVG/DAY, not just days with entries; falls back to automatic gap-fill detection when no dates are set
- **GPS tagging** — location is captured automatically when logging and can be opened in Apple Maps or Google Maps
- **Full dashboard** — scrollable WebView with three collapsible sections: By Category, By Day, All Entries
- **Two home screen widgets** — a large summary widget and a small quick-log widget
- **Edit and delete** — any field of any entry can be edited at any time
- **Bulk edit** — select multiple entries and apply a category, currency, ghost status, date change, or deletion in one action, and keep applying more edits without leaving the screen
- **Ghost entries** — exclude any entry from all statistics and averages while keeping it visible in the list (reversible)
- **CSV export** — timestamped export to iCloud Drive, one file per export, never overwrites
- **JSON export / import** — export a full backup including currency metadata, trip dates, and trip name/description; import merges or replaces with duplicate detection and automatic mismatch handling
- **iPad and iPhone** — full-screen on iPad, adaptive font size that respects iOS Dynamic Type

---

## Files

| File | Role |
|------|------|
| `ExpenseTracker.js` | Main script: dashboard, log, edit, bulk edit, settings, export/import |
| `ExpenseDashboard.js` | Large home screen widget (read-only summary) |
| `ExpenseQuickLog.js` | Small home screen widget (tap to log) |
| `expenses.json` | All expense entries — auto-created on first save |
| `expense_settings.json` | User settings — auto-created on first settings save |

All files must live in: **iCloud Drive / Scriptable /**

---

## Installation

1. Install [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) (free) from the App Store.
2. Copy `ExpenseTracker.js`, `ExpenseDashboard.js`, and `ExpenseQuickLog.js` into the **Scriptable** folder in your iCloud Drive.
   - On iPhone/iPad: Files app → iCloud Drive → Scriptable
   - On Mac: ~/Library/Mobile Documents/iCloud~dk~simonbs~Scriptable/Documents/
3. Open Scriptable, confirm the three scripts appear.
4. Tap `ExpenseTracker` to run it — the dashboard opens immediately.

### Home screen widgets (optional)

1. Long-press your home screen → tap **+** → search for **Scriptable**.
2. Add a **Large** widget → tap it to configure → set Script to `ExpenseDashboard`.
3. Add a **Small** widget → tap it to configure → set Script to `ExpenseQuickLog`.
4. Both widgets refresh automatically and tap through to the tracker.

---

## How to use

### Logging an expense

- Tap the **➕ New** button at the bottom of the dashboard, or tap the **small widget** on your home screen.
- **Step 1**: Enter the amount, then tap a category button to confirm both at once.
- **Step 2**: Enter a description (e.g. "Lunch at the harbour").
- Tap **Save ✓**. The entry is saved with the current time, your location (if allowed), and the default currency from settings.

### Editing or deleting an entry

- In the dashboard, scroll to **ALL ENTRIES** and tap the **✏️** button on any row.
- A field picker lets you edit: Date, Time, Amount & Currency, Category, Description.
- You can also **👻 Exclude from stats** to ghost the entry, or **👻 Restore to stats** to un-ghost it.
- Tap **🗑️ Delete** to permanently remove an entry (with confirmation).

### Bulk editing entries

- Tap **✏️ Bulk** in the dashboard action bar.
- A full-screen checklist appears with all entries grouped by day. Tap checkboxes to select any combination.
- Use **Select all** / **Select none** for quick selection.
- Tap one of the action buttons at the bottom to apply to all selected entries:
  - **📂 Category** — change category
  - **💱 Currency** — change currency label (amounts are not converted)
  - **👻 Ghost** — exclude from or restore to statistics
  - **📅 Move date** — reassign all selected entries to a new date
  - **🗑️ Delete selected** — permanently remove all selected entries (with confirmation)
- After applying a change, the screen **refreshes itself in place** with the freshly saved data — checkboxes clear and the list reflects your edit immediately. You can select more entries and apply another change right away, as many times as you like, all in the same session.
- A reminder banner at the top of the screen shows how to leave: tap **Close** in Scriptable's native toolbar (top of screen). Scriptable cannot close this screen automatically, so that tap is always required once you're done. If you tap **Cancel**, or delete every remaining entry, the checklist is replaced with a short confirmation screen so nothing stale is left on screen while you look for the Close button.

### Ghost entries

- A ghost entry remains visible in the **ALL ENTRIES** list but is completely excluded from all totals, averages, and the BY CATEGORY and BY DAY tables.
- Ghost entries appear dimmed with a 👻 icon and a strikethrough amount.
- Ghost status is reversible at any time via the edit screen or bulk edit.
- The ALL ENTRIES section title shows a count of ghost entries (e.g. `ALL ENTRIES (12) — 2 👻`).

### Opening an entry on the map

- Entries logged with GPS show an active **📍** button.
- Tap it to open the location in Apple Maps or Google Maps.

### Trip name & description

- Tap **⚙️** → **🏷️ Trip name & description**, or tap the trip name/title at the top of the dashboard once one is set.
- **Name** — a short label (up to 60 characters, e.g. "Rome getaway") shown in place of "✈️ Vacation Expenses" at the top of the dashboard and the large widget.
- **Description** — a longer free-text note (single line, no manual line breaks — a Scriptable text field limitation) that is **never shown inline**. It only appears in a popup, opened by tapping the trip name/title on the dashboard or via Settings. This keeps the header compact while still letting you keep extra trip details (dates, addresses, notes) somewhere easy to find.
- Once a name is set, the dashboard title becomes tappable (shown with a small ⓘ) and opens that popup directly; the popup itself has an **✏️ Edit** button that jumps back into the same name/description editor.
- Both fields are optional — leaving them blank restores the default "✈️ Vacation Expenses" title everywhere.

### Trip Dates (for accurate AVG/DAY)

By default, AVG/DAY only counted days that had at least one logged expense — a day with zero spending (because you stayed in, or didn't travel) simply didn't count, which understated real savings. Trip Dates fixes this by counting **every day of the trip**, spend or no spend, toward the average.

- Tap **⚙️** → **🗓️ Trip dates** → **Set start date** / **Set end date** (format `YYYY-MM-DD`).
- Once both dates are set, every calendar day from start to end counts toward AVG/DAY, including days with zero entries. A "no expenses" row appears in the **BY DAY** table for each of those zero-spend days so you can see exactly which days are lowering the average, rather than it happening invisibly.
- **Entries outside the trip date range** (e.g. an airport purchase the day before departure) stay fully visible in **ALL ENTRIES** and **BY DAY** — marked with an "outside trip" badge — but are excluded from AVG/DAY, OVERALL, and the BY CATEGORY totals, so pre/post-trip spending doesn't skew your trip's real average.
- **Today and future days are never counted**, even if they fall inside the trip date range — the average only reflects days that have actually happened.
- **If no Trip Dates are set**, the tracker falls back to automatic detection: zero-expense days *between* your earliest and latest logged entry are gap-filled and counted (e.g. entries on day 1 and day 4 with nothing on days 2–3 will count days 2–3 as zero-spend days). This fallback cannot infer the very first or last day of the trip if it has no entries — only Trip Dates can cover that edge correctly, which is why it's the recommended approach for the most accurate average.
- A small subtitle beneath the exchange-rate note on the dashboard shows which mode is active — either your Trip Dates range and day count, or "Auto range (gaps counted)" with a nudge to set explicit dates.
- Use **🗑️ Clear trip dates** to remove the range and revert to automatic detection.

### Changing settings

- Tap **⚙️** in the dashboard action bar.
- **💱 EUR rate** — set the current CHF → EUR conversion rate (1 CHF = ? EUR).
- **🌍 Third currency** — choose from a preset list (GBP, JPY, USD, SEK, CZK, HUF, PLN, NOK, DKK, THB, HKD) or enter a fully custom currency with its own code, symbol, flag emoji, name, and rate. The selected currency becomes the third display mode alongside EUR and CHF.
- **💹 Third currency rate** — update just the exchange rate for the current third currency without changing which currency it is.
- **💶 Default currency for new entries** — CHF, EUR, or the current third currency. Used automatically when logging a new expense.
- **🗓️ Trip dates** — set, view, or clear the explicit trip date range (see above).
- **🏷️ Trip name & description** — set, view, or clear the trip's display name and description (see above).

### Exporting and importing data

- Tap **📤** in the dashboard action bar to open the Export / Import menu.

**📊 Export CSV** — saves a timestamped `.csv` file to iCloud Drive / Scriptable. Each export creates a new file. Columns: Date, Time, Category, Currency, Amount, Amount (CHF), Latitude, Longitude, Description, Ghost.

**📦 Export JSON** — saves a timestamped `.json` file containing all entries plus a `meta` block with the current third-currency configuration, trip dates, and trip name/description. This allows the full trip context to travel with the backup file.

**📥 Import JSON** — opens a file picker. Supports both the new `{ meta, entries }` format and the legacy bare-array format. If the imported file's third currency, trip dates, or trip name/description differ from your current settings, you are warned before any data is loaded (a blank local setting is filled in silently instead, since there's nothing to overwrite). Proceeding updates the corresponding settings to match the file. If you cancel any of these checks, nothing is imported and nothing changes. After the checks, you can choose to **Merge** (keep existing entries and add new ones) or **Replace** (clear existing entries first). Duplicate entries (same date + time + description) are skipped automatically.

### Closing the dashboard

- Tap the **Close** button in Scriptable's native toolbar (top of screen). The script exits cleanly. This also applies to the Bulk Edit screen — see [Bulk editing entries](#bulk-editing-entries) above.

---

## Categories

| Emoji | Name | Colour |
|-------|------|--------|
| 🍽️ | Food | Red |
| 🛒 | Grocery | Orange |
| 🛍️ | Shopping | Violet |
| 🚌 | Transport | Green |
| 🏛️ | Visit / Activities | Blue |
| 🏨 | Housing | Teal |

To add or rename categories, edit the `CATEGORIES` array at the top of both `ExpenseTracker.js` and `ExpenseDashboard.js` — keep them in sync.

---

## Currency and display modes

The tracker supports EUR, CHF, and one configurable third currency. The display mode is cycled with the button in the top-right corner of the dashboard. The four modes are **ADAPTIVE**, **EUR**, **[CUR3]** (your current third currency, e.g. GBP), and **CHF**.

### ADAPTIVE mode (default)

Each value is shown in the most natural currency for its context. A CHF equivalent sub-note is always shown when the display currency is not CHF:

| Block | Currency shown | Sub-note |
|-------|---------------|----------|
| TODAY | Today's dominant currency* | `= CHF X.XX` if not already CHF |
| AVG/DAY | Overall dominant currency† | `= CHF X.XX` if not already CHF |
| OVERALL | Overall dominant currency† | `= CHF X.XX` if not already CHF |
| BY DAY rows | Each day's dominant currency | — |
| ALL ENTRIES | Native (original) currency of each entry | — |

\* *Today's dominant currency*: whichever currency has the highest CHF-equivalent total for today's active entries. If today has no entries, the most recent past day's dominant currency is used. Falls back to CHF if no history exists.

† *Overall dominant currency*: whichever currency has the highest CHF-equivalent total across all **in-trip-window** active entries (see [Trip Dates](#trip-dates-for-accurate-avgday) — entries outside an explicit trip date range are excluded from this and all other aggregate figures).

CHF is the internal reference currency for all calculations. All amounts are converted to CHF first, then to the display currency, minimising rounding errors.

### EUR / [CUR3] / CHF modes

All values are forced into the selected currency. Sub-notes showing the CHF equivalent are still displayed wherever the display currency is not CHF.

---

## Dashboard sections

### Header

Shows the trip name (if set, tappable to view the description — see [Trip name & description](#trip-name--description)) or "✈️ Vacation Expenses" by default, plus today's date. Below the exchange-rate note, a subtitle shows the active trip-day-counting mode (explicit Trip Dates range, or auto gap-fill) and how many days are currently counted toward AVG/DAY.

### BY CATEGORY
A table showing today's spend, average per day (counted past days only — see [Trip Dates](#trip-dates-for-accurate-avgday)), and overall total for each category. All values update instantly when you cycle the display mode — no page reload. Ghost entries, and entries outside an explicit trip date range, are excluded from all figures.

### BY DAY
A horizontally scrollable table with one row per day and one column per category, plus a daily total. The Date column is sticky (stays visible while scrolling). Today's row is shown in green, past days in yellow. Dates are formatted as `Thu 02 Apr`. Ghost entries are excluded from all figures. Days counted only because of Trip Dates / gap-fill (i.e. no actual entries) appear as dimmed "no expenses" rows. Days that fall outside an explicit trip date range are marked with an "outside trip" badge and dimmed, but their native totals are still shown for reference.

### ALL ENTRIES
A full chronological list of every entry, grouped by day. Each day header is tappable to collapse or expand that day's entries. The day header shows the weekday, date, and daily total (active entries only), and is marked "outside trip" when Trip Dates are set and the day falls outside the range. Each entry row shows the time, category dot, description, and native amount. Ghost entries appear dimmed with a strikethrough amount and a 👻 icon.

All three sections are collapsible — tap the section title to toggle.

---

## Widgets

### Large widget — ExpenseDashboard

Shows at a glance:
- Trip name (if set) in place of "✈️ Vacation Expenses", plus today's date
- TODAY / AVG/DAY / OVERALL totals (always in Adaptive mode)
- Exchange rate note for both EUR and the current third currency
- Category breakdown with mini bar charts (TODAY, AVG/DAY, TOTAL columns)
- Today's entries list with native amounts

Tap anywhere to open the full dashboard. The trip description is intentionally **not** shown here — it's only ever available on demand from the main dashboard, since the widget has no interactive popup beyond the tap-to-open action.

### Small widget — ExpenseQuickLog

Shows:
- Today's total in the dominant currency, with a CHF equivalent inline if the dominant currency is not CHF
- Entry count for today

Tap anywhere to open the log form directly.

---

## Data format

`expenses.json` is a plain JSON array stored on disk. Each entry:

```json
{
  "date": "2026-03-31",
  "time": "13:45",
  "category": "🍽️ Food",
  "amount": 24.50,
  "currency": "CHF",
  "description": "Lunch at the harbour",
  "lat": 46.204391,
  "lon": 6.143158,
  "ghost": true
}
```

`lat` and `lon` are omitted when location is unavailable. `ghost` is omitted when the entry is active (not excluded).

`expense_settings.json`:

```json
{
  "chfToEur": 1.09,
  "chfToCur3": 1.13,
  "cur3Code": "GBP",
  "cur3Symbol": "£",
  "cur3Flag": "🇬🇧",
  "cur3Name": "British Pound",
  "displayMode": "ADAPTIVE",
  "defaultCurrency": "CHF",
  "tripStart": "2026-06-01",
  "tripEnd": "2026-06-15",
  "tripName": "Rome getaway",
  "tripDescription": "Anniversary trip, staying near Trastevere"
}
```

`tripStart`, `tripEnd`, `tripName`, and `tripDescription` are all optional and default to an empty string. An empty `tripStart`/`tripEnd` pair means the AVG/DAY calculation falls back to automatic gap-fill detection (see [Trip Dates](#trip-dates-for-accurate-avgday)). An empty `tripName`/`tripDescription` means the default "✈️ Vacation Expenses" title is shown everywhere.

JSON export files use a wrapper format so that the full trip context travels with the backup:

```json
{
  "meta": {
    "exportDate": "2026-08-08",
    "appVersion": "5.10",
    "cur3Code": "GBP",
    "cur3Symbol": "£",
    "cur3Flag": "🇬🇧",
    "cur3Name": "British Pound",
    "chfToCur3": 1.13,
    "chfToEur": 1.09,
    "tripStart": "2026-06-01",
    "tripEnd": "2026-06-15",
    "tripName": "Rome getaway",
    "tripDescription": "Anniversary trip, staying near Trastevere"
  },
  "entries": [ ... ]
}
```

---

## Technical notes

- Built for [Scriptable](https://scriptable.app) on iOS 16+.
- The dashboard is a full-screen WebView (`wv.present(true)`) with a 300ms JavaScript poll loop communicating via a shared `_action` variable.
- Closing is handled via `Promise.race([wv.present(true), runPollLoop()])` — Scriptable's native Close button resolves the present-promise and triggers `Script.complete()` cleanly. **Scriptable cannot programmatically dismiss a presented WebView** — this is a hard platform limitation, not a bug. The Bulk Edit screen uses the same `Promise.race` + persistent poll loop pattern (`runBulkPollLoop`): instead of ending the loop after one applied change, it reloads its own HTML in place with fresh data and keeps listening, so multiple bulk edits can be applied in one sitting without the user needing to close and reopen the screen. A goodbye screen (`buildBulkCloseHTML`) replaces the checklist once there's nothing left to do (Cancel, or all entries deleted), and a permanent header banner reminds the user that a native Close tap is still required to leave.
- All font sizes use `rem` units with `html { font-size: clamp(1rem, 2.2vw, 1.4rem) }` — scales smoothly from iPhone to iPad and respects iOS Dynamic Type.
- Backslash escapes in regex patterns (`\S`, `\d`) are stripped by Scriptable's JS parser when embedded in template literals passed to `wv.loadHTML()`. Use string methods instead: `str.split(" ")[0]` not `/^\S+/.exec(str)[0]`.
- Unicode characters in the U+0080–U+1FFF range inside **comments** cause `SyntaxError: Invalid character` in Scriptable's parser — keep comments ASCII-only. Emoji inside string literals (e.g. category labels, alert titles) are unaffected and safe.
- Only one `<tbody>` per `<table>` — WKWebView silently drops additional tbody elements.
- Negative margins on `overflow-x:auto` containers cause WKWebView to compute zero scroll width. Use `width:max-content; min-width:100%` on the inner table instead.
- `loadData()` guards against iCloud sync races: if the file exists but returns a non-array value (e.g. partially written during sync), it falls back to an empty array rather than crashing.
- `loadSettings()` automatically migrates settings files from the pre-v5.6 format (which used `chfToJpy` as a fixed field) to the new `chfToCur3 / cur3*` fields on first run, without any manual intervention.
- Free-text user input embedded into WebView HTML (trip name and description) is passed through an `escapeHtml()` helper before being written into the page — without this, characters like `<`, `>`, `&`, or quotes in a trip name could break the markup or inject unintended HTML.
- Trip Dates day-counting (`computeCountedPastDates`) never counts today or future days, even when they fall inside an explicit trip range — only days that have actually elapsed count toward AVG/DAY.
