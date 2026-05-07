// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: magic;
// VERSION 5.7 - 2026-05-07
// ===================================================================
//  VACATION EXPENSE TRACKER  -  ExpenseTracker.js
//  + Bulk Edit: WebView multi-select checklist, then apply to selection
//  + Housing category (hotel / BnB)
//  + Ghost Entry: exclude any entry from all stats (reversible)
//  + Scroll position restored after every HTML reload
//  + Fast log: amount + category in one step, currency from settings
//  + Export menu: CSV export + JSON export + JSON import
//  + JSON export: includes meta block with third-currency info
//  + JSON import: detects currency mismatch, warns before overwriting
//  + Bulk delete
//  + Third currency: fully configurable in Settings (default: GBP)
//    Change via Settings UI — no code modification needed.
//  Data stored in: iCloud Drive / Scriptable / expenses.json
//  Settings in:    iCloud Drive / Scriptable / expense_settings.json
// ===================================================================

const CATEGORIES = [
  { label: "🍽️ Food",               color: "#E53935" },
  { label: "🛒 Grocery",            color: "#FB8C00" },
  { label: "🛍️ Shopping",           color: "#7B1FA2" },
  { label: "🚌 Transport",           color: "#2E7D32" },
  { label: "🏛️ Visit / Activities", color: "#1565C0" },
  { label: "🏨 Housing",             color: "#00838F" },
];

// Display modes — CUR3 is a placeholder replaced at runtime with the actual cur3Code
const DISPLAY_MODES = ["ADAPTIVE", "EUR", "CUR3", "CHF"];

const DATA_FILE     = "expenses.json";
const SETTINGS_FILE = "expense_settings.json";
const fm = FileManager.iCloud();
const dataPath     = fm.joinPath(fm.documentsDirectory(), DATA_FILE);
const settingsPath = fm.joinPath(fm.documentsDirectory(), SETTINGS_FILE);

// ==================================================================
//  PRESET THIRD CURRENCIES  (top-level so always available)
// ==================================================================
const CUR3_PRESETS = [
  { code: "GBP", symbol: "\u00A3",  flag: "\uD83C\uDDEC\uD83C\uDDE7", name: "British Pound",    rate: 1.13 },
  { code: "JPY", symbol: "\u00A5",  flag: "\uD83C\uDDEF\uD83C\uDDF5", name: "Japanese Yen",     rate: 175  },
  { code: "USD", symbol: "$",       flag: "\uD83C\uDDFA\uD83C\uDDF8", name: "US Dollar",        rate: 1.12 },
  { code: "SEK", symbol: "kr",      flag: "\uD83C\uDDF8\uD83C\uDDEA", name: "Swedish Krona",    rate: 11.5 },
  { code: "CZK", symbol: "K\u010D", flag: "\uD83C\uDDE8\uD83C\uDDFF", name: "Czech Koruna",     rate: 25.5 },
  { code: "HUF", symbol: "Ft",      flag: "\uD83C\uDDED\uD83C\uDDFA", name: "Hungarian Forint", rate: 400  },
  { code: "PLN", symbol: "z\u0142", flag: "\uD83C\uDDF5\uD83C\uDDF1", name: "Polish Zloty",     rate: 4.6  },
  { code: "NOK", symbol: "kr",      flag: "\uD83C\uDDF3\uD83C\uDDF4", name: "Norwegian Krone",  rate: 11.7 },
  { code: "DKK", symbol: "kr",      flag: "\uD83C\uDDE9\uD83C\uDDF0", name: "Danish Krone",     rate: 7.5  },
  { code: "THB", symbol: "\u0E3F",  flag: "\uD83C\uDDF9\uD83C\uDDED", name: "Thai Baht",        rate: 38   },
  { code: "HKD", symbol: "HK$",     flag: "\uD83C\uDDED\uD83C\uDDF0", name: "Hong Kong Dollar", rate: 8.7  },
  { code: "Custom", symbol: "",     flag: "",                          name: "Custom...",         rate: 1    },
];

// ==================================================================
//  SETTINGS
// ==================================================================
function loadSettings() {
  const defaults = {
    chfToEur:        1.09,
    chfToCur3:       1.13,
    cur3Code:        "GBP",
    cur3Symbol:      "\u00A3",
    cur3Flag:        "\uD83C\uDDEC\uD83C\uDDE7",
    cur3Name:        "British Pound",
    displayMode:     "ADAPTIVE",
    defaultCurrency: "CHF",
  };
  if (!fm.fileExists(settingsPath)) return defaults;
  try {
    fm.downloadFileFromiCloud(settingsPath);
    const s = JSON.parse(fm.readString(settingsPath));
    const merged = Object.assign(defaults, s);
    // Migration: if settings file predates cur3 fields (has chfToJpy but no cur3Code),
    // migrate the old JPY values to cur3 fields and save.
    if (!s.cur3Code && s.chfToJpy) {
      merged.cur3Code   = "JPY";
      merged.cur3Symbol = "\u00A5";
      merged.cur3Flag   = "\uD83C\uDDEF\uD83C\uDDF5";
      merged.cur3Name   = "Japanese Yen";
      merged.chfToCur3  = s.chfToJpy;
      fm.writeString(settingsPath, JSON.stringify(merged, null, 2));
    }
    return merged;
  } catch(_) { return defaults; }
}

function saveSettings(s) {
  fm.writeString(settingsPath, JSON.stringify(s, null, 2));
}

// ==================================================================
//  DATA HELPERS
// ==================================================================
function loadData() {
  if (!fm.fileExists(dataPath)) return [];
  try {
    fm.downloadFileFromiCloud(dataPath);
    const parsed = JSON.parse(fm.readString(dataPath));
    return Array.isArray(parsed) ? parsed : [];
  } catch(e) { return []; }
}

