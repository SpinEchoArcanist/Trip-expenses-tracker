# ✈️ Vacation Expense Tracker

A fully self-contained, multi-currency expense tracking system for iOS, built with [Scriptable](https://scriptable.app). No subscription, no server, no account — everything runs on-device and syncs via iCloud Drive.

---

## Features

- **Log expenses in seconds** — two-step native alert: amount + category, then description
- **Multi-currency** — EUR, CHF, and a fully configurable third currency (default: GBP). Adaptive display shows each day's dominant currency with a CHF equivalent sub-note
- **GPS tagging** — location is captured automatically when logging and can be opened in Apple Maps or Google Maps
- **Full dashboard** — scrollable WebView with three collapsible sections: By Category, By Day, All Entries
- **Two home screen widgets** — a large summary widget and a small quick-log widget
- **Edit and delete** — any field of any entry can be edited at any time
- **Bulk edit** — select multiple entries and apply a category, currency, ghost status, date change, or deletion in one action
- **Ghost entries** — exclude any entry from all statistics and averages while keeping it visible in the list (reversible)
- **CSV export** — timestamped export to iCloud Drive, one file per export, never overwrites
- **JSON export / import** — export a full backup including currency metadata; import merges or replaces with duplicate detection and automatic currency mismatch handling
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

### Ghost entries

- A ghost entry remains visible in the **ALL ENTRIES** list but is completely excluded from all totals, averages, and the BY CATEGORY and BY DAY tables.
- Ghost entries appear dimmed with a 👻 icon and a strikethrough amount.
- Ghost status is reversible at any time via the edit screen or bulk edit.
- The ALL ENTRIES section title shows a count of ghost entries (e.g. `ALL ENTRIES (12) — 2 👻`).

### Opening an entry on the map

- Entries logged with GPS show an active **📍** button.
- Tap it to open the location in Apple Maps or Google Maps.

### Changing settings

- Tap **⚙️** in the dashboard action bar.
- **💱 EUR rate** — set the current CHF → EUR conversion rate (1 CHF = ? EUR).
- **🌍 Third currency** — choose from a preset list (GBP, JPY, USD, SEK, CZK, HUF, PLN, NOK, DKK, THB, HKD) or enter a fully custom currency with its own code, symbol, flag emoji, name, and rate. The selected currency becomes the third display mode alongside EUR and CHF.
- **💹 Third currency rate** — update just the exchange rate for the current third currency without changing which currency it is.
- **💶 Default currency for new entries** — CHF, EUR, or the current third currency. Used automatically when logging a new expense.

### Exporting and importing data

- Tap **📤** in the dashboard action bar to open the Export / Import menu.

**📊 Export CSV** — saves a timestamped `.csv` file to iCloud Drive / Scriptable. Each export creates a new file. Columns: Date, Time, Category, Currency, Amount, Amount (CHF), Latitude, Longitude, Description, Ghost.

**📦 Export JSON** — saves a timestamped `.json` file containing all entries plus a `meta` block with the current third-currency configuration (code, symbol, flag, name, and rates). This allows the currency context to travel with the backup file.

**📥 Import JSON** — opens a file picker. Supports both the new `{ meta, entries }` format and the legacy bare-array format. If the imported file's third currency differs from your current settings, you are warned before any data is loaded. Proceeding automatically updates your third-currency settings (code, symbol, flag, name, and rate) to match the file. If you cancel, nothing is imported and nothing changes. After the currency check, you can choose to **Merge** (keep existing entries and add new ones) or **Replace** (clear existing entries first). Duplicate entries (same date + time + description) are skipped automatically.

### Closing the dashboard

- Tap the **Close** button in Scriptable's native toolbar (top of screen). The script exits cleanly.

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

† *Overall dominant currency*: whichever currency has the highest CHF-equivalent total across all active entries in the trip.

CHF is the internal reference currency for all calculations. All amounts are converted to CHF first, then to the display currency, minimising rounding errors.

### EUR / [CUR3] / CHF modes

All values are forced into the selected currency. Sub-notes showing the CHF equivalent are still displayed wherever the display currency is not CHF.

---

## Dashboard sections

### BY CATEGORY
A table showing today's spend, average per day (past days only), and overall total for each category. All values update instantly when you cycle the display mode — no page reload. Ghost entries are excluded from all figures.

### BY DAY
A horizontally scrollable table with one row per day and one column per category, plus a daily total. The Date column is sticky (stays visible while scrolling). Today's row is shown in green, past days in yellow. Dates are formatted as `Thu 02 Apr`. Ghost entries are excluded from all figures.

### ALL ENTRIES
A full chronological list of every entry, grouped by day. Each day header is tappable to collapse or expand that day's entries. The day header shows the weekday, date, and daily total (active entries only). Each entry row shows the time, category dot, description, and native amount. Ghost entries appear dimmed with a strikethrough amount and a 👻 icon.

All three sections are collapsible — tap the section title to toggle.

---

## Widgets

### Large widget — ExpenseDashboard

Shows at a glance:
- TODAY / AVG/DAY / OVERALL totals (always in Adaptive mode)
- Exchange rate note for both EUR and the current third currency
- Category breakdown with mini bar charts (TODAY, AVG/DAY, TOTAL columns)
- Today's entries list with native amounts

Tap anywhere to open the full dashboard.

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
  "defaultCurrency": "CHF"
}
```

JSON export files use a wrapper format so that currency context travels with the backup:

```json
{
  "meta": {
    "exportDate": "2026-05-07",
    "appVersion": "5.7",
    "cur3Code": "GBP",
    "cur3Symbol": "£",
    "cur3Flag": "🇬🇧",
    "cur3Name": "British Pound",
    "chfToCur3": 1.13,
    "chfToEur": 1.09
  },
  "entries": [ ... ]
}
```

---

## Technical notes

- Built for [Scriptable](https://scriptable.app) on iOS 16+.
- The dashboard is a full-screen WebView (`wv.present(true)`) with a 300ms JavaScript poll loop communicating via a shared `_action` variable.
- Closing is handled via `Promise.race([wv.present(true), runPollLoop()])` — Scriptable's native Close button resolves the present-promise and triggers `Script.complete()` cleanly.
- All font sizes use `rem` units with `html { font-size: clamp(1rem, 2.2vw, 1.4rem) }` — scales smoothly from iPhone to iPad and respects iOS Dynamic Type.
- Backslash escapes in regex patterns (`\S`, `\d`) are stripped by Scriptable's JS parser when embedded in template literals passed to `wv.loadHTML()`. Use string methods instead: `str.split(" ")[0]` not `/^\S+/.exec(str)[0]`.
- Only one `<tbody>` per `<table>` — WKWebView silently drops additional tbody elements.
- Negative margins on `overflow-x:auto` containers cause WKWebView to compute zero scroll width. Use `width:max-content; min-width:100%` on the inner table instead.
- `loadData()` guards against iCloud sync races: if the file exists but returns a non-array value (e.g. partially written during sync), it falls back to an empty array rather than crashing.
- `loadSettings()` automatically migrates settings files from the pre-v5.6 format (which used `chfToJpy` as a fixed field) to the new `chfToCur3 / cur3*` fields on first run, without any manual intervention.
