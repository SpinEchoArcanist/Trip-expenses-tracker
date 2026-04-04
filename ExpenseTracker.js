// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: magic;
// VERSION 3.22 - 2026-04-04
// ===================================================================
//  VACATION EXPENSE TRACKER  -  ExpenseTracker.js
//  + Scroll position restored after every HTML reload
//  + Fast log: amount + category in one step, currency from settings
//  Data stored in: iCloud Drive / Scriptable / expenses.json
//  Settings in:    iCloud Drive / Scriptable / expense_settings.json
// ===================================================================

const CATEGORIES = [
  { label: "🍽️ Food",               color: "#E53935" },
  { label: "🛒 Grocery",            color: "#FB8C00" },
  { label: "🛍️ Shopping",           color: "#7B1FA2" },
  { label: "🚌 Transport",           color: "#2E7D32" },
  { label: "🏛️ Visit / Activities", color: "#1565C0" },
];

const DISPLAY_MODES = ["ADAPTIVE", "EUR", "CHF"];
const MODE_LABELS   = { ADAPTIVE: "💶 Adaptive", EUR: "🇪🇺 EUR", CHF: "🇨🇭 CHF" };

const DATA_FILE     = "expenses.json";
const SETTINGS_FILE = "expense_settings.json";
const fm = FileManager.iCloud();
const dataPath     = fm.joinPath(fm.documentsDirectory(), DATA_FILE);
const settingsPath = fm.joinPath(fm.documentsDirectory(), SETTINGS_FILE);

// ==================================================================
//  SETTINGS
// ==================================================================
function loadSettings() {
  const defaults = {
    chfToEur:        1.09,
    adaptiveAvgCur:  "EUR",
    displayMode:     "ADAPTIVE",
    defaultCurrency: "EUR",   // currency pre-selected for new entries
  };
  if (!fm.fileExists(settingsPath)) return defaults;
  try {
    fm.downloadFileFromiCloud(settingsPath);
    const s = JSON.parse(fm.readString(settingsPath));
    return Object.assign(defaults, s);
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
    return JSON.parse(fm.readString(dataPath));
  } catch(e) { return []; }
}