function saveData(entries) {
  fm.writeString(dataPath, JSON.stringify(entries, null, 2));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// CHF is the internal reference currency for all statistics.
// Stored rates: chfToEur (1 CHF = X EUR), chfToCur3 (1 CHF = X cur3)
function toCHF(amount, currency, s) {
  if (currency === "CHF") return amount;
  if (currency === "EUR") return amount / s.chfToEur;
  if (currency === s.cur3Code) return amount / s.chfToCur3;
  return amount;
}

function fromCHF(chfAmount, currency, s) {
  if (currency === "CHF") return chfAmount;
  if (currency === "EUR") return chfAmount * s.chfToEur;
  if (currency === s.cur3Code) return chfAmount * s.chfToCur3;
  return chfAmount;
}

// toEur kept for CSV export only
function toEur(amount, currency, s) {
  const chf = toCHF(amount, currency, s);
  return chf * s.chfToEur;
}

function fmtNative(amount, currency, s) {
  if (currency === "CHF") return "CHF " + amount.toFixed(2);
  if (currency === "EUR") return "\u20AC" + amount.toFixed(2);
  if (s && currency === s.cur3Code) {
    // For currencies typically shown as integers (JPY, HUF, etc.) use round,
    // otherwise 2 decimals. Heuristic: rate > 10 means it is a large-unit currency.
    if (s.chfToCur3 >= 10) return s.cur3Symbol + Math.round(amount);
    return s.cur3Symbol + amount.toFixed(2);
  }
  // Fallback for unknown legacy currency codes stored in entries
  return amount.toFixed(2) + " " + currency;
}

function dominantCurrency(dayEntries, s) {
  let chfSum = 0, eurSum = 0, cur3Sum = 0;
  dayEntries.forEach(e => {
    if (e.ghost) return;
    const cur = e.currency || "CHF";
    if (cur === "CHF") chfSum += e.amount;
    else if (cur === "EUR") eurSum += e.amount;
    else if (cur === s.cur3Code) cur3Sum += e.amount;
  });
  const eurInChf  = eurSum / s.chfToEur;
  const cur3InChf = cur3Sum / s.chfToCur3;
  if (chfSum >= eurInChf && chfSum >= cur3InChf) return "CHF";
  if (eurInChf >= chfSum && eurInChf >= cur3InChf) return "EUR";
  return s.cur3Code;
}

function sumInCurrency(dayEntries, cur, s) {
  let total = 0;
  dayEntries.forEach(e => {
    if (e.ghost) return;
    const eCur = e.currency || "CHF";
    if (eCur === cur) {
      total += e.amount;
    } else {
      const inChf = toCHF(e.amount, eCur, s);
      total += fromCHF(inChf, cur, s);
    }
  });
  return total;
}

function fmtDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ==================================================================
//  LOCATION
// ==================================================================
async function getCurrentLocation() {
  try {
    Location.setAccuracyToHundredMeters();
    const loc = await Promise.race([
      Location.current(),
      new Promise((_, reject) =>
        Timer.schedule(10000, false, () => reject(new Error("timeout")))
      ),
    ]);
    return {
      lat: parseFloat(loc.latitude.toFixed(6)),
      lon: parseFloat(loc.longitude.toFixed(6)),
    };
  } catch(_) {
    return null;
  }
}

// ==================================================================
//  ENTRY POINT
// ==================================================================
const urlParam = args.queryParameters;
if (urlParam && urlParam.action === "log") {
  await logExpense();
}
await showDashboard();
// Script.complete() is called inside showDashboard()

// ==================================================================
//  LOG EXPENSE  —  fast 2-step wizard
// ==================================================================
async function logExpense() {
  const settings = loadSettings();
  const currency = settings.defaultCurrency || "EUR";

  const locationPromise = getCurrentLocation();

  let amount      = null;
  let category    = null;
  let description = null;
  let step        = 1;

  while (step >= 1 && step <= 2) {
    if (step === 1) {
      const a = new Alert();
      a.title   = "💸 New Expense  — " + currency;
      a.message = "Enter amount, then tap a category";
      a.addTextField("0.00", amount !== null ? String(amount) : "");
      CATEGORIES.forEach(c => a.addAction(c.label));
      a.addCancelAction("Cancel");

      const res = await a.presentAlert();
      if (res === -1) return;

      const val = parseFloat(a.textFieldValue(0).replace(",", "."));
      if (isNaN(val) || val <= 0) {
        const err = new Alert();
        err.title = "Invalid amount";
        err.message = "Please enter a number greater than 0.";
        err.addAction("OK");
        await err.presentAlert();
        continue;
      }

      amount   = val;
      category = CATEGORIES[res].label;
      step     = 2;

    } else if (step === 2) {
      const a = new Alert();
      a.title   = "📝 Description";
      a.message = category + "  •  " + amount.toFixed(2) + " " + currency;
      a.addTextField("e.g. Lunch at the port", description || "");
      a.addAction("Save ✓");
      a.addAction("← Back");
      a.addCancelAction("Cancel");

      const res = await a.presentAlert();
      if (res === -1) return;
      if (res === 1)  { step = 1; continue; }

      description = a.textFieldValue(0).trim() || "(no description)";
      step = 3;
    }
  }

  if (step < 3) return;

  const loc = await locationPromise;

  const now  = new Date();
  const time = String(now.getHours()).padStart(2,"0") + ":" + String(now.getMinutes()).padStart(2,"0");
  const entries = loadData();
  const entry   = { date: todayStr(), time, category, amount, currency, description };
  if (loc) { entry.lat = loc.lat; entry.lon = loc.lon; }
  entries.push(entry);
  saveData(entries);

  const locStr = loc ? "📍 " + loc.lat + ", " + loc.lon : "📍 Location unavailable";
  const done = new Alert();
  done.title   = "✅ Saved!";
  done.message = time + "  •  " + category + "\n" + fmtNative(amount, currency, settings) + "  -  " + description + "\n" + locStr;
  done.addAction("Done");
  await done.presentAlert();
}

// ==================================================================
//  SETTINGS UI
// ==================================================================

async function showSettings() {
  const s = loadSettings();

  while (true) {
    const cur3Label = s.cur3Flag + " " + s.cur3Code + " (" + s.cur3Name + ")";
    const a = new Alert();
    a.title   = "⚙️ Settings";
    a.message =
      "EUR rate: 1 CHF = " + s.chfToEur + " EUR\n" +
      "Third currency: " + cur3Label + "\n" +
      "Third rate: 1 CHF = " + s.chfToCur3 + " " + s.cur3Code + "\n" +
      "Default currency: " + s.defaultCurrency;
    a.addAction("💱 EUR rate  (now: 1 CHF = " + s.chfToEur + " EUR)");
    a.addAction("🌍 Third currency  (now: " + cur3Label + ")");
    a.addAction("💹 Third currency rate  (now: 1 CHF = " + s.chfToCur3 + " " + s.cur3Code + ")");
    a.addAction("💶 Default currency for new entries  (now: " + s.defaultCurrency + ")");
    a.addCancelAction("← Done");

    const choice = await a.presentAlert();
    if (choice === -1) return;

    if (choice === 0) {
      // EUR rate
      const r = new Alert();
      r.title   = "💱 EUR Rate";
      r.message = "Enter: 1 CHF = ? EUR";
      r.addTextField("e.g. 1.09", String(s.chfToEur));
      r.addAction("Save ✓");
      r.addCancelAction("← Back");
      if (await r.presentAlert() === -1) continue;
      const val = parseFloat(r.textFieldValue(0).replace(",", "."));
      if (isNaN(val) || val <= 0) {
        const err = new Alert(); err.title = "Invalid rate"; err.addAction("OK");
        await err.presentAlert(); continue;
      }
      s.chfToEur = parseFloat(val.toFixed(4));
      saveSettings(s);

    } else if (choice === 1) {
      // Third currency picker
      const p = new Alert();
      p.title   = "🌍 Third Currency";
      p.message = "Choose a preset or enter custom values";
      CUR3_PRESETS.forEach(c => {
        if (c.code === "Custom") {
          p.addAction("✏️ Custom");
        } else {
          p.addAction(c.flag + " " + c.code + " — " + c.name);
        }
      });
      p.addCancelAction("← Back");
      const presetRes = await p.presentAlert();
      if (presetRes === -1) continue;

      const preset = CUR3_PRESETS[presetRes];
      if (preset.code === "Custom") {
        // Custom: ask for code, symbol, flag, name, rate one by one
        const c1 = new Alert();
        c1.title   = "✏️ Currency code";
        c1.message = "E.g. GBP, HKD, THB";
        c1.addTextField("Code", s.cur3Code);
        c1.addAction("Next →");
        c1.addCancelAction("← Back");
        if (await c1.presentAlert() === -1) continue;
        const newCode = c1.textFieldValue(0).trim().toUpperCase();
        if (!newCode) continue;

        const c2 = new Alert();
        c2.title   = "✏️ Currency symbol";
        c2.message = "E.g. £, $, ฿, HK$";
        c2.addTextField("Symbol", s.cur3Symbol);
        c2.addAction("Next →");
        c2.addCancelAction("← Back");
        if (await c2.presentAlert() === -1) continue;
        const newSymbol = c2.textFieldValue(0).trim();

        const c3 = new Alert();
        c3.title   = "✏️ Currency flag emoji";
        c3.message = "E.g. 🇬🇧, 🇺🇸, 🇹🇭 (optional, tap Next to skip)";
        c3.addTextField("Flag emoji", s.cur3Flag);
        c3.addAction("Next →");
        c3.addCancelAction("← Back");
        if (await c3.presentAlert() === -1) continue;
        const newFlag = c3.textFieldValue(0).trim();

        const c4 = new Alert();
        c4.title   = "✏️ Currency name";
        c4.message = "E.g. British Pound";
        c4.addTextField("Name", s.cur3Name);
        c4.addAction("Next →");
        c4.addCancelAction("← Back");
        if (await c4.presentAlert() === -1) continue;
        const newName = c4.textFieldValue(0).trim() || newCode;

        const c5 = new Alert();
        c5.title   = "✏️ Exchange rate";
        c5.message = "Enter: 1 CHF = ? " + newCode;
        c5.addTextField("Rate", String(s.chfToCur3));
        c5.addAction("Save ✓");
        c5.addCancelAction("← Back");
        if (await c5.presentAlert() === -1) continue;
        const newRate = parseFloat(c5.textFieldValue(0).replace(",", "."));
        if (isNaN(newRate) || newRate <= 0) {
          const err = new Alert(); err.title = "Invalid rate"; err.addAction("OK");
          await err.presentAlert(); continue;
        }

        s.cur3Code   = newCode;
        s.cur3Symbol = newSymbol || newCode;
        s.cur3Flag   = newFlag;
        s.cur3Name   = newName;
        s.chfToCur3  = parseFloat(newRate.toFixed(4));
        // Update default currency if it was the old cur3
        if (s.defaultCurrency !== "CHF" && s.defaultCurrency !== "EUR") {
          s.defaultCurrency = newCode;
        }
        saveSettings(s);

      } else {
        // Preset chosen — apply code/symbol/flag/name and preset rate as default
        // Ask to confirm rate (user may want to update it)
        const rateAlert = new Alert();
        rateAlert.title   = preset.flag + " " + preset.code + " Rate";
        rateAlert.message = "Enter: 1 CHF = ? " + preset.code + "\n(preset default: " + preset.rate + ")";
        rateAlert.addTextField("Rate", String(preset.rate));
        rateAlert.addAction("Save ✓");
        rateAlert.addCancelAction("← Back");
        if (await rateAlert.presentAlert() === -1) continue;
        const rateVal = parseFloat(rateAlert.textFieldValue(0).replace(",", "."));
        if (isNaN(rateVal) || rateVal <= 0) {
          const err = new Alert(); err.title = "Invalid rate"; err.addAction("OK");
          await err.presentAlert(); continue;
        }
        const oldCode = s.cur3Code;
        s.cur3Code   = preset.code;
        s.cur3Symbol = preset.symbol;
        s.cur3Flag   = preset.flag;
        s.cur3Name   = preset.name;
        s.chfToCur3  = parseFloat(rateVal.toFixed(4));
        // Update default currency if it was pointing at the old cur3
        if (s.defaultCurrency === oldCode) {
          s.defaultCurrency = preset.code;
        }
        saveSettings(s);
      }

    } else if (choice === 2) {
      // Third currency rate only
      const r = new Alert();
      r.title   = s.cur3Flag + " " + s.cur3Code + " Rate";
      r.message = "Enter: 1 CHF = ? " + s.cur3Code;
      r.addTextField("Rate", String(s.chfToCur3));
      r.addAction("Save ✓");
      r.addCancelAction("← Back");
      if (await r.presentAlert() === -1) continue;
      const val = parseFloat(r.textFieldValue(0).replace(",", "."));
      if (isNaN(val) || val <= 0) {
        const err = new Alert(); err.title = "Invalid rate"; err.addAction("OK");
        await err.presentAlert(); continue;
      }
      s.chfToCur3 = parseFloat(val.toFixed(4));
      saveSettings(s);

    } else if (choice === 3) {
      // Default currency
      const t = new Alert();
      t.title   = "💶 Default currency for new entries";
      t.message = "Used automatically when logging a new expense.";
      t.addAction("🇨🇭 CHF");
      t.addAction("🇪🇺 EUR");
      t.addAction(s.cur3Flag + " " + s.cur3Code);
      t.addCancelAction("← Back");
      const res = await t.presentAlert();
      if (res === -1) continue;
      s.defaultCurrency = res === 2 ? s.cur3Code : res === 1 ? "EUR" : "CHF";
      saveSettings(s);
    }
  }
}

// ==================================================================
//  DASHBOARD  —  poll loop + Promise.race for clean exit
// ==================================================================
async function showDashboard() {
  const settings = loadSettings();
  const wv = new WebView();
  await wv.loadHTML(buildDashboardHTML(settings));

  await Promise.race([
    wv.present(true),
    runPollLoop(wv, settings),
  ]);
  Script.complete();
}

async function runPollLoop(wv, settings) {
  // Build valid display modes dynamically using cur3Code
  const validModes = ["ADAPTIVE", "EUR", settings.cur3Code, "CHF"];

  while (true) {
    await new Promise(r => Timer.schedule(300, false, r));

    let action;
    try {
      action = await wv.evaluateJavaScript("typeof _action !== 'undefined' ? _action : null");
    } catch(_) { return; }

    if (action === null || action === "null" || action === undefined) continue;

    try { await wv.evaluateJavaScript("_action = null"); } catch(_) { return; }

    if (typeof action === "string" && action.startsWith("setMode:")) {
      const newMode = action.split(":")[1];
      if (validModes.includes(newMode)) {
        settings.displayMode = newMode;
        saveSettings(settings);
      }
      continue;
    }

    // Capture scroll position BEFORE any reload
    let scrollY = 0;
    try {
      scrollY = await wv.evaluateJavaScript("window.scrollY || 0");
    } catch(_) {}

    if (action === "log") {
      await logExpense();
    } else if (action === "exportMenu") {
      await showExportMenu();
    } else if (action === "export") {
      await exportCSV();
    } else if (action === "settings") {
      await showSettings();
      Object.assign(settings, loadSettings());
    } else if (action === "bulkEdit") {
      await bulkEditEntries();
    } else if (typeof action === "string" && action.startsWith("editIdx:")) {
      const idx = parseInt(action.split(":")[1], 10);
      const entries = loadData();
      if (!isNaN(idx) && idx >= 0 && idx < entries.length) {
        await editEntry(entries, idx, settings);
      }
    } else if (typeof action === "string" && action.startsWith("mapIdx:")) {
      const idx = parseInt(action.split(":")[1], 10);
      const entries = loadData();
      if (!isNaN(idx) && idx >= 0 && idx < entries.length) {
        const e = entries[idx];
        if (e.lat != null && e.lon != null) {
          const label     = encodeURIComponent(e.description || "Expense");
          const appleUrl  = "maps://?ll=" + e.lat + "," + e.lon + "&q=" + label;
          const googleUrl = "https://www.google.com/maps/search/?api=1&query=" + e.lat + "," + e.lon;
          const pick = new Alert();
          pick.title   = "📍 Open in Maps";
          pick.message = e.lat + ", " + e.lon + "\n" + e.description;
          pick.addAction("Apple Maps");
          pick.addAction("Google Maps");
          pick.addCancelAction("Cancel");
          const choice = await pick.presentAlert();
          if (choice === 0) Safari.open(appleUrl);
          else if (choice === 1) Safari.open(googleUrl);
        }
      }
    }

    // Reload HTML then restore scroll position
    try {
      Object.assign(settings, loadSettings());
      await wv.loadHTML(buildDashboardHTML(settings));
      if (scrollY > 0) {
        await new Promise(r => Timer.schedule(80, false, r));
        try {
          await wv.evaluateJavaScript("window.scrollTo(0, " + scrollY + ")");
        } catch(_) {}
      }
    } catch(_) { return; }
  }
}

// ==================================================================
//  BUILD DASHBOARD HTML
// ==================================================================
function buildDashboardHTML(settings) {
  const chfToEur    = settings.chfToEur;
  const chfToCur3   = settings.chfToCur3 || 175;
  const cur3Code    = settings.cur3Code   || "JPY";
  const cur3Symbol  = settings.cur3Symbol || "\u00A5";
  const cur3Flag    = settings.cur3Flag   || "\uD83C\uDDEF\uD83C\uDDF5";
  const cur3Name    = settings.cur3Name   || "Japanese Yen";
  const cur3IsInt   = chfToCur3 >= 10; // display as integer if large-unit currency
  const initialMode = settings.displayMode || "ADAPTIVE";

  // Resolve stored "CUR3" placeholder to actual cur3Code for backward compat
  const resolvedMode = (initialMode === "CUR3") ? cur3Code : initialMode;

  const allEntries = loadData();
  const today      = todayStr();

  const activeEntries = allEntries.filter(e => !e.ghost);
  const todayEntries  = activeEntries.filter(e => e.date === today);
  const pastEntries   = activeEntries.filter(e => e.date !== today);
  const nPastDays     = [...new Set(pastEntries.map(e => e.date))].length;

  const CAT_COLORS = {};
  const CAT_SHORT  = {};
  CATEGORIES.forEach(c => {
    CAT_COLORS[c.label] = c.color;
    CAT_SHORT[c.label]  = c.label.split(" ").slice(1).join(" ");
  });

  const byDayEntries = {};
  allEntries.forEach(e => {
    if (!byDayEntries[e.date]) byDayEntries[e.date] = [];
    byDayEntries[e.date].push(e);
  });
  const sortedDays = Object.keys(byDayEntries).sort().reverse();

  const activeByDay = {};
  activeEntries.forEach(e => {
    if (!activeByDay[e.date]) activeByDay[e.date] = [];
    activeByDay[e.date].push(e);
  });
  const activeSortedDays = Object.keys(activeByDay).sort().reverse();

  // Static entry rows
  let entryRowsHtml = "";
  if (allEntries.length === 0) {
    entryRowsHtml = "<tr><td colspan=\"5\" class=\"dim\" style=\"text-align:center;padding:16px\">No entries yet</td></tr>";
  } else {
    sortedDays.forEach(d => {
      const isToday  = d === today;
      const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      const weekday = DAYS[new Date(d + "T12:00:00").getDay()];
      const dayLabel = isToday
        ? "<strong>" + weekday + " " + fmtDate(d) + "</strong> <span class=\"badge\">today</span>"
        : weekday + " " + fmtDate(d);
      const dayId  = "dh_" + d.replace(/-/g, "");
      const dayKey = d.replace(/-/g, "");
      entryRowsHtml +=
        "<tr class=\"day-header-row\" onclick=\"toggleDay('" + dayKey + "')\">" +
        "<td colspan=\"4\">" + dayLabel + "</td>" +
        "<td id=\"" + dayId + "tot\" class=\"" + (isToday ? "green" : "yellow") + " right\">…" +
        "<span id=\"" + dayId + "chev\" style=\"margin-left:6px;font-size:0.667rem;color:#8FA3B0\">&#9660;</span></td>" +
        "</tr>";
      [...byDayEntries[d]].reverse().forEach(e => {
        const originalIdx = allEntries.indexOf(e);
        const isGhost = !!e.ghost;
        const color   = CAT_COLORS[e.category] || "#888";
        const cur     = e.currency || "EUR";
        const hasLoc  = e.lat != null && e.lon != null;
        const mapBtn  = hasLoc
          ? "<button class=\"icon-btn" + (isGhost ? " ghost-btn" : "") + "\" onclick=\"event.stopPropagation();done('mapIdx:" + originalIdx + "')\">📍</button>"
          : "<button class=\"icon-btn map-disabled\" disabled>📍</button>";
        if (isGhost) {
          entryRowsHtml +=
            "<tr class=\"day-row day-row-" + dayKey + " ghost-row\">" +
            "<td class=\"dim time-col\">" + e.time + "</td>" +
            "<td class=\"ghost-desc\"><span class=\"ghost-icon\">👻</span>" + e.description + "</td>" +
            "<td class=\"ghost-amount right\">" + fmtNative(e.amount, cur, settings) + "</td>" +
            "<td class=\"icon-col\">" + mapBtn + "</td>" +
            "<td class=\"icon-col\"><button class=\"icon-btn\" onclick=\"event.stopPropagation();done('editIdx:" + originalIdx + "')\">✏️</button></td>" +
            "</tr>";
        } else {
          entryRowsHtml +=
            "<tr class=\"day-row day-row-" + dayKey + "\">" +
            "<td class=\"dim time-col\">" + e.time + "</td>" +
            "<td><span class=\"dot\" style=\"background:" + color + "\"></span>" + e.description + "</td>" +
            "<td class=\"yellow right\">" + fmtNative(e.amount, cur, settings) + "</td>" +
            "<td class=\"icon-col\">" + mapBtn + "</td>" +
            "<td class=\"icon-col\"><button class=\"icon-btn\" onclick=\"event.stopPropagation();done('editIdx:" + originalIdx + "')\">✏️</button></td>" +
            "</tr>";
        }
      });
    });
  }

  const overallDomCur = dominantCurrency(activeEntries, settings);

  const embeddedData = JSON.stringify({
    chfToEur,
    chfToCur3,
    cur3Code,
    cur3Symbol,
    cur3Flag,
    cur3Name,
    cur3IsInt,
    overallDomCur,
    initialMode:  resolvedMode,
    today,
    nPastDays,
    days: activeSortedDays.map(d => {
      const dayEnts = activeByDay[d];
      const domCur  = dominantCurrency(dayEnts, settings);
      const catChf  = {};
      CATEGORIES.forEach(c => { catChf[c.label] = 0; });
      dayEnts.forEach(e => {
        if (catChf[e.category] !== undefined)
          catChf[e.category] += toCHF(e.amount, e.currency || "CHF", settings);
      });
      return {
        date:        d,
        isToday:     d === today,
        domCur,
        nativeTotal: sumInCurrency(dayEnts, domCur, settings),
        entries:     dayEnts.map(e => ({ amount: e.amount, currency: e.currency || "CHF" })),
        catChf,
      };
    }),
    categories: CATEGORIES.map(c => {
      const dailyChf   = todayEntries.filter(e => e.category === c.label)
        .reduce((s, e) => s + toCHF(e.amount, e.currency || "CHF", settings), 0);
      const pastChf    = pastEntries.filter(e => e.category === c.label)
        .reduce((s, e) => s + toCHF(e.amount, e.currency || "CHF", settings), 0);
      const overallChf = activeEntries.filter(e => e.category === c.label)
        .reduce((s, e) => s + toCHF(e.amount, e.currency || "CHF", settings), 0);
      return { label: c.label, short: CAT_SHORT[c.label] || c.label, color: c.color, dailyChf, pastChf, overallChf };
    }),
    totalAllChf:   activeEntries.reduce((s, e) => s + toCHF(e.amount, e.currency || "CHF", settings), 0),
    totalTodayChf: todayEntries.reduce((s, e) => s + toCHF(e.amount, e.currency || "CHF", settings), 0),
    pastTotalChf:  pastEntries.reduce((s, e) => s + toCHF(e.amount, e.currency || "CHF", settings), 0),
    prevDomCur: (activeSortedDays.length > 0 && activeSortedDays[0] !== today && activeByDay[activeSortedDays[0]])
      ? dominantCurrency(activeByDay[activeSortedDays[0]], settings)
      : (activeSortedDays.length > 1 && activeByDay[activeSortedDays[1]])
        ? dominantCurrency(activeByDay[activeSortedDays[1]], settings)
        : "CHF",
    dayActiveTotals: (() => {
      const m = {};
      activeSortedDays.forEach(d => {
        const dayEnts = activeByDay[d];
        const domCur  = dominantCurrency(dayEnts, settings);
        m[d] = { cur: domCur, total: sumInCurrency(dayEnts, domCur, settings) };
      });
      return m;
    })(),
  });

  // Mode labels built from cur3 info — passed into the WebView as JSON
  const modeLabelMap = JSON.stringify({
    ADAPTIVE: "\uD83D\uDCB6 Adaptive",
    EUR:      "\uD83C\uDDEA\uD83C\uDDFA EUR",
    CHF:      "\uD83C\uDDE8\uD83C\uDDED CHF",
  });
  // cur3 mode label built separately (flag + code), injected via template
  const cur3ModeLabel = cur3Flag + " " + cur3Code;
  // Valid mode list for JS — use actual cur3Code as the mode string
  const modesJson = JSON.stringify(["ADAPTIVE", "EUR", cur3Code, "CHF"]);

  return "<!DOCTYPE html>\n<html>\n<head>\n" +
"<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, maximum-scale=1\">\n" +
"<style>\n" +
"  * { box-sizing: border-box; margin: 0; padding: 0; }\n" +
"  html { width: 100%; font-size: clamp(1rem, 2.2vw, 1.4rem); }\n" +
"  body { width: 100%; font-family: -apple-system, sans-serif; background: #0F1923; color: #fff; padding: 0 0 32px 0; font-size: 1rem; }\n" +
"  .header { position: sticky; top: 0; background: #0F1923; padding: 14px 16px 10px; border-bottom: 1px solid rgba(255,255,255,0.08); z-index: 10; display: flex; align-items: center; justify-content: space-between; }\n" +
"  .header-title { font-size: 1.067rem; font-weight: 700; color: #8FA3B0; }\n" +
"  .header-date  { font-size: 0.8rem; color: #8FA3B0; margin-top: 2px; }\n" +
"  .mode-btn { background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.15); border-radius: 10px; color: #FFD166; font-size: 0.8rem; font-weight: 700; padding: 5px 10px; white-space: nowrap; }\n" +
"  .mode-btn:active { background: rgba(255,209,102,0.25); }\n" +
"  .totals { display: flex; gap: 0; padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.08); }\n" +
"  .total-block { flex: 1; text-align: center; padding: 0 8px; }\n" +
"  .total-block + .total-block { border-left: 1px solid rgba(255,255,255,0.12); }\n" +
"  .total-label { font-size: 0.667rem; font-weight: 700; color: #8FA3B0; letter-spacing: 0.5px; margin-bottom: 4px; }\n" +
"  .total-value { font-size: 1.267rem; font-weight: 800; line-height: 1.3; }\n" +
"  .rate-note { font-size: 0.667rem; color: rgba(143,163,176,0.7); text-align: center; padding: 6px 16px 0; }\n" +
"  .section { padding: 16px 16px 0; }\n" +
"  .section-title { font-size: 0.867rem; font-weight: 800; color: #C8D8E4; letter-spacing: 0.6px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none; padding: 4px 0; }\n" +
"  .section-title:active { opacity: 0.7; }\n" +
"  .section-chevron { font-size: 0.733rem; color: #8FA3B0; display: inline-block; }\n" +
"  .section-body.collapsed { display: none; }\n" +
"  table { width: 100%; border-collapse: collapse; }\n" +
"  td, th { padding: 9px 6px; font-size: 0.933rem; vertical-align: middle; }\n" +
"  tr, thead tr { border-bottom: 1px solid rgba(255,255,255,0.05); }\n" +
"  tr:last-child { border-bottom: none; }\n" +
"  .today-row td { background: rgba(6,214,160,0.06); }\n" +
"  .day-header-row td { background: rgba(255,255,255,0.04); font-size: 0.8rem; font-weight: 700; color: #8FA3B0; padding-top: 12px; padding-bottom: 6px; border-top: 1px solid rgba(255,255,255,0.1); cursor: pointer; user-select: none; }\n" +
"  .day-header-row:first-child td { border-top: none; }\n" +
"  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 7px; }\n" +
"  .green  { color: #06D6A0; font-weight: 700; text-align: right; }\n" +
"  .purple { color: #A78BFA; font-weight: 700; text-align: right; }\n" +
"  .yellow { color: #FFD166; font-weight: 700; text-align: right; }\n" +
"  .right  { text-align: right; }\n" +
"  .dim    { color: #8FA3B0; }\n" +
"  .time-col { width: 44px; color: #8FA3B0; font-size: 0.867rem; }\n" +
"  .icon-col { width: 32px; text-align: center; padding: 4px 2px; }\n" +
"  .icon-btn { background: rgba(255,255,255,0.07); border: none; border-radius: 7px; color: #fff; font-size: 0.933rem; padding: 4px 6px; line-height: 1; cursor: pointer; }\n" +
"  .icon-btn:active { background: rgba(255,209,102,0.25); }\n" +
"  .map-disabled { opacity: 0.22; cursor: default; }\n" +
"  .bar-bg { background: rgba(255,255,255,0.08); border-radius: 3px; height: 5px; width: 60px; overflow: hidden; }\n" +
"  .bar-fill { height: 100%; border-radius: 3px; }\n" +
"  .badge { background: rgba(6,214,160,0.2); color: #06D6A0; font-size: 0.667rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-left: 6px; vertical-align: middle; }\n" +
"  .col-header { font-size: 0.667rem; font-weight: 700; letter-spacing: 0.4px; padding-bottom: 4px !important; border-bottom: 1px solid rgba(255,255,255,0.1) !important; }\n" +
"  .col-header.green  { color: #06D6A0; }\n" +
"  .col-header.purple { color: #A78BFA; }\n" +
"  .col-header.yellow { color: #FFD166; }\n" +
"  .col-header.dim    { color: #8FA3B0; }\n" +
"  .day-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 4px; }\n" +
"  .day-scroll table { border-collapse: collapse; width: max-content; min-width: 100%; }\n" +
"  .day-tbl-date { position: sticky; left: 0; background: #0F1923; z-index: 2; white-space: nowrap; min-width: 6rem; padding: 9px 10px 9px 16px; box-shadow: 3px 0 6px rgba(0,0,0,0.4); }\n" +
"  .today-row .day-tbl-date { background: #0d1f16; }\n" +
"  .day-tbl-cat { min-width: 4.8rem; text-align: right; white-space: nowrap; }\n" +
"  .day-tbl-total { min-width: 4.8rem; text-align: right; white-space: nowrap; padding-left: 6px; border-left: 1px solid rgba(255,255,255,0.1); }\n" +
"  .actions { position: fixed; bottom: 0; left: 0; right: 0; display: flex; background: #0d1820; border-top: 1px solid rgba(255,255,255,0.1); padding: 10px 8px; gap: 6px; }\n" +
"  .btn { flex: 1; background: rgba(255,255,255,0.07); border: none; border-radius: 10px; color: #fff; font-size: 1.067rem; font-weight: 600; padding: 15px 4px; text-align: center; }\n" +
"  .btn:active { background: rgba(255,255,255,0.15); }\n" +
"  .btn.primary { background: rgba(255,209,102,0.15); color: #FFD166; }\n" +
"  .action-spacer { height: 96px; }\n" +
"  .ghost-row { opacity: 0.42; }\n" +
"  .ghost-row td { background: transparent !important; }\n" +
"  .ghost-icon { font-size: 0.867rem; margin-right: 5px; }\n" +
"  .ghost-desc { color: #8FA3B0; font-style: italic; }\n" +
"  .ghost-amount { color: #8FA3B0 !important; text-decoration: line-through; font-weight: 400 !important; }\n" +
"  .ghost-btn { opacity: 0.55; }\n" +
"</style>\n" +
"</head>\n<body>\n" +
"<div class=\"header\">\n" +
"  <div>\n" +
"    <div class=\"header-title\">\u2708\uFE0F Vacation Expenses</div>\n" +
"    <div class=\"header-date\">" + fmtDate(today) + "</div>\n" +
"  </div>\n" +
"  <button class=\"mode-btn\" id=\"modeBtn\" onclick=\"cycleMode()\">\u2026</button>\n" +
"</div>\n" +
"<div class=\"totals\">\n" +
"  <div class=\"total-block\">\n" +
"    <div class=\"total-label\" id=\"lblToday\">TODAY</div>\n" +
"    <div class=\"total-value\" style=\"color:#06D6A0\" id=\"valToday\">\u2026</div>\n" +
"  </div>\n" +
"  <div class=\"total-block\">\n" +
"    <div class=\"total-label\" id=\"lblAvg\">AVG/DAY</div>\n" +
"    <div class=\"total-value\" style=\"color:#A78BFA\" id=\"valAvg\">\u2026</div>\n" +
"  </div>\n" +
"  <div class=\"total-block\">\n" +
"    <div class=\"total-label\" id=\"lblOverall\">OVERALL</div>\n" +
"    <div class=\"total-value\" style=\"color:#FFD166\" id=\"valOverall\">\u2026</div>\n" +
"  </div>\n" +
"</div>\n" +
"<p class=\"rate-note\" id=\"rateNote\"></p>\n" +
"<div class=\"section\" style=\"margin-top:12px\">\n" +
"  <div class=\"section-title\" onclick=\"toggleSection('cat')\">\n" +
"    <span>BY CATEGORY</span><span class=\"section-chevron\" id=\"chev-cat\">&#9660;</span>\n" +
"  </div>\n" +
"  <div class=\"section-body\" id=\"body-cat\">\n" +
"  <table>\n" +
"    <tr>\n" +
"      <td class=\"col-header dim\">Category</td>\n" +
"      <td class=\"col-header green right\">Today</td>\n" +
"      <td class=\"col-header purple right\">Avg/day</td>\n" +
"      <td class=\"col-header yellow right\">Total</td>\n" +
"      <td class=\"col-header dim\"></td>\n" +
"    </tr>\n" +
"    <tbody id=\"catBody\"></tbody>\n" +
"  </table>\n" +
"  </div>\n" +
"</div>\n" +
"<div class=\"section\" style=\"margin-top:20px\">\n" +
"  <div class=\"section-title\" onclick=\"toggleSection('day')\">\n" +
"    <span>BY DAY</span><span class=\"section-chevron\" id=\"chev-day\">&#9660;</span>\n" +
"  </div>\n" +
"  <div class=\"section-body\" id=\"body-day\">\n" +
"  <div class=\"day-scroll\">\n" +
"  <table id=\"dayTable\">\n" +
"    <tbody id=\"dayBody\"></tbody>\n" +
"  </table>\n" +
"  </div>\n" +
"  </div>\n" +
"</div>\n" +
"<div class=\"section\" style=\"margin-top:20px\">\n" +
"  <div class=\"section-title\" onclick=\"toggleSection('entries')\">\n" +
"    <span id=\"entriesTitle\">ALL ENTRIES</span><span class=\"section-chevron\" id=\"chev-entries\">&#9660;</span>\n" +
"  </div>\n" +
"  <div class=\"section-body\" id=\"body-entries\">\n" +
"  <table>\n" +
"    <tr>\n" +
"      <td class=\"col-header dim\">Time</td>\n" +
"      <td class=\"col-header dim\">Description</td>\n" +
"      <td class=\"col-header yellow right\">Amount</td>\n" +
"      <td class=\"col-header dim\" style=\"text-align:center\">&#128205;</td>\n" +
"      <td class=\"col-header dim\" style=\"text-align:center\">&#9999;&#65039;</td>\n" +
"    </tr>\n" +
"    <tbody id=\"entryBody\">" + entryRowsHtml + "</tbody>\n" +
"  </table>\n" +
"  </div>\n" +
"</div>\n" +
"<div class=\"action-spacer\"></div>\n" +
"<div class=\"actions\">\n" +
"  <button class=\"btn primary\" onclick=\"done('log')\">&#xFF0B; New</button>\n" +
"  <button class=\"btn\" onclick=\"done('bulkEdit')\">&#9999;&#65039; Bulk</button>\n" +
"  <button class=\"btn\" onclick=\"done('settings')\">&#9881;&#65039;</button>\n" +
"  <button class=\"btn\" onclick=\"done('exportMenu')\">&#128228;</button>\n" +
"</div>\n\n" +
"<script>\n" +
"var D = " + embeddedData + ";\n" +
"var MODES = " + modesJson + ";\n" +
"var MODE_LABELS_BASE = " + modeLabelMap + ";\n" +
"MODE_LABELS_BASE[D.cur3Code] = D.cur3Flag + ' ' + D.cur3Code;\n" +
"var _action = null;\n" +
"var currentMode = D.initialMode;\n" +
"\n" +
"function done(a) { _action = a; }\n" +
"\n" +
"function fmtIn(amount, cur) {\n" +
"  if (cur === 'CHF') return 'CHF ' + amount.toFixed(2);\n" +
"  if (cur === 'EUR') return '\u20AC' + amount.toFixed(2);\n" +
"  if (cur === D.cur3Code) return D.cur3IsInt ? D.cur3Symbol + Math.round(amount) : D.cur3Symbol + amount.toFixed(2);\n" +
"  return amount.toFixed(2) + ' ' + cur;\n" +
"}\n" +
"\n" +
"function fromChf(chfAmount, cur) {\n" +
"  if (cur === 'CHF') return chfAmount;\n" +
"  if (cur === 'EUR') return chfAmount * D.chfToEur;\n" +
"  if (cur === D.cur3Code) return chfAmount * D.chfToCur3;\n" +
"  return chfAmount;\n" +
"}\n" +
"\n" +
"function toChf(amount, cur) {\n" +
"  if (cur === 'CHF') return amount;\n" +
"  if (cur === 'EUR') return amount / D.chfToEur;\n" +
"  if (cur === D.cur3Code) return amount / D.chfToCur3;\n" +
"  return amount;\n" +
"}\n" +
"\n" +
"function fmtSub(chfAmount) {\n" +
"  return '= CHF ' + chfAmount.toFixed(2);\n" +
"}\n" +
"\n" +
"function nativeSumForDay(dayEntries, cur) {\n" +
"  var total = 0;\n" +
"  dayEntries.forEach(function(e) {\n" +
"    var eCur = e.currency || 'CHF';\n" +
"    if (eCur === cur) { total += e.amount; }\n" +
"    else { total += fromChf(toChf(e.amount, eCur), cur); }\n" +
"  });\n" +
"  return total;\n" +
"}\n" +
"\n" +
"function sumInCur(chfAmount, cur) { return fromChf(chfAmount, cur); }\n" +
"\n" +
"function fmtDate(iso) {\n" +
"  var p = iso.split('-');\n" +
"  return p[2] + '/' + p[1] + '/' + p[0];\n" +
"}\n" +
"\n" +
"function render() {\n" +
"  var mode       = currentMode;\n" +
"  var fixedCur   = (mode === 'EUR') ? 'EUR' : (mode === 'CHF') ? 'CHF' : (mode === D.cur3Code) ? D.cur3Code : null;\n" +
"  var avgCur     = fixedCur || D.overallDomCur;\n" +
"  var overallCur = fixedCur || D.overallDomCur;\n" +
"\n" +
"  document.getElementById('modeBtn').textContent = MODE_LABELS_BASE[mode] || mode;\n" +
"  document.getElementById('rateNote').textContent =\n" +
"    '1 CHF = ' + D.chfToEur + ' EUR  \u00B7  1 CHF = ' + D.chfToCur3 + ' ' + D.cur3Code + '  \u00B7  ' + (MODE_LABELS_BASE[mode] || mode);\n" +
"\n" +
"  var todayDay  = D.days.length > 0 && D.days[0].isToday ? D.days[0] : null;\n" +
"  var todayCur  = fixedCur || (todayDay ? todayDay.domCur : D.prevDomCur);\n" +
"  var todayChf  = D.totalTodayChf;\n" +
"  var todayNat  = todayDay ? todayDay.nativeTotal : 0;\n" +
"  if (fixedCur) todayNat = fromChf(todayChf, fixedCur);\n" +
"  var todayStr  = fmtIn(todayNat, todayCur);\n" +
"  if (todayChf > 0 && todayCur !== 'CHF') {\n" +
"    todayStr += '<br><span style=\"font-size:0.8rem;color:#8FA3B0\">' + fmtSub(todayChf) + '</span>';\n" +
"  }\n" +
"  document.getElementById('valToday').innerHTML = todayStr;\n" +
"  document.getElementById('lblToday').textContent = 'TODAY';\n" +
"\n" +
"  var avgChf  = D.nPastDays > 0 ? D.pastTotalChf / D.nPastDays : null;\n" +
"  var avgNat  = avgChf !== null ? fromChf(avgChf, avgCur) : null;\n" +
"  var avgStr  = avgNat !== null ? fmtIn(avgNat, avgCur) : '-';\n" +
"  if (avgChf !== null && avgCur !== 'CHF') {\n" +
"    avgStr += '<br><span style=\"font-size:0.8rem;color:#8FA3B0\">' + fmtSub(avgChf) + '</span>';\n" +
"  }\n" +
"  document.getElementById('valAvg').innerHTML = avgStr;\n" +
"  document.getElementById('lblAvg').textContent = 'AVG/DAY (' + avgCur + ')';\n" +
"\n" +
"  var overallChf = D.totalAllChf;\n" +
"  var overallNat = fromChf(overallChf, overallCur);\n" +
"  var overallStr = fmtIn(overallNat, overallCur);\n" +
"  if (overallCur !== 'CHF') {\n" +
"    overallStr += '<br><span style=\"font-size:0.8rem;color:#8FA3B0\">' + fmtSub(overallChf) + '</span>';\n" +
"  }\n" +
"  document.getElementById('valOverall').innerHTML = overallStr;\n" +
"  document.getElementById('lblOverall').textContent = 'OVERALL (' + overallCur + ')';\n" +
"\n" +
"  var catHtml = '';\n" +
"  D.categories.forEach(function(c) {\n" +
"    var tCur     = fixedCur || todayCur;\n" +
"    var todayAmt = sumInCur(c.dailyChf, tCur);\n" +
"    var avgAmt   = D.nPastDays > 0 ? sumInCur(c.pastChf / D.nPastDays, avgCur) : 0;\n" +
"    var totalAmt = sumInCur(c.overallChf, overallCur);\n" +
"    var pct      = D.totalAllChf > 0 ? Math.round(c.overallChf / D.totalAllChf * 100) : 0;\n" +
"    var todayCell = c.dailyChf > 0\n" +
"      ? \"<span class='green' style='display:block;text-align:right'>\" + fmtIn(todayAmt, tCur) + '</span>'\n" +
"      : \"<span class='dim'>-</span>\";\n" +
"    var avgCell = avgAmt > 0\n" +
"      ? \"<span class='purple' style='display:block;text-align:right'>\" + fmtIn(avgAmt, avgCur) + '</span>'\n" +
"      : \"<span class='dim'>-</span>\";\n" +
"    catHtml +=\n" +
"      '<tr>' +\n" +
"      \"<td><span class='dot' style='background:\" + c.color + \"'></span>\" + c.short + '</td>' +\n" +
"      '<td>' + todayCell + '</td>' +\n" +
"      '<td>' + avgCell + '</td>' +\n" +
"      \"<td class='yellow right'>\" + fmtIn(totalAmt, overallCur) + '</td>' +\n" +
"      \"<td><div class='bar-bg'><div class='bar-fill' style='width:\" + pct + \"%;background:\" + c.color + \"'></div></div></td>\" +\n" +
"      '</tr>';\n" +
"  });\n" +
"  document.getElementById('catBody').innerHTML = catHtml;\n" +
"\n" +
"  var headHtml = \"<tr><td class='col-header dim day-tbl-date'></td>\";\n" +
"  D.categories.forEach(function(c) {\n" +
"    headHtml += \"<td class='col-header day-tbl-cat'><span style='color:\" + c.color + \"'>&#9679;</span><span style='font-size:0.933rem'>\" + c.label.split(' ')[0] + '</span></td>';\n" +
"  });\n" +
"  headHtml += \"<td class='col-header yellow day-tbl-total'>Tot.</td></tr>\";\n" +
"\n" +
"  var dayHtml = '';\n" +
"  D.days.forEach(function(d) {\n" +
"    var dCur      = fixedCur || d.domCur;\n" +
"    var dispTotal = fixedCur ? nativeSumForDay(d.entries, dCur) : d.nativeTotal;\n" +
"    var isToday   = d.isToday;\n" +
"    var WDAYS     = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];\n" +
"    var MONTHS    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];\n" +
"    var dp        = d.date.split('-');\n" +
"    var weekday   = WDAYS[new Date(d.date + 'T12:00:00').getDay()];\n" +
"    var shortDate = weekday + ' ' + dp[2] + ' ' + MONTHS[parseInt(dp[1]) - 1];\n" +
"    var label     = isToday ? '<strong>' + shortDate + '</strong>' : shortDate;\n" +
"    var valCls    = isToday ? 'green' : 'yellow';\n" +
"    var row = \"<tr class='\" + (isToday ? 'today-row' : '') + \"'>\";\n" +
"    row += \"<td class='day-tbl-date'>\" + label + '</td>';\n" +
"    D.categories.forEach(function(c) {\n" +
"      var chfAmt  = (d.catChf && d.catChf[c.label]) ? d.catChf[c.label] : 0;\n" +
"      var dispAmt = fromChf(chfAmt, dCur);\n" +
"      row += \"<td class='day-tbl-cat \" + (chfAmt > 0 ? valCls : 'dim') + \"'>\" +\n" +
"        (chfAmt > 0 ? fmtIn(dispAmt, dCur) : '-') + '</td>';\n" +
"    });\n" +
"    row += \"<td class='day-tbl-total \" + valCls + \"'>\" + fmtIn(dispTotal, dCur) + '</td>';\n" +
"    row += '</tr>';\n" +
"    dayHtml += row;\n" +
"    var dayTot = D.dayActiveTotals[d.date];\n" +
"    var el = document.getElementById('dh_' + d.date.replace(/-/g,'') + 'tot');\n" +
"    if (el && dayTot) {\n" +
"      var showCur = fixedCur || dayTot.cur;\n" +
"      var showVal = fixedCur ? fromChf(toChf(dayTot.total, dayTot.cur), fixedCur) : dayTot.total;\n" +
"      el.childNodes[0].textContent = fmtIn(showVal, showCur);\n" +
"      el.className = valCls + ' right';\n" +
"    }\n" +
"  });\n" +
"  document.getElementById('dayBody').innerHTML = headHtml + dayHtml;\n" +
"\n" +
"  var total = " + JSON.stringify(allEntries.length) + ";\n" +
"  var ghostCount = " + JSON.stringify(allEntries.filter(e => !!e.ghost).length) + ";\n" +
"  var titleStr = 'ALL ENTRIES (' + total + ')';\n" +
"  if (ghostCount > 0) titleStr += ' \u2014 ' + ghostCount + ' \uD83D\uDC7B';\n" +
"  document.getElementById('entriesTitle').textContent = titleStr;\n" +
"}\n" +
"\n" +
"function cycleMode() {\n" +
"  var idx = MODES.indexOf(currentMode);\n" +
"  currentMode = MODES[(idx + 1) % MODES.length];\n" +
"  render();\n" +
"  done('setMode:' + currentMode);\n" +
"}\n" +
"\n" +
"var sectionCollapsed = { cat: false, day: false, entries: false };\n" +
"function toggleSection(id) {\n" +
"  sectionCollapsed[id] = !sectionCollapsed[id];\n" +
"  var body = document.getElementById('body-' + id);\n" +
"  var chev = document.getElementById('chev-' + id);\n" +
"  if (!body || !chev) return;\n" +
"  body.classList.toggle('collapsed', sectionCollapsed[id]);\n" +
"  chev.innerHTML = sectionCollapsed[id] ? '&#9654;' : '&#9660;';\n" +
"}\n" +
"\n" +
"var dayCollapsed = {};\n" +
"function toggleDay(dayKey) {\n" +
"  dayCollapsed[dayKey] = !dayCollapsed[dayKey];\n" +
"  var rows = document.querySelectorAll('.day-row-' + dayKey);\n" +
"  var chev = document.getElementById('dh_' + dayKey + 'chev');\n" +
"  var collapsed = dayCollapsed[dayKey];\n" +
"  rows.forEach(function(r) { r.style.display = collapsed ? 'none' : ''; });\n" +
"  if (chev) chev.innerHTML = collapsed ? '&#9654;' : '&#9660;';\n" +
"}\n" +
"\n" +
"render();\n" +
"</script>\n</body>\n</html>";
}

// ==================================================================
//  EDIT ENTRY  —  field picker with back navigation
// ==================================================================
async function editEntry(entries, idx, settings) {
  if (!settings) settings = loadSettings();
  while (true) {
    const entry  = entries[idx];
    if (!entry) return;
    const cur    = entry.currency || "EUR";
    const isGhost = !!entry.ghost;
    const locStr = (entry.lat != null && entry.lon != null)
      ? "📍 " + entry.lat + ", " + entry.lon
      : "📍 No location";
    const ghostStatus = isGhost ? "👻 Excluded from stats" : "Included in stats";

    const action = new Alert();
    action.title   = isGhost ? "✏️ Edit Entry  👻" : "✏️ Edit Entry";
    action.message = fmtDate(entry.date) + "  " + entry.time + "\n" + entry.category + "\n" + fmtNative(entry.amount, cur, settings) + "  -  " + entry.description + "\n" + locStr + "\n" + ghostStatus;
    action.addAction("📅 Date");
    action.addAction("⏰ Time");
    action.addAction("💱 Amount & Currency");
    action.addAction("📂 Category");
    action.addAction("📝 Description");
    action.addAction(isGhost ? "👻 Restore to stats" : "👻 Exclude from stats");
    action.addAction("🗑️ Delete");
    action.addCancelAction("← Done");

    const field = await action.presentAlert();
    if (field === -1) return;

    if (field === 0) {
      const a = new Alert();
      a.title = "📅 New date  (YYYY-MM-DD)";
      a.addTextField("YYYY-MM-DD", entry.date);
      a.addAction("Save ✓");
      a.addCancelAction("← Back");
      if (await a.presentAlert() === -1) continue;
      const val = a.textFieldValue(0).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        const err = new Alert();
        err.title = "Invalid date";
        err.message = "Use YYYY-MM-DD. Example: 2025-07-14";
        err.addAction("OK");
        await err.presentAlert(); continue;
      }
      entries[idx].date = val;

    } else if (field === 1) {
      const a = new Alert();
      a.title = "⏰ New time  (HH:MM)";
      a.addTextField("HH:MM", entry.time);
      a.addAction("Save ✓");
      a.addCancelAction("← Back");
      if (await a.presentAlert() === -1) continue;
      const val = a.textFieldValue(0).trim();
      if (!/^\d{2}:\d{2}$/.test(val)) {
        const err = new Alert();
        err.title = "Invalid time";
        err.message = "Use HH:MM. Example: 14:30";
        err.addAction("OK");
        await err.presentAlert(); continue;
      }
      entries[idx].time = val;

    } else if (field === 2) {
      const aAmt = new Alert();
      aAmt.title = "💶 New amount  (1/2)";
      aAmt.addTextField("Amount", String(entry.amount));
      aAmt.addAction("Next →");
      aAmt.addCancelAction("← Back");
      if (await aAmt.presentAlert() === -1) continue;
      const newAmt = parseFloat(aAmt.textFieldValue(0).replace(",", "."));
      if (isNaN(newAmt) || newAmt <= 0) {
        const err = new Alert(); err.title = "Invalid amount"; err.addAction("OK");
        await err.presentAlert(); continue;
      }
      const aCur = new Alert();
      aCur.title   = "💱 Currency  (2/2)";
      aCur.message = "Amount: " + newAmt.toFixed(2);
      aCur.addAction("\u20AC  Euro (EUR)");
      aCur.addAction("🇨🇭  Swiss Franc (CHF)");
      aCur.addAction(settings.cur3Flag + "  " + settings.cur3Name + " (" + settings.cur3Code + ")");
      aCur.addAction("← Back");
      aCur.addCancelAction("← Back to fields");
      const curRes = await aCur.presentAlert();
      if (curRes === -1 || curRes === 3) continue;
      entries[idx].amount   = newAmt;
      entries[idx].currency = curRes === 2 ? settings.cur3Code : curRes === 1 ? "CHF" : "EUR";

    } else if (field === 3) {
      const a = new Alert();
      a.title   = "📂 New category";
      a.message = "Current: " + entry.category;
      CATEGORIES.forEach(c => a.addAction(c.label));
      a.addCancelAction("← Back");
      const catIdx = await a.presentAlert();
      if (catIdx === -1) continue;
      entries[idx].category = CATEGORIES[catIdx].label;

    } else if (field === 4) {
      const a = new Alert();
      a.title = "📝 New description";
      a.addTextField("Description", entry.description);
      a.addAction("Save ✓");
      a.addCancelAction("← Back");
      if (await a.presentAlert() === -1) continue;
      const newDesc = a.textFieldValue(0).trim();
      if (newDesc) entries[idx].description = newDesc;

    } else if (field === 5) {
      const newGhost = !isGhost;
      const confirm = new Alert();
      confirm.title   = newGhost ? "👻 Exclude from stats?" : "👻 Restore to stats?";
      confirm.message = newGhost
        ? fmtNative(entry.amount, cur, settings) + "  " + entry.description + "\n\nThis entry will be hidden from all totals and averages but will remain visible in the list."
        : fmtNative(entry.amount, cur, settings) + "  " + entry.description + "\n\nThis entry will be included in all totals and averages again.";
      confirm.addAction(newGhost ? "👻 Yes, exclude" : "✅ Yes, restore");
      confirm.addCancelAction("← Back");
      if (await confirm.presentAlert() === -1) continue;
      if (newGhost) { entries[idx].ghost = true; } else { delete entries[idx].ghost; }
      saveData(entries);
      const ack = new Alert();
      ack.title   = newGhost ? "👻 Entry excluded" : "✅ Entry restored";
      ack.message = newGhost
        ? "This entry is now a ghost — it stays in the list but is excluded from all statistics."
        : "This entry is now included in all statistics again.";
      ack.addAction("Done  ✓");
      ack.addAction("✏️ Edit more");
      const next = await ack.presentAlert();
      if (next === 0) return;
      continue;

    } else if (field === 6) {
      const confirm = new Alert();
      confirm.title   = "🗑️ Delete entry?";
      confirm.message = fmtDate(entry.date) + "  " + entry.time + "\n" + entry.category + "\n" + fmtNative(entry.amount, cur, settings) + "  -  " + entry.description;
      confirm.addDestructiveAction("Yes, delete");
      confirm.addCancelAction("← Back");
      if (await confirm.presentAlert() === -1) continue;
      entries.splice(idx, 1);
      saveData(entries);
      const done = new Alert();
      done.title = "🗑️ Entry deleted";
      done.addAction("OK");
      await done.presentAlert();
      return;
    }

    if (field !== 5) {
      saveData(entries);
      const e    = entries[idx];
      const eCur = e.currency || "EUR";
      const done = new Alert();
      done.title   = "✅ Updated!";
      done.message = fmtDate(e.date) + "  " + e.time + "\n" + e.category + "\n" + fmtNative(e.amount, eCur, settings) + "  -  " + e.description;
      done.addAction("Done  ✓");
      done.addAction("✏️ Edit more");
      const next = await done.presentAlert();
      if (next === 0) return;
    }
  }
}

