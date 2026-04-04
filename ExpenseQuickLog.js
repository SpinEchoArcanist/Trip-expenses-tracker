// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: magic;
// VERSION 2.1 - 2026-04-04
// ===================================================================
//  EXPENSE QUICK LOG  -  ExpenseQuickLog.js
//  Small Home Screen widget - tap to log a new expense immediately
//  Reads from: iCloud Drive / Scriptable / expenses.json
//             iCloud Drive / Scriptable / expense_settings.json
//  Currency: Adaptive - today dominant currency, EUR sub-note if CHF
// ===================================================================

const DATA_FILE     = "expenses.json";
const SETTINGS_FILE = "expense_settings.json";
const fm            = FileManager.iCloud();
const dataPath      = fm.joinPath(fm.documentsDirectory(), DATA_FILE);
const settingsPath  = fm.joinPath(fm.documentsDirectory(), SETTINGS_FILE);

const BG_TOP   = new Color("#0F1923");
const BG_BOT   = new Color("#1A2E3B");
const C_MUTED  = new Color("#8FA3B0");
const C_ACCENT = new Color("#FFD166");
const C_TODAY  = new Color("#06D6A0");

// ==================================================================
//  HELPERS
// ==================================================================
function loadSettings() {
  const defaults = { chfToEur: 1.09 };
  if (!fm.fileExists(settingsPath)) return defaults;
  try {
    fm.downloadFileFromiCloud(settingsPath);
    return Object.assign(defaults, JSON.parse(fm.readString(settingsPath)));
  } catch(_) { return defaults; }
}

function loadData() {
  if (!fm.fileExists(dataPath)) return [];
  try {
    fm.downloadFileFromiCloud(dataPath);
    return JSON.parse(fm.readString(dataPath));
  } catch(_) { return []; }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function toEur(amount, currency, rate) {
  return currency === "CHF" ? amount * rate : amount;
}

// Today dominant currency — CHF wins if its EUR-equivalent exceeds EUR total
function dominantCurrency(dayEntries, rate) {
  let eurSum = 0, chfSum = 0;
  dayEntries.forEach(e => {
    if ((e.currency || "EUR") === "CHF") chfSum += e.amount;
    else                                  eurSum += e.amount;
  });
  return (chfSum * rate) > eurSum ? "CHF" : "EUR";
}

function fmtCur(amount, currency) {
  return currency === "CHF" ? "CHF " + amount.toFixed(2) : "\u20AC" + amount.toFixed(2);
}

// Sum entries natively in a given currency (convert only the minority)
function sumInCurrency(dayEntries, cur, rate) {
  let total = 0;
  dayEntries.forEach(e => {
    const eCur = e.currency || "EUR";
    if (eCur === cur) total += e.amount;
    else if (cur === "CHF") total += e.amount * rate;
    else total += e.amount / rate;
  });
  return total;
}

function makeGradient(top, bot) {
  const g = new LinearGradient();
  g.colors    = [top, bot];
  g.locations = [0, 1];
  return g;
}

// ==================================================================
//  COMPUTE
// ==================================================================
const settings      = loadSettings();
const rate          = settings.chfToEur;
const entries       = loadData();
const today         = todayStr();
const todayEntries  = entries.filter(e => e.date === today);
const countToday    = todayEntries.length;

// Dominant currency: today's if entries exist, else most recent past day, else EUR
let domCur;
if (todayEntries.length > 0) {
  domCur = dominantCurrency(todayEntries, rate);
} else {
  const pastDates = [...new Set(entries.filter(e => e.date !== today).map(e => e.date))].sort().reverse();
  if (pastDates.length > 0) {
    const prevEntries = entries.filter(e => e.date === pastDates[0]);
    domCur = dominantCurrency(prevEntries, rate);
  } else {
    domCur = "EUR";
  }
}

const otherCur    = domCur === "CHF" ? "EUR" : "CHF";
const totalDisp   = sumInCurrency(todayEntries, domCur, rate);
const totalOther  = sumInCurrency(todayEntries, otherCur, rate);

// ==================================================================
//  BUILD WIDGET
// ==================================================================
const widget = new ListWidget();
widget.backgroundGradient = makeGradient(BG_TOP, BG_BOT);
widget.setPadding(14, 14, 14, 14);
widget.url = "scriptable:///run/ExpenseTracker?action=log";

// Top label
const topLabel = widget.addText("\u2708\uFE0F Today");
topLabel.font      = Font.boldSystemFont(11);
topLabel.textColor = C_MUTED;

widget.addSpacer(4);

// Daily total in dominant currency — with other-currency sub-note on same line
const totalRow = widget.addStack();
totalRow.layoutHorizontally();
totalRow.centerAlignContent();

const totalTxt = totalRow.addText(fmtCur(totalDisp, domCur));
totalTxt.font              = Font.boldSystemFont(24);
totalTxt.textColor         = C_TODAY;
totalTxt.minimumScaleFactor = 0.6;

if (todayEntries.length > 0) {
  totalRow.addSpacer(4);
  const subTxt = totalRow.addText("= " + fmtCur(totalOther, otherCur));
  subTxt.font      = Font.systemFont(9);
  subTxt.textColor = new Color("#8FA3B0", 0.85);
}

widget.addSpacer(2);

// Entry count
const countTxt = widget.addText(
  countToday === 0 ? "no entries" :
  countToday === 1 ? "1 entry"    :
  countToday + " entries"
);
countTxt.font      = Font.systemFont(10);
countTxt.textColor = C_MUTED;

widget.addSpacer();

// Big + button
const btnRow = widget.addStack();
btnRow.layoutHorizontally();
btnRow.centerAlignContent();
btnRow.addSpacer();

const btnBg = btnRow.addStack();
btnBg.size            = new Size(44, 44);
btnBg.cornerRadius    = 22;
btnBg.backgroundColor = new Color("#FFD166", 0.15);
btnBg.centerAlignContent();

const btnPlus = btnBg.addText("+");
btnPlus.font      = Font.boldSystemFont(28);
btnPlus.textColor = C_ACCENT;

btnRow.addSpacer();

widget.addSpacer(4);

// Tap hint
const hint = widget.addText("Tap to add");
hint.font      = Font.systemFont(9);
hint.textColor = new Color("#FFFFFF", 0.25);
hint.centerAlignText();

// -- Present -------------------------------------------------------
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentSmall();
}
Script.complete();