function saveData(entries) {
  fm.writeString(dataPath, JSON.stringify(entries, null, 2));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function toEur(amount, currency, rate) {
  return currency === "CHF" ? amount * rate : amount;
}

function fmtNative(amount, currency) {
  return currency === "CHF" ? "CHF " + amount.toFixed(2) : "€" + amount.toFixed(2);
}

function dominantCurrency(dayEntries, rate) {
  let eurSum = 0, chfSum = 0;
  dayEntries.forEach(e => {
    if ((e.currency || "EUR") === "CHF") chfSum += e.amount;
    else eurSum += e.amount;
  });
  return (chfSum * rate) > eurSum ? "CHF" : "EUR";
}

// Sum entries natively in a given currency (convert only the minority)
function sumInCurrency(dayEntries, cur, rate) {
  let total = 0;
  dayEntries.forEach(e => {
    const eCur = e.currency || "EUR";
    if (eCur === cur) total += e.amount;
    else if (cur === "CHF") total += e.amount * rate;   // EUR -> CHF
    else total += e.amount / rate;                       // CHF -> EUR
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
//
//  Step 1: Amount (text field) + Category (one button = select both)
//          Currency is taken from settings.defaultCurrency silently.
//  Step 2: Description (with ← Back to step 1)
//  Saved entry always has the default currency; user can edit later.
// ==================================================================
async function logExpense() {
  const settings = loadSettings();
  const currency = settings.defaultCurrency || "EUR";

  // Start location fetch in parallel from the very beginning
  const locationPromise = getCurrentLocation();

  let amount      = null;
  let category    = null;
  let description = null;
  let step        = 1;

  while (step >= 1 && step <= 2) {

    // ------------------------------------------------------------------
    // STEP 1 — Amount + Category combined
    // The alert shows a text field for the amount, then one button per
    // category. Tapping a category button both validates the amount and
    // advances to step 2. A "← Back" action is only visible on re-entry
    // (coming back from step 2).
    // ------------------------------------------------------------------
    if (step === 1) {
      const a = new Alert();
      a.title   = `💸 New Expense  — ${currency}`;
      a.message = "Enter amount, then tap a category";
      a.addTextField("0.00", amount !== null ? String(amount) : "");

      // Category buttons — tapping one = selecting category + advancing
      CATEGORIES.forEach(c => a.addAction(c.label));
      a.addCancelAction("Cancel");

      const res = await a.presentAlert();
      if (res === -1) return; // Cancel

      // Validate amount from text field
      const val = parseFloat(a.textFieldValue(0).replace(",", "."));
      if (isNaN(val) || val <= 0) {
        const err = new Alert();
        err.title = "Invalid amount";
        err.message = "Please enter a number greater than 0.";
        err.addAction("OK");
        await err.presentAlert();
        continue; // stay on step 1
      }

      amount   = val;
      category = CATEGORIES[res].label;
      step     = 2;

    // ------------------------------------------------------------------
    // STEP 2 — Description  (← Back returns to step 1)
    // ------------------------------------------------------------------
    } else if (step === 2) {
      const a = new Alert();
      a.title   = "📝 Description";
      a.message = `${category}  •  ${amount.toFixed(2)} ${currency}`;
      a.addTextField("e.g. Lunch at the port", description || "");
      a.addAction("Save ✓");
      a.addAction("← Back");
      a.addCancelAction("Cancel");

      const res = await a.presentAlert();
      if (res === -1) return; // Cancel
      if (res === 1)  { step = 1; continue; } // Back

      description = a.textFieldValue(0).trim() || "(no description)";
      step = 3; // done
    }
  }

  if (step < 3) return;

  // Await location (usually already resolved)
  const loc = await locationPromise;

  const now  = new Date();
  const time = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  const entries = loadData();
  const entry   = { date: todayStr(), time, category, amount, currency, description };
  if (loc) { entry.lat = loc.lat; entry.lon = loc.lon; }
  entries.push(entry);
  saveData(entries);

  const locStr = loc ? `📍 ${loc.lat}, ${loc.lon}` : "📍 Location unavailable";
  const done = new Alert();
  done.title   = "✅ Saved!";
  done.message = `${time}  •  ${category}\n${fmtNative(amount, currency)}  -  ${description}\n${locStr}`;
  done.addAction("Done");
  await done.presentAlert();
}

// ==================================================================
//  SETTINGS UI
// ==================================================================
async function showSettings() {
  const s = loadSettings();

  while (true) {
    const a = new Alert();
    a.title   = "⚙️ Settings";
    a.message =
      `Exchange rate: 1 CHF = ${s.chfToEur} EUR\n` +
      `Default currency: ${s.defaultCurrency}\n` +
      `Adaptive avg currency: ${s.adaptiveAvgCur}`;
    a.addAction(`💱 Exchange rate  (now: 1 CHF = ${s.chfToEur} EUR)`);
    a.addAction(`💶 Default currency for new entries  (now: ${s.defaultCurrency})`);
    a.addAction(`📊 Adaptive avg currency  (now: ${s.adaptiveAvgCur})`);
    a.addCancelAction("← Done");

    const choice = await a.presentAlert();
    if (choice === -1) return;

    if (choice === 0) {
      const r = new Alert();
      r.title   = "💱 Exchange Rate";
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
      const t = new Alert();
      t.title   = "💶 Default currency for new entries";
      t.message = "Used automatically when logging a new expense.";
      t.addAction("🇪🇺 EUR");
      t.addAction("🇨🇭 CHF");
      t.addCancelAction("← Back");
      const res = await t.presentAlert();
      if (res === -1) continue;
      s.defaultCurrency = res === 1 ? "CHF" : "EUR";
      saveSettings(s);

    } else if (choice === 2) {
      const t = new Alert();
      t.title   = "📊 Avg currency in Adaptive mode";
      t.message = "Averages and overall total shown in:";
      t.addAction("🇪🇺 EUR  (default)");
      t.addAction("🇨🇭 CHF");
      t.addCancelAction("← Back");
      const res = await t.presentAlert();
      if (res === -1) continue;
      s.adaptiveAvgCur = res === 1 ? "CHF" : "EUR";
      saveSettings(s);
    }
  }
}

// ==================================================================
//  DASHBOARD  —  poll loop + Promise.race for clean exit
//
//  Two exit paths:
//  1. Scriptable Close button (or swipe): wv.present(false) resolves.
//     Promise.race catches this; Script.complete() is called.
//  2. In-page X button: poll loop calls Script.complete() directly.
//
//  Native alerts (log, edit, settings) are awaited inside the poll loop.
//  They are modal above the WebView, so the user cannot close the WebView
//  while an alert is showing — no race condition.
// ==================================================================
async function showDashboard() {
  const settings = loadSettings();
  const wv = new WebView();
  await wv.loadHTML(buildDashboardHTML(settings));

  // Race: whichever resolves first (Scriptable Close or in-page X) wins.
  // Script.complete() is then called once, tearing down everything cleanly.
  await Promise.race([
    wv.present(true),
    runPollLoop(wv, settings),
  ]);
  Script.complete();
}

async function runPollLoop(wv, settings) {
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
      if (DISPLAY_MODES.includes(newMode)) {
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

    // Handle the action
    if (action === "log") {
      await logExpense();
    } else if (action === "export") {
      await exportCSV();
    } else if (action === "settings") {
      await showSettings();
      Object.assign(settings, loadSettings());
    } else if (typeof action === "string" && action.startsWith("editIdx:")) {
      const idx = parseInt(action.split(":")[1], 10);
      const entries = loadData();
      if (!isNaN(idx) && idx >= 0 && idx < entries.length) {
        await editEntry(entries, idx);
      }
    } else if (typeof action === "string" && action.startsWith("mapIdx:")) {
      const idx = parseInt(action.split(":")[1], 10);
      const entries = loadData();
      if (!isNaN(idx) && idx >= 0 && idx < entries.length) {
        const e = entries[idx];
        if (e.lat != null && e.lon != null) {
          const label     = encodeURIComponent(e.description || "Expense");
          const appleUrl  = `maps://?ll=${e.lat},${e.lon}&q=${label}`;
          const googleUrl = `https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lon}`;
          const pick = new Alert();
          pick.title   = "📍 Open in Maps";
          pick.message = `${e.lat}, ${e.lon}
${e.description}`;
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
      await wv.loadHTML(buildDashboardHTML(settings));
      if (scrollY > 0) {
        await new Promise(r => Timer.schedule(80, false, r));
        try {
          await wv.evaluateJavaScript(`window.scrollTo(0, ${scrollY})`);
        } catch(_) {}
      }
    } catch(_) { return; }
  }
}

// ==================================================================
//  BUILD DASHBOARD HTML
// ==================================================================
function buildDashboardHTML(settings) {
  const rate           = settings.chfToEur;
  const adaptiveAvgCur = settings.adaptiveAvgCur || "EUR";
  const initialMode    = settings.displayMode    || "ADAPTIVE";

  const entries = loadData();
  const today   = todayStr();

  const todayEntries = entries.filter(e => e.date === today);
  const pastEntries  = entries.filter(e => e.date !== today);
  const nPastDays    = [...new Set(pastEntries.map(e => e.date))].length;

  const CAT_COLORS = {};
  const CAT_SHORT  = {};
  CATEGORIES.forEach(c => {
    CAT_COLORS[c.label] = c.color;
    CAT_SHORT[c.label]  = c.label.split(" ").slice(1).join(" ");
  });

  const byDayEntries = {};
  entries.forEach(e => {
    if (!byDayEntries[e.date]) byDayEntries[e.date] = [];
    byDayEntries[e.date].push(e);
  });
  const sortedDays = Object.keys(byDayEntries).sort().reverse();

  // Static entry rows — day headers are foldable; entry rows carry a day class
  let entryRowsHtml = "";
  if (entries.length === 0) {
    entryRowsHtml = `<tr><td colspan="5" class="dim" style="text-align:center;padding:16px">No entries yet</td></tr>`;
  } else {
    sortedDays.forEach(d => {
      const isToday  = d === today;
      const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      const weekday = DAYS[new Date(d + "T12:00:00").getDay()];
      const dayLabel = isToday
        ? `<strong>${weekday} ${fmtDate(d)}</strong> <span class="badge">today</span>`
        : `${weekday} ${fmtDate(d)}`;
      const dayId  = "dh_" + d.replace(/-/g, "");
      const dayKey = d.replace(/-/g, "");
      // Day header row: clicking toggles its entries. Total cell keeps its id for render() updates.
      entryRowsHtml += `
        <tr class="day-header-row" onclick="toggleDay('${dayKey}')">
          <td colspan="4">${dayLabel}</td>
          <td id="${dayId}tot" class="${isToday ? "green" : "yellow"} right">…<span id="${dayId}chev" style="margin-left:6px;font-size:0.667rem;color:#8FA3B0">&#9660;</span></td>
        </tr>`;
      [...byDayEntries[d]].reverse().forEach(e => {
        const originalIdx = entries.indexOf(e);
        const color  = CAT_COLORS[e.category] || "#888";
        const cur    = e.currency || "EUR";
        const hasLoc = e.lat != null && e.lon != null;
        const mapBtn = hasLoc
          ? `<button class="icon-btn" onclick="event.stopPropagation();done('mapIdx:${originalIdx}')">📍</button>`
          : `<button class="icon-btn map-disabled" disabled>📍</button>`;
        entryRowsHtml += `
          <tr class="day-row day-row-${dayKey}">
            <td class="dim time-col">${e.time}</td>
            <td><span class="dot" style="background:${color}"></span>${e.description}</td>
            <td class="yellow right">${fmtNative(e.amount, cur)}</td>
            <td class="icon-col">${mapBtn}</td>
            <td class="icon-col"><button class="icon-btn" onclick="event.stopPropagation();done('editIdx:${originalIdx}')">✏️</button></td>
          </tr>`;
      });
    });
  }

  // Embedded data for WebView-side JS rendering
  const embeddedData = JSON.stringify({
    rate,
    adaptiveAvgCur,
    initialMode,
    today,
    nPastDays,
    days: sortedDays.map(d => {
      const dayEnts = byDayEntries[d];
      const domCur  = dominantCurrency(dayEnts, rate);
      const catEur  = {};
      CATEGORIES.forEach(c => { catEur[c.label] = 0; });
      dayEnts.forEach(e => {
        if (catEur[e.category] !== undefined)
          catEur[e.category] += toEur(e.amount, e.currency || "EUR", rate);
      });
      return {
        date:    d,
        isToday: d === today,
        domCur,
        nativeTotal: sumInCurrency(dayEnts, domCur, rate),
        entries: dayEnts.map(e => ({ amount: e.amount, currency: e.currency || "EUR" })),
        catEur,
      };
    }),
    categories: CATEGORIES.map(c => {
      const dailyEur   = todayEntries.filter(e => e.category === c.label)
        .reduce((s, e) => s + toEur(e.amount, e.currency || "EUR", rate), 0);
      const pastEur    = pastEntries.filter(e => e.category === c.label)
        .reduce((s, e) => s + toEur(e.amount, e.currency || "EUR", rate), 0);
      const overallEur = entries.filter(e => e.category === c.label)
        .reduce((s, e) => s + toEur(e.amount, e.currency || "EUR", rate), 0);
      return { label: c.label, short: CAT_SHORT[c.label] || c.label, color: c.color, dailyEur, pastEur, overallEur };
    }),
    totalAllEur:   entries.reduce((s, e) => s + toEur(e.amount, e.currency || "EUR", rate), 0),
    totalTodayEur: todayEntries.reduce((s, e) => s + toEur(e.amount, e.currency || "EUR", rate), 0),
    totalTodayCHF: sumInCurrency(todayEntries, "CHF", rate),
    pastTotalEur:  pastEntries.reduce((s, e) => s + toEur(e.amount, e.currency || "EUR", rate), 0),
    pastTotalCHF:  sumInCurrency(pastEntries, "CHF", rate),
    prevDomCur: (sortedDays.length > 0 && sortedDays[0] !== today && byDayEntries[sortedDays[0]])
      ? dominantCurrency(byDayEntries[sortedDays[0]], rate)
      : (sortedDays.length > 1 && byDayEntries[sortedDays[1]])
        ? dominantCurrency(byDayEntries[sortedDays[1]], rate)
        : "EUR",
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { width: 100%; font-size: clamp(1rem, 2.2vw, 1.4rem); }
  body { width: 100%; font-family: -apple-system, sans-serif; background: #0F1923; color: #fff; padding: 0 0 32px 0; font-size: 1rem; }
  .header { position: sticky; top: 0; background: #0F1923; padding: 14px 16px 10px; border-bottom: 1px solid rgba(255,255,255,0.08); z-index: 10; display: flex; align-items: center; justify-content: space-between; }
  .header-title { font-size: 1.067rem; font-weight: 700; color: #8FA3B0; }
  .header-date  { font-size: 0.8rem; color: #8FA3B0; margin-top: 2px; }
  .mode-btn { background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.15); border-radius: 10px; color: #FFD166; font-size: 0.8rem; font-weight: 700; padding: 5px 10px; white-space: nowrap; }
  .mode-btn:active { background: rgba(255,209,102,0.25); }
  .totals { display: flex; gap: 0; padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .total-block { flex: 1; text-align: center; padding: 0 8px; }
  .total-block + .total-block { border-left: 1px solid rgba(255,255,255,0.12); }
  .total-label { font-size: 0.667rem; font-weight: 700; color: #8FA3B0; letter-spacing: 0.5px; margin-bottom: 4px; }
  .total-value { font-size: 1.267rem; font-weight: 800; line-height: 1.3; }
  .rate-note { font-size: 0.667rem; color: rgba(143,163,176,0.7); text-align: center; padding: 6px 16px 0; }
  .section { padding: 16px 16px 0; }
  .section-title { font-size: 0.867rem; font-weight: 800; color: #C8D8E4; letter-spacing: 0.6px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none; padding: 4px 0; }
  .section-title:active { opacity: 0.7; }
  .section-chevron { font-size: 0.733rem; color: #8FA3B0; display: inline-block; }
  .section-body.collapsed { display: none; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 9px 6px; font-size: 0.933rem; vertical-align: middle; }
  tr, thead tr { border-bottom: 1px solid rgba(255,255,255,0.05); }
  tr:last-child { border-bottom: none; }
  .today-row td { background: rgba(6,214,160,0.06); }
  .day-header-row td { background: rgba(255,255,255,0.04); font-size: 0.8rem; font-weight: 700; color: #8FA3B0; padding-top: 12px; padding-bottom: 6px; border-top: 1px solid rgba(255,255,255,0.1); cursor: pointer; user-select: none; }
  .day-header-row:first-child td { border-top: none; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 7px; }
  .green  { color: #06D6A0; font-weight: 700; text-align: right; }
  .purple { color: #A78BFA; font-weight: 700; text-align: right; }
  .yellow { color: #FFD166; font-weight: 700; text-align: right; }
  .right  { text-align: right; }
  .dim    { color: #8FA3B0; }
  .time-col { width: 44px; color: #8FA3B0; font-size: 0.867rem; }
  .icon-col { width: 32px; text-align: center; padding: 4px 2px; }
  .icon-btn { background: rgba(255,255,255,0.07); border: none; border-radius: 7px; color: #fff; font-size: 0.933rem; padding: 4px 6px; line-height: 1; cursor: pointer; }
  .icon-btn:active { background: rgba(255,209,102,0.25); }
  .map-disabled { opacity: 0.22; cursor: default; }
  .bar-bg { background: rgba(255,255,255,0.08); border-radius: 3px; height: 5px; width: 60px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 3px; }
  .badge { background: rgba(6,214,160,0.2); color: #06D6A0; font-size: 0.667rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-left: 6px; vertical-align: middle; }
  .col-header { font-size: 0.667rem; font-weight: 700; letter-spacing: 0.4px; padding-bottom: 4px !important; border-bottom: 1px solid rgba(255,255,255,0.1) !important; }
  .col-header.green  { color: #06D6A0; }
  .col-header.purple { color: #A78BFA; }
  .col-header.yellow { color: #FFD166; }
  .col-header.dim    { color: #8FA3B0; }
  .day-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 4px; }
  .day-scroll table { border-collapse: collapse; width: max-content; min-width: 100%; }
  .day-tbl-date { position: sticky; left: 0; background: #0F1923; z-index: 2; white-space: nowrap; min-width: 6rem; padding: 9px 10px 9px 16px; box-shadow: 3px 0 6px rgba(0,0,0,0.4); }
  .today-row .day-tbl-date { background: #0d1f16; }
  .day-tbl-cat { min-width: 4.8rem; text-align: right; white-space: nowrap; }
  .day-tbl-total { min-width: 4.8rem; text-align: right; white-space: nowrap; padding-left: 6px; border-left: 1px solid rgba(255,255,255,0.1); }
  .actions { position: fixed; bottom: 0; left: 0; right: 0; display: flex; background: #0d1820; border-top: 1px solid rgba(255,255,255,0.1); padding: 10px 8px; gap: 6px; }
  .btn { flex: 1; background: rgba(255,255,255,0.07); border: none; border-radius: 10px; color: #fff; font-size: 1.067rem; font-weight: 600; padding: 15px 4px; text-align: center; }
  .btn:active { background: rgba(255,255,255,0.15); }
  .btn.primary { background: rgba(255,209,102,0.15); color: #FFD166; }
  .action-spacer { height: 96px; }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="header-title">✈️ Vacation Expenses</div>
    <div class="header-date">${fmtDate(today)}</div>
  </div>
  <button class="mode-btn" id="modeBtn" onclick="cycleMode()">…</button>
</div>
<div class="totals">
  <div class="total-block">
    <div class="total-label" id="lblToday">TODAY</div>
    <div class="total-value" style="color:#06D6A0" id="valToday">…</div>
  </div>
  <div class="total-block">
    <div class="total-label" id="lblAvg">AVG/DAY</div>
    <div class="total-value" style="color:#A78BFA" id="valAvg">…</div>
  </div>
  <div class="total-block">
    <div class="total-label" id="lblOverall">OVERALL</div>
    <div class="total-value" style="color:#FFD166" id="valOverall">…</div>
  </div>
</div>
<p class="rate-note" id="rateNote"></p>
<div class="section" style="margin-top:12px">
  <div class="section-title" onclick="toggleSection('cat')">
    <span>BY CATEGORY</span><span class="section-chevron" id="chev-cat">&#9660;</span>
  </div>
  <div class="section-body" id="body-cat">
  <table>
    <tr>
      <td class="col-header dim">Category</td>
      <td class="col-header green right">Today</td>
      <td class="col-header purple right">Avg/day</td>
      <td class="col-header yellow right">Total</td>
      <td class="col-header dim"></td>
    </tr>
    <tbody id="catBody"></tbody>
  </table>
  </div>
</div>
<div class="section" style="margin-top:20px">
  <div class="section-title" onclick="toggleSection('day')">
    <span>BY DAY</span><span class="section-chevron" id="chev-day">&#9660;</span>
  </div>
  <div class="section-body" id="body-day">
  <div class="day-scroll">
  <table id="dayTable">
    <tbody id="dayBody"></tbody>
  </table>
  </div>
  </div>
</div>
<div class="section" style="margin-top:20px">
  <div class="section-title" onclick="toggleSection('entries')">
    <span id="entriesTitle">ALL ENTRIES</span><span class="section-chevron" id="chev-entries">&#9660;</span>
  </div>
  <div class="section-body" id="body-entries">
  <table>
    <tr>
      <td class="col-header dim">Time</td>
      <td class="col-header dim">Description</td>
      <td class="col-header yellow right">Amount</td>
      <td class="col-header dim" style="text-align:center">&#128205;</td>
      <td class="col-header dim" style="text-align:center">&#9999;&#65039;</td>
    </tr>
    <tbody id="entryBody">${entryRowsHtml}</tbody>
  </table>
  </div>
</div>
<div class="action-spacer"></div>
<div class="actions">
  <button class="btn primary" onclick="done('log')">➕ New</button>
  <button class="btn" onclick="done('settings')">⚙️</button>
  <button class="btn" onclick="done('export')">📤</button>
</div>

<script>
var D = ${embeddedData};
var MODES = ["ADAPTIVE","EUR","CHF"];
var MODE_LABELS = { ADAPTIVE:"💶 Adaptive", EUR:"🇪🇺 EUR", CHF:"🇨🇭 CHF" };
var _action = null;
var currentMode = D.initialMode;

function done(a) { _action = a; }

function fmtIn(amount, cur) {
  return cur === "CHF" ? "CHF " + amount.toFixed(2) : "€" + amount.toFixed(2);
}

function otherCur(cur) { return cur === "CHF" ? "EUR" : "CHF"; }

// Convert a native-currency amount to the other currency for sub-note display
function toOther(amount, cur) {
  return cur === "CHF" ? amount / D.rate : amount * D.rate;
}

function fmtSub(amount, cur) {
  var other = otherCur(cur);
  var val   = toOther(amount, cur);
  return "= " + fmtIn(val, other);
}

function domCurForDay(dayEntries) {
  var eurSum = 0, chfSum = 0;
  dayEntries.forEach(function(e) {
    if (e.currency === "CHF") chfSum += e.amount;
    else eurSum += e.amount;
  });
  return (chfSum * D.rate) > eurSum ? "CHF" : "EUR";
}

// Sum entries natively in a given currency
function nativeSumForDay(dayEntries, cur) {
  var total = 0;
  dayEntries.forEach(function(e) {
    if (e.currency === cur) total += e.amount;
    else if (cur === "CHF")  total += e.amount * D.rate;
    else                     total += e.amount / D.rate;
  });
  return total;
}

function sumInCur(eurAmount, cur) {
  return cur === "CHF" ? eurAmount / D.rate : eurAmount;
}

function fmtDate(iso) {
  var p = iso.split("-");
  return p[2] + "/" + p[1] + "/" + p[0];
}

function render() {
  var mode       = currentMode;
  var isAdaptive = mode === "ADAPTIVE";
  var fixedCur   = (mode === "EUR") ? "EUR" : (mode === "CHF") ? "CHF" : null;
  var avgCur     = fixedCur || D.adaptiveAvgCur;
  var overallCur = fixedCur || D.adaptiveAvgCur;

  document.getElementById("modeBtn").textContent = MODE_LABELS[mode];
  document.getElementById("rateNote").textContent =
    "1 CHF = " + D.rate + " EUR  ·  mode: " + MODE_LABELS[mode];

  // TODAY — use native total in dominant currency; fallback to prevDomCur if 0 entries
  var todayDay  = D.days.length > 0 && D.days[0].isToday ? D.days[0] : null;
  var todayCur  = fixedCur || (todayDay ? todayDay.domCur : D.prevDomCur);
  var todayNat  = todayDay ? todayDay.nativeTotal : 0;
  var todayStr  = fmtIn(todayNat, todayCur);
  if (isAdaptive) {
    todayStr += "<br><span style='font-size:0.8rem;color:#8FA3B0'>" + fmtSub(todayNat, todayCur) + "</span>";
  }
  document.getElementById("valToday").innerHTML = todayStr;
  document.getElementById("lblToday").textContent = "TODAY";

  // AVG — native sum in avgCur, sub-note in other currency
  var avgNat  = D.nPastDays > 0
    ? (avgCur === "CHF" ? D.pastTotalCHF / D.nPastDays : D.pastTotalEur / D.nPastDays)
    : null;
  var avgStr  = avgNat !== null ? fmtIn(avgNat, avgCur) : "-";
  if (isAdaptive && avgNat !== null) {
    avgStr += "<br><span style='font-size:0.8rem;color:#8FA3B0'>" + fmtSub(avgNat, avgCur) + "</span>";
  }
  document.getElementById("valAvg").innerHTML = avgStr;
  document.getElementById("lblAvg").textContent = "AVG/DAY (" + avgCur + ")";

  // OVERALL — native sum in overallCur, sub-note in other currency
  var overallNat = overallCur === "CHF" ? D.totalAllEur / D.rate : D.totalAllEur;
  var overallStr = fmtIn(overallNat, overallCur);
  if (isAdaptive) {
    overallStr += "<br><span style='font-size:0.8rem;color:#8FA3B0'>" + fmtSub(overallNat, overallCur) + "</span>";
  }
  document.getElementById("valOverall").innerHTML = overallStr;
  document.getElementById("lblOverall").textContent = "OVERALL (" + overallCur + ")";

  // CATEGORY TABLE
  var catHtml = "";
  D.categories.forEach(function(c) {
    var tCur     = fixedCur || todayCur;
    var todayAmt = sumInCur(c.dailyEur, tCur);
    var avgAmt   = D.nPastDays > 0 ? sumInCur(c.pastEur / D.nPastDays, avgCur) : 0;
    var totalAmt = sumInCur(c.overallEur, overallCur);
    var pct      = D.totalAllEur > 0 ? Math.round(c.overallEur / D.totalAllEur * 100) : 0;
    var todayCell = c.dailyEur > 0
      ? "<span class='green' style='display:block;text-align:right'>" + fmtIn(todayAmt, tCur) + "</span>"
      : "<span class='dim'>-</span>";
    var avgCell = avgAmt > 0
      ? "<span class='purple' style='display:block;text-align:right'>" + fmtIn(avgAmt, avgCur) + "</span>"
      : "<span class='dim'>-</span>";
    catHtml +=
      "<tr>" +
      "<td><span class='dot' style='background:" + c.color + "'></span>" + c.short + "</td>" +
      "<td>" + todayCell + "</td>" +
      "<td>" + avgCell + "</td>" +
      "<td class='yellow right'>" + fmtIn(totalAmt, overallCur) + "</td>" +
      "<td><div class='bar-bg'><div class='bar-fill' style='width:" + pct + "%;background:" + c.color + "'></div></div></td>" +
      "</tr>";
  });
  document.getElementById("catBody").innerHTML = catHtml;

  // BY DAY TABLE header — date column + one per category + total
  var headHtml = "<tr><td class='col-header dim day-tbl-date'></td>";
  D.categories.forEach(function(c) {
    headHtml += "<td class='col-header day-tbl-cat'><span style='color:" + c.color + "'>&#9679;</span><span style='font-size:0.933rem'>" + c.label.split(" ")[0] + "</span></td>";
  });
  headHtml += "<td class='col-header yellow day-tbl-total'>Tot.</td></tr>";

  // BY DAY TABLE rows + sync day-header totals in entry list
  var dayHtml = "";
  D.days.forEach(function(d) {
    var dCur      = fixedCur || d.domCur;
    var dispTotal = fixedCur ? nativeSumForDay(d.entries, dCur) : d.nativeTotal;
    var isToday   = d.isToday;
    var WDAYS     = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    var MONTHS    = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    var dp        = d.date.split("-");
    var weekday   = WDAYS[new Date(d.date + "T12:00:00").getDay()];
    var shortDate = weekday + " " + dp[2] + " " + MONTHS[parseInt(dp[1]) - 1];
    var label     = isToday ? "<strong>" + shortDate + "</strong>" : shortDate;
    var valCls    = isToday ? "green" : "yellow";

    var row = "<tr class='" + (isToday ? "today-row" : "") + "'>";
    row += "<td class='day-tbl-date'>" + label + "</td>";
    D.categories.forEach(function(c) {
      var eurAmt  = (d.catEur && d.catEur[c.label]) ? d.catEur[c.label] : 0;
      // Convert EUR-pivot amount to display currency natively
      var dispAmt = sumInCur(eurAmt, dCur);
      row += "<td class='day-tbl-cat " + (eurAmt > 0 ? valCls : "dim") + "'>" +
        (eurAmt > 0 ? fmtIn(dispAmt, dCur) : "-") + "</td>";
    });
    row += "<td class='day-tbl-total " + valCls + "'>" + fmtIn(dispTotal, dCur) + "</td>";
    row += "</tr>";
    dayHtml += row;

    // Sync day-header total cell in ALL ENTRIES — update text only, keep chevron
    var el = document.getElementById("dh_" + d.date.replace(/-/g,"") + "tot");
    if (el) {
      el.childNodes[0].textContent = fmtIn(dispTotal, dCur);
      el.className = valCls + " right";
    }
  });
  document.getElementById("dayBody").innerHTML = headHtml + dayHtml;

  // Entry count title
  var total = D.days.reduce(function(s,d){ return s + d.entries.length; }, 0);
  document.getElementById("entriesTitle").textContent = "ALL ENTRIES (" + total + ")";
}

function cycleMode() {
  var idx = MODES.indexOf(currentMode);
  currentMode = MODES[(idx + 1) % MODES.length];
  render();
  done("setMode:" + currentMode);
}

// Foldable section state (BY CATEGORY / BY DAY / ALL ENTRIES)
var sectionCollapsed = { cat: false, day: false, entries: false };
function toggleSection(id) {
  sectionCollapsed[id] = !sectionCollapsed[id];
  var body = document.getElementById("body-" + id);
  var chev = document.getElementById("chev-" + id);
  if (!body || !chev) return;
  body.classList.toggle("collapsed", sectionCollapsed[id]);
  chev.innerHTML = sectionCollapsed[id] ? "&#9654;" : "&#9660;";
}

// Foldable day rows in ALL ENTRIES
var dayCollapsed = {};
function toggleDay(dayKey) {
  dayCollapsed[dayKey] = !dayCollapsed[dayKey];
  var rows = document.querySelectorAll(".day-row-" + dayKey);
  var chev = document.getElementById("dh_" + dayKey + "chev");
  var collapsed = dayCollapsed[dayKey];
  rows.forEach(function(r) { r.style.display = collapsed ? "none" : ""; });
  if (chev) chev.innerHTML = collapsed ? "&#9654;" : "&#9660;";
}

render();


</script>
</body>
</html>`;
}

// ==================================================================
//  EDIT ENTRY  —  field picker with back navigation
// ==================================================================
async function editEntry(entries, idx) {
  while (true) {
    const entry  = entries[idx];
    if (!entry) return;
    const cur    = entry.currency || "EUR";
    const locStr = (entry.lat != null && entry.lon != null)
      ? `📍 ${entry.lat}, ${entry.lon}`
      : "📍 No location";

    const action = new Alert();
    action.title   = "✏️ Edit Entry";
    action.message = `${fmtDate(entry.date)}  ${entry.time}\n${entry.category}\n${fmtNative(entry.amount, cur)}  -  ${entry.description}\n${locStr}`;
    action.addAction("📅 Date");
    action.addAction("⏰ Time");
    action.addAction("💱 Amount & Currency");
    action.addAction("📂 Category");
    action.addAction("📝 Description");
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
      aCur.message = `Amount: ${newAmt.toFixed(2)}`;
      aCur.addAction("€  Euro (EUR)");
      aCur.addAction("🇨🇭  Swiss Franc (CHF)");
      aCur.addAction("← Back");
      aCur.addCancelAction("← Back to fields");
      const curRes = await aCur.presentAlert();
      if (curRes === -1 || curRes === 2) continue;
      entries[idx].amount   = newAmt;
      entries[idx].currency = (curRes === 1) ? "CHF" : "EUR";

    } else if (field === 3) {
      const a = new Alert();
      a.title   = "📂 New category";
      a.message = `Current: ${entry.category}`;
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
      const confirm = new Alert();
      confirm.title   = "🗑️ Delete entry?";
      confirm.message = `${fmtDate(entry.date)}  ${entry.time}\n${entry.category}\n${fmtNative(entry.amount, cur)}  -  ${entry.description}`;
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

    saveData(entries);
    const e    = entries[idx];
    const eCur = e.currency || "EUR";
    const done = new Alert();
    done.title   = "✅ Updated!";
    done.message = `${fmtDate(e.date)}  ${e.time}\n${e.category}\n${fmtNative(e.amount, eCur)}  -  ${e.description}`;
    done.addAction("Done  ✓");
    done.addAction("✏️ Edit more");
    const next = await done.presentAlert();
    if (next === 0) return;
  }
}

// ==================================================================
//  EXPORT CSV
// ==================================================================
async function exportCSV() {
  const entries  = loadData();
  const settings = loadSettings();
  const rate     = settings.chfToEur;

  if (entries.length === 0) {
    const e = new Alert(); e.title = "Nothing to export"; e.addAction("OK");
    await e.presentAlert(); return;
  }

  let csv = "Date,Time,Category,Currency,Amount,Amount (EUR),Latitude,Longitude,Description\n";
  entries.forEach(e => {
    const cur      = e.currency || "EUR";
    const eur      = toEur(e.amount, cur, rate);
    const lat      = e.lat != null ? e.lat : "";
    const lon      = e.lon != null ? e.lon : "";
    const safeDesc = `"${e.description.replace(/"/g, '""')}"`;
    csv += `${e.date},${e.time},"${e.category}",${cur},${e.amount.toFixed(2)},${eur.toFixed(2)},${lat},${lon},${safeDesc}\n`;
  });

  const now        = new Date();
  const stamp      = String(now.getFullYear()) +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") + "_" +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0");
  const fileName   = "VacationExpenses_" + stamp + ".csv";
  const exportPath = fm.joinPath(fm.documentsDirectory(), fileName);
  fm.writeString(exportPath, csv);

  const confirm = new Alert();
  confirm.title   = "📤 Export ready!";
  confirm.message = entries.length + " entries saved to:\niCloud Drive / Scriptable /\n" + fileName;
  confirm.addAction("Done");
  await confirm.presentAlert();
}