// ==================================================================
//  BULK EDIT
// ==================================================================
async function bulkEditEntries() {
  const entries  = loadData();
  const settings = loadSettings();
  if (entries.length === 0) {
    const a = new Alert(); a.title = "No entries"; a.addAction("OK");
    await a.presentAlert(); return;
  }

  const wv = new WebView();
  await wv.loadHTML(buildBulkHTML(entries));

  let resultField   = null;
  let resultIndices = [];

  await Promise.race([
    wv.present(true),
    (async () => {
      while (true) {
        await new Promise(r => Timer.schedule(300, false, r));
        let act;
        try { act = await wv.evaluateJavaScript("typeof _action !== 'undefined' ? _action : null"); }
        catch(_) { return; }
        if (!act || act === "null") continue;
        try { await wv.evaluateJavaScript("_action = null"); } catch(_) { return; }

        if (act === "bulkClose") return;

        if (typeof act === "string" && act.startsWith("bulkApply:")) {
          const parts   = act.split(":");
          const field   = parts[1];
          const idxList = parts[2] ? parts[2].split(",").map(Number) : [];
          if (idxList.length === 0) {
            const w = new Alert();
            w.title   = "Nothing selected";
            w.message = "Tap the checkboxes next to the entries you want to edit.";
            w.addAction("OK");
            await w.presentAlert();
            continue;
          }
          resultField   = field;
          resultIndices = idxList;
          return;
        }
      }
    })(),
  ]);

  if (!resultField || resultIndices.length === 0) return;

  let applyFn = null;

  if (resultField === "category") {
    const a = new Alert();
    a.title   = "📂 New category";
    a.message = "Apply to " + resultIndices.length + " selected " + (resultIndices.length === 1 ? "entry" : "entries");
    CATEGORIES.forEach(c => a.addAction(c.label));
    a.addCancelAction("Cancel");
    const res = await a.presentAlert();
    if (res === -1) return;
    const newCat = CATEGORIES[res].label;
    applyFn = e => { e.category = newCat; };

  } else if (resultField === "currency") {
    const a = new Alert();
    a.title   = "💱 New currency";
    a.message = "Apply to " + resultIndices.length + " selected " + (resultIndices.length === 1 ? "entry" : "entries") + "\n\nAmounts are NOT converted — only the currency label changes.";
    a.addAction("🇪🇺 EUR");
    a.addAction("🇨🇭 CHF");
    a.addAction(settings.cur3Flag + " " + settings.cur3Code);
    a.addCancelAction("Cancel");
    const res = await a.presentAlert();
    if (res === -1) return;
    const newCur = res === 2 ? settings.cur3Code : res === 1 ? "CHF" : "EUR";
    applyFn = e => { e.currency = newCur; };

  } else if (resultField === "ghost") {
    const a = new Alert();
    a.title   = "👻 Ghost status";
    a.message = "Apply to " + resultIndices.length + " selected " + (resultIndices.length === 1 ? "entry" : "entries");
    a.addAction("👻 Exclude from stats");
    a.addAction("✅ Restore to stats");
    a.addCancelAction("Cancel");
    const res = await a.presentAlert();
    if (res === -1) return;
    const makeGhost = res === 0;
    applyFn = e => { if (makeGhost) e.ghost = true; else delete e.ghost; };

  } else if (resultField === "date") {
    const a = new Alert();
    a.title   = "📅 Move to date  (YYYY-MM-DD)";
    a.message = "Move " + resultIndices.length + " selected " + (resultIndices.length === 1 ? "entry" : "entries") + " to this date";
    a.addTextField("YYYY-MM-DD", entries[resultIndices[0]].date);
    a.addAction("Apply ✓");
    a.addCancelAction("Cancel");
    if (await a.presentAlert() === -1) return;
    const val = a.textFieldValue(0).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      const err = new Alert();
      err.title = "Invalid date"; err.message = "Use YYYY-MM-DD. Example: 2026-07-14";
      err.addAction("OK"); await err.presentAlert(); return;
    }
    applyFn = e => { e.date = val; };

  } else if (resultField === "delete") {
    const previewDel = resultIndices.slice(0, 5).map(i => {
      const e = entries[i];
      return "  " + fmtDate(e.date) + "  " + fmtNative(e.amount, e.currency || "EUR", settings) + "  " + e.description;
    });
    if (resultIndices.length > 5) previewDel.push("  ... and " + (resultIndices.length - 5) + " more");

    const confirmDel = new Alert();
    confirmDel.title   = "🗑️ Delete " + resultIndices.length + " " + (resultIndices.length === 1 ? "entry" : "entries") + "?";
    confirmDel.message = "This cannot be undone:\n\n" + previewDel.join("\n");
    confirmDel.addDestructiveAction("Yes, delete");
    confirmDel.addCancelAction("Cancel");
    if (await confirmDel.presentAlert() === -1) return;

    const sortedDesc = [...resultIndices].sort((a, b) => b - a);
    sortedDesc.forEach(i => entries.splice(i, 1));
    saveData(entries);

    const doneDel = new Alert();
    doneDel.title   = "🗑️ Deleted!";
    doneDel.message = resultIndices.length + " " + (resultIndices.length === 1 ? "entry" : "entries") + " removed.";
    doneDel.addAction("OK");
    await doneDel.presentAlert();
    return;
  }

  if (!applyFn) return;

  const previewLines = resultIndices.slice(0, 5).map(i => {
    const e = entries[i];
    return "  " + fmtDate(e.date) + "  " + fmtNative(e.amount, e.currency || "EUR", settings) + "  " + e.description;
  });
  if (resultIndices.length > 5) previewLines.push("  ... and " + (resultIndices.length - 5) + " more");

  const confirm = new Alert();
  confirm.title   = "✏️ Confirm Bulk Edit";
  confirm.message = resultIndices.length + " " + (resultIndices.length === 1 ? "entry" : "entries") + " will be updated:\n\n" + previewLines.join("\n");
  confirm.addAction("Apply ✓");
  confirm.addCancelAction("Cancel");
  if (await confirm.presentAlert() === -1) return;

  resultIndices.forEach(i => applyFn(entries[i]));
  saveData(entries);

  const done = new Alert();
  done.title   = "✅ Done!";
  done.message = resultIndices.length + " " + (resultIndices.length === 1 ? "entry" : "entries") + " updated.";
  done.addAction("OK");
  await done.presentAlert();
}

// ==================================================================
//  BUILD BULK EDIT HTML
// ==================================================================
function buildBulkHTML(entries) {
  const today = todayStr();
  const CAT_COLORS = {};
  CATEGORIES.forEach(c => { CAT_COLORS[c.label] = c.color; });

  const byDate = {};
  entries.forEach((e, i) => {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push({ e, i });
  });
  const sortedDates = Object.keys(byDate).sort().reverse();

  const WDAYS  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  let rowsHtml = "";
  sortedDates.forEach(d => {
    const dp      = d.split("-");
    const wday    = WDAYS[new Date(d + "T12:00:00").getDay()];
    const mname   = MONTHS[parseInt(dp[1]) - 1];
    const isToday = d === today;
    const dayLabel = wday + " " + dp[2] + " " + mname + (isToday ? " — today" : "");

    rowsHtml += "<div class=\"day-header\">" + dayLabel + "</div>";

    byDate[d].forEach(({ e, i }) => {
      const color    = CAT_COLORS[e.category] || "#888";
      const cur      = e.currency || "EUR";
      const amt      = cur === "CHF" ? "CHF " + e.amount.toFixed(2) : "\u20AC" + e.amount.toFixed(2);
      const ghost    = e.ghost ? " ghost-row" : "";
      const ghostMk  = e.ghost ? " \uD83D\uDC7B" : "";
      const catEmoji = e.category.split(" ")[0];
      rowsHtml +=
        "<label class=\"entry-row" + ghost + "\" for=\"chk" + i + "\">" +
        "<input type=\"checkbox\" id=\"chk" + i + "\" data-idx=\"" + i + "\" onchange=\"onCheck()\">" +
        "<span class=\"entry-body\">" +
        "<span class=\"entry-top\">" +
        "<span class=\"entry-time\">" + e.time + "</span>" +
        "<span class=\"cat-dot\" style=\"background:" + color + "\"></span>" +
        "<span class=\"entry-desc\">" + e.description + ghostMk + "</span>" +
        "<span class=\"entry-amt\">" + amt + "</span>" +
        "</span>" +
        "<span class=\"entry-cat\">" + catEmoji + " " + e.category.split(" ").slice(1).join(" ") + "</span>" +
        "</span></label>";
    });
  });

  const allIndices = JSON.stringify(entries.map((_, i) => i));

  return "<!DOCTYPE html>\n<html>\n<head>\n" +
"<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, maximum-scale=1\">\n" +
"<style>\n" +
"  * { box-sizing: border-box; margin: 0; padding: 0; }\n" +
"  html { font-size: clamp(1rem, 2.2vw, 1.4rem); }\n" +
"  body { font-family: -apple-system, sans-serif; background: #0F1923; color: #fff; padding-bottom: 260px; }\n" +
"  .top-bar { position: sticky; top: 0; background: #0F1923; padding: 14px 16px 10px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between; z-index: 20; }\n" +
"  .top-title { font-size: 1.067rem; font-weight: 700; color: #C8D8E4; }\n" +
"  .top-count { font-size: 0.8rem; color: #FFD166; font-weight: 700; min-width: 60px; text-align: right; }\n" +
"  .sel-btns { display: flex; gap: 8px; padding: 8px 16px 4px; }\n" +
"  .sel-btn { flex: 1; background: rgba(255,255,255,0.07); border: none; border-radius: 8px; color: #8FA3B0; font-size: 0.8rem; font-weight: 600; padding: 7px 4px; }\n" +
"  .sel-btn:active { background: rgba(255,255,255,0.15); }\n" +
"  .day-header { padding: 12px 16px 5px; font-size: 0.8rem; font-weight: 700; color: #8FA3B0; border-top: 1px solid rgba(255,255,255,0.07); margin-top: 4px; }\n" +
"  .entry-row { display: flex; align-items: center; padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.05); gap: 12px; cursor: pointer; -webkit-tap-highlight-color: transparent; }\n" +
"  .entry-row:active { background: rgba(255,255,255,0.04); }\n" +
"  .entry-row input[type=checkbox] { width: 22px; height: 22px; accent-color: #FFD166; flex-shrink: 0; cursor: pointer; }\n" +
"  .entry-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }\n" +
"  .entry-top { display: flex; align-items: center; gap: 7px; }\n" +
"  .entry-time { font-size: 0.8rem; color: #8FA3B0; flex-shrink: 0; width: 36px; }\n" +
"  .cat-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }\n" +
"  .entry-desc { flex: 1; font-size: 0.933rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n" +
"  .entry-amt { font-size: 0.933rem; font-weight: 700; color: #FFD166; flex-shrink: 0; }\n" +
"  .entry-cat { font-size: 0.733rem; color: #8FA3B0; padding-left: 51px; }\n" +
"  .ghost-row { opacity: 0.45; }\n" +
"  .ghost-row .entry-desc { font-style: italic; }\n" +
"  .ghost-row .entry-amt { text-decoration: line-through; color: #8FA3B0; }\n" +
"  .entry-row:has(input:checked) { background: rgba(255,209,102,0.07); }\n" +
"  .entry-row:has(input:checked) .entry-desc { color: #FFD166; }\n" +
"  .toolbar { position: fixed; bottom: 0; left: 0; right: 0; background: #0d1820; border-top: 1px solid rgba(255,255,255,0.1); padding: 10px 8px 12px; z-index: 20; }\n" +
"  .toolbar-hint { font-size: 0.667rem; color: #8FA3B0; text-align: center; margin-bottom: 8px; }\n" +
"  .apply-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }\n" +
"  .apply-btn { background: rgba(255,255,255,0.07); border: none; border-radius: 10px; color: #fff; font-size: 0.867rem; font-weight: 600; padding: 13px 4px; text-align: center; }\n" +
"  .apply-btn:active { background: rgba(255,255,255,0.18); }\n" +
"  .delete-btn { width: 100%; margin-top: 6px; background: rgba(229,57,53,0.15); border: 1px solid rgba(229,57,53,0.35); border-radius: 10px; color: #EF9A9A; font-size: 0.867rem; font-weight: 600; padding: 13px 4px; }\n" +
"  .delete-btn:active { background: rgba(229,57,53,0.30); }\n" +
"  .close-btn { width: 100%; margin-top: 6px; background: transparent; border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; color: #8FA3B0; font-size: 0.867rem; font-weight: 600; padding: 10px 4px; }\n" +
"  .close-btn:active { background: rgba(255,255,255,0.07); }\n" +
"</style>\n</head>\n<body>\n" +
"<div class=\"top-bar\">\n" +
"  <div class=\"top-title\">✏️ Bulk Edit</div>\n" +
"  <div class=\"top-count\" id=\"countBadge\">0 selected</div>\n" +
"</div>\n" +
"<div class=\"sel-btns\">\n" +
"  <button class=\"sel-btn\" onclick=\"selectAll()\">Select all</button>\n" +
"  <button class=\"sel-btn\" onclick=\"selectNone()\">Select none</button>\n" +
"</div>\n" +
"<div id=\"list\">" + rowsHtml + "</div>\n" +
"<div class=\"toolbar\">\n" +
"  <div class=\"toolbar-hint\" id=\"toolbarHint\">Select entries above, then choose what to change</div>\n" +
"  <div class=\"apply-grid\">\n" +
"    <button class=\"apply-btn\" onclick=\"apply('category')\">📂 Category</button>\n" +
"    <button class=\"apply-btn\" onclick=\"apply('currency')\">💱 Currency</button>\n" +
"    <button class=\"apply-btn\" onclick=\"apply('ghost')\">👻 Ghost</button>\n" +
"    <button class=\"apply-btn\" onclick=\"apply('date')\">📅 Move date</button>\n" +
"  </div>\n" +
"  <button class=\"delete-btn\" onclick=\"apply('delete')\">🗑️ Delete selected</button>\n" +
"  <button class=\"close-btn\" onclick=\"closePanel()\">Cancel</button>\n" +
"</div>\n\n" +
"<script>\n" +
"var _action = null;\n" +
"var ALL_INDICES = " + allIndices + ";\n" +
"function fitPadding() {\n" +
"  var tb = document.querySelector('.toolbar');\n" +
"  if (tb) document.body.style.paddingBottom = (tb.offsetHeight + 16) + 'px';\n" +
"}\n" +
"fitPadding();\n" +
"window.addEventListener('resize', fitPadding);\n" +
"function getChecked() {\n" +
"  var boxes = document.querySelectorAll('input[type=checkbox]:checked');\n" +
"  var ids = [];\n" +
"  boxes.forEach(function(b) { ids.push(parseInt(b.getAttribute('data-idx'))); });\n" +
"  return ids;\n" +
"}\n" +
"function onCheck() {\n" +
"  var n = getChecked().length;\n" +
"  document.getElementById('countBadge').textContent = n === 0 ? '0 selected' : n + ' selected';\n" +
"  document.getElementById('toolbarHint').textContent = n === 0\n" +
"    ? 'Select entries above, then choose what to change'\n" +
"    : n + ' ' + (n === 1 ? 'entry' : 'entries') + ' selected \u2014 tap a button to apply';\n" +
"}\n" +
"function selectAll() {\n" +
"  document.querySelectorAll('input[type=checkbox]').forEach(function(b) { b.checked = true; });\n" +
"  onCheck();\n" +
"}\n" +
"function selectNone() {\n" +
"  document.querySelectorAll('input[type=checkbox]').forEach(function(b) { b.checked = false; });\n" +
"  onCheck();\n" +
"}\n" +
"function apply(field) {\n" +
"  var ids = getChecked();\n" +
"  _action = 'bulkApply:' + field + ':' + ids.join(',');\n" +
"}\n" +
"function closePanel() { _action = 'bulkClose'; }\n" +
"</script>\n</body>\n</html>";
}

// ==================================================================
//  EXPORT CSV
// ==================================================================
async function exportCSV() {
  const entries  = loadData();
  const settings = loadSettings();

  if (entries.length === 0) {
    const e = new Alert(); e.title = "Nothing to export"; e.addAction("OK");
    await e.presentAlert(); return;
  }

  let csv = "Date,Time,Category,Currency,Amount,Amount (CHF),Latitude,Longitude,Description,Ghost\n";
  entries.forEach(e => {
    const cur      = e.currency || "CHF";
    const chf      = toCHF(e.amount, cur, settings);
    const lat      = e.lat != null ? e.lat : "";
    const lon      = e.lon != null ? e.lon : "";
    const ghost    = e.ghost ? "yes" : "";
    const safeDesc = "\"" + e.description.replace(/"/g, '""') + "\"";
    csv += e.date + "," + e.time + ",\"" + e.category + "\"," + cur + "," + e.amount.toFixed(2) + "," + chf.toFixed(2) + "," + lat + "," + lon + "," + safeDesc + "," + ghost + "\n";
  });

  const now   = new Date();
  const stamp = String(now.getFullYear()) +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") + "_" +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0");
  const fileName   = "VacationExpenses_" + stamp + ".csv";
  const exportPath = fm.joinPath(fm.documentsDirectory(), fileName);
  fm.writeString(exportPath, csv);

  const activeCount = entries.filter(e => !e.ghost).length;
  const ghostCount  = entries.length - activeCount;
  const ghostNote   = ghostCount > 0 ? "\n(" + ghostCount + " ghost " + (ghostCount === 1 ? "entry" : "entries") + " included but excluded from stats)" : "";

  const confirm = new Alert();
  confirm.title   = "📤 Export ready!";
  confirm.message = entries.length + " entries saved to:\niCloud Drive / Scriptable /\n" + fileName + ghostNote;
  confirm.addAction("Done");
  await confirm.presentAlert();
}

// ==================================================================
//  EXPORT / IMPORT MENU
// ==================================================================
async function showExportMenu() {
  const a = new Alert();
  a.title   = "📤 Export / Import";
  a.message = "Choose an action";
  a.addAction("📊 Export CSV");
  a.addAction("📦 Export JSON");
  a.addAction("📥 Import JSON");
  a.addCancelAction("Cancel");
  const res = await a.presentAlert();
  if (res === 0) await exportCSV();
  else if (res === 1) await exportJSON();
  else if (res === 2) await importJSON();
}

// ==================================================================
//  EXPORT JSON
//  Wraps entries in { meta, entries } so currency context travels
//  with the file and can be detected on import.
// ==================================================================
async function exportJSON() {
  const entries  = loadData();
  const settings = loadSettings();

  if (entries.length === 0) {
    const e = new Alert(); e.title = "Nothing to export"; e.addAction("OK");
    await e.presentAlert(); return;
  }

  const now   = new Date();
  const stamp = String(now.getFullYear()) +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") + "_" +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0");

  const exportObj = {
    meta: {
      exportDate:  now.toISOString().slice(0, 10),
      appVersion:  "5.6",
      cur3Code:    settings.cur3Code,
      cur3Symbol:  settings.cur3Symbol,
      cur3Flag:    settings.cur3Flag,
      cur3Name:    settings.cur3Name,
      chfToCur3:   settings.chfToCur3,
      chfToEur:    settings.chfToEur,
    },
    entries,
  };

  const fileName   = "VacationExpenses_" + stamp + ".json";
  const exportPath = fm.joinPath(fm.documentsDirectory(), fileName);
  fm.writeString(exportPath, JSON.stringify(exportObj, null, 2));

  const activeCount = entries.filter(e => !e.ghost).length;
  const ghostCount  = entries.length - activeCount;
  const ghostNote   = ghostCount > 0 ? "\n(" + ghostCount + " ghost " + (ghostCount === 1 ? "entry" : "entries") + " included)" : "";

  const confirm = new Alert();
  confirm.title   = "📦 JSON Export ready!";
  confirm.message = entries.length + " entries saved to:\niCloud Drive / Scriptable /\n" + fileName + ghostNote +
    "\n\nThird currency: " + settings.cur3Flag + " " + settings.cur3Code + " stored in file.";
  confirm.addAction("Done");
  await confirm.presentAlert();
}

// ==================================================================
//  IMPORT JSON
//  Supports both legacy bare-array format and new { meta, entries }
//  format. When a meta block is present and its cur3Code differs from
//  the current settings, the user is warned and must confirm before
//  the import proceeds (which also overwrites cur3 settings).
// ==================================================================
async function importJSON() {
  let paths;
  try {
    paths = await DocumentPicker.openFile();
  } catch(_) {
    return;
  }

  const filePath = Array.isArray(paths) ? paths[0] : paths;
  if (!filePath) return;

  let parsed;
  try {
    const raw = fm.readString(filePath);
    parsed    = JSON.parse(raw);
  } catch(_) {
    const err = new Alert();
    err.title   = "Import failed";
    err.message = "Could not read or parse the selected file.\nMake sure it is a valid JSON export from this app.";
    err.addAction("OK");
    await err.presentAlert();
    return;
  }

  // Detect format: new { meta, entries } vs legacy bare array
  let importedEntries;
  let importedMeta = null;

  if (Array.isArray(parsed)) {
    // Legacy format — no currency metadata
    importedEntries = parsed;
  } else if (parsed && Array.isArray(parsed.entries)) {
    // New format
    importedEntries = parsed.entries;
    importedMeta    = parsed.meta || null;
  } else {
    const err = new Alert();
    err.title   = "Import failed";
    err.message = "The file does not contain any expense entries.";
    err.addAction("OK");
    await err.presentAlert();
    return;
  }

  // Basic structure validation
  const valid = importedEntries.filter(e =>
    typeof e === "object" && e !== null &&
    typeof e.date === "string" && e.date.length === 10 &&
    typeof e.amount === "number"
  );

  if (valid.length === 0) {
    const err = new Alert();
    err.title   = "Import failed";
    err.message = "No valid expense entries found in this file.";
    err.addAction("OK");
    await err.presentAlert();
    return;
  }

  // Currency mismatch check — only when meta block is present
  if (importedMeta && importedMeta.cur3Code) {
    const currentSettings = loadSettings();
    if (importedMeta.cur3Code !== currentSettings.cur3Code) {
      const warn = new Alert();
      warn.title   = "⚠️ Currency mismatch";
      warn.message =
        "This export uses " + (importedMeta.cur3Flag || "") + " " + importedMeta.cur3Code +
        " (" + (importedMeta.cur3Name || importedMeta.cur3Code) + ") as third currency.\n" +
        "Your current setting is " + currentSettings.cur3Flag + " " + currentSettings.cur3Code +
        " (" + currentSettings.cur3Name + ").\n\n" +
        "Importing will overwrite your third currency setting to " + importedMeta.cur3Code + " " +
        "(rate: 1 CHF = " + importedMeta.chfToCur3 + " " + importedMeta.cur3Code + ").";
      warn.addAction("Proceed");
      warn.addCancelAction("Cancel");
      const warnRes = await warn.presentAlert();
      if (warnRes === -1) return; // Cancel — abort entirely
      // Proceed — apply currency settings from meta before continuing
      currentSettings.cur3Code   = importedMeta.cur3Code;
      currentSettings.cur3Symbol = importedMeta.cur3Symbol  || currentSettings.cur3Symbol;
      currentSettings.cur3Flag   = importedMeta.cur3Flag    || currentSettings.cur3Flag;
      currentSettings.cur3Name   = importedMeta.cur3Name    || currentSettings.cur3Name;
      currentSettings.chfToCur3  = importedMeta.chfToCur3   || currentSettings.chfToCur3;
      if (importedMeta.chfToEur) currentSettings.chfToEur   = importedMeta.chfToEur;
      saveSettings(currentSettings);
    }
    // Same currency — still update rate from meta (rate may have changed between trips)
    else {
      const currentSettings2 = loadSettings();
      if (importedMeta.chfToCur3 && importedMeta.chfToCur3 !== currentSettings2.chfToCur3) {
        currentSettings2.chfToCur3 = importedMeta.chfToCur3;
        if (importedMeta.chfToEur) currentSettings2.chfToEur = importedMeta.chfToEur;
        saveSettings(currentSettings2);
      }
    }
  }

  // Ask: merge or replace
  const modeAlert = new Alert();
  modeAlert.title   = "📥 Import " + valid.length + " entries";
  modeAlert.message = "How should the imported data be combined with your existing entries?";
  modeAlert.addAction("🔀 Merge  (keep existing)");
  modeAlert.addAction("🗑️ Replace  (clear existing first)");
  modeAlert.addCancelAction("Cancel");
  const modeRes = await modeAlert.presentAlert();
  if (modeRes === -1) return;

  const doReplace = modeRes === 1;
  const existing  = doReplace ? [] : loadData();

  const seen = new Set(
    existing.map(e => (e.date || "") + "|" + (e.time || "") + "|" + (e.description || ""))
  );

  let added = 0, skipped = 0;
  valid.forEach(e => {
    const key = (e.date || "") + "|" + (e.time || "") + "|" + (e.description || "");
    if (seen.has(key)) {
      skipped++;
    } else {
      existing.push(e);
      seen.add(key);
      added++;
    }
  });

  saveData(existing);

  const skipNote  = skipped > 0 ? "\n" + skipped + " duplicate " + (skipped === 1 ? "entry" : "entries") + " skipped." : "";
  const modeLabel = doReplace ? "Existing entries were replaced." : "Merged with existing entries.";

  const done = new Alert();
  done.title   = "✅ Import complete!";
  done.message = added + " " + (added === 1 ? "entry" : "entries") + " added.\n" + modeLabel + skipNote;
  done.addAction("Done");
  await done.presentAlert();
}
