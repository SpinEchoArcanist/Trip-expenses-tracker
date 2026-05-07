// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: magic;
// VERSION 3.1 - 2026-05-07
// ===================================================================
//  EXPENSE QUICK LOG  -  ExpenseQuickLog.js
//  Small Home Screen widget - tap to log a new expense immediately
//  Reads from: iCloud Drive / Scriptable / expenses.json
//             iCloud Drive / Scriptable / expense_settings.json
//  Currency: Adaptive - today dominant currency, CHF sub-note
//  Third currency: configurable in expense_settings.json
//    (cur3Code, cur3Symbol, cur3Flag, cur3Name, chfToCur3)
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
  const defaults = {
    chfToEur:   1.09,
    chfToCur3:  175,
    cur3Code:   "JPY",
    cur3Symbol: "\u00A5",
    cur3Flag:   "\uD83C\uDDEF\uD83C\uDDF5",
    cur3Name:   "Japanese Yen",
  };
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
    const parsed = JSON.parse(fm.readString(dataPath));
    return Array.isArray(parsed) ? parsed : [];
  } catch(_) { return []; }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// CHF is the reference currency.
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

function fmtCur(amount, currency, s) {
  if (currency === "CHF") return "CHF " + amount.toFixed(2);
  if (currency === "EUR") return "\u20AC" + amount.toFixed(2);
  if (s && currency === s.cur3Code) {
    return s.chfToCur3 >= 10
      ? s.cur3Symbol + Math.round(amount)
      : s.cur3Symbol + amount.toFixed(2);
  }
  return amount.toFixed(2) + " " + currency;
}

// Today dominant currency — highest CHF-equivalent wins
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

// Sum entries natively in a given currency (CHF pivot)
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

function makeGradient(top, bot) {
  const g = new LinearGradient();
  g.colors    = [top, bot];
  g.locations = [0, 1];
  return g;
}

// ==================================================================
//  COMPUTE
// ==================================================================
const settings     = loadSettings();
const entries      = loadData();
const today        = todayStr();
const todayEntries = entries.filter(e => e.date === today && !e.ghost);
const countToday   = todayEntries.length;

// Dominant currency: today's if entries exist, else most recent past day, else EUR
let domCur;
if (todayEntries.length > 0) {
  domCur = dominantCurrency(todayEntries, settings);
} else {
  const pastDates = [...new Set(
    entries.filter(e => e.date !== today && !e.ghost).map(e => e.date)
  )].sort().reverse();
  if (pastDates.length > 0) {
    const prevEntries = entries.filter(e => e.date === pastDates[0] && !e.ghost);
    domCur = dominantCurrency(prevEntries, settings);
  } else {
    domCur = "EUR";
  }
}

const totalDisp = sumInCurrency(todayEntries, domCur, settings);
// Sub-note: always show CHF equivalent when dominant currency is not CHF
const totalChf  = sumInCurrency(todayEntries, "CHF", settings);

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

// Daily total in dominant currency — with CHF sub-note on same line
const totalRow = widget.addStack();
totalRow.layoutHorizontally();
totalRow.centerAlignContent();

const totalTxt = totalRow.addText(fmtCur(totalDisp, domCur, settings));
totalTxt.font               = Font.boldSystemFont(24);
totalTxt.textColor          = C_TODAY;
totalTxt.minimumScaleFactor = 0.6;

if (todayEntries.length > 0 && domCur !== "CHF") {
  totalRow.addSpacer(4);
  const subTxt = totalRow.addText("= CHF " + totalChf.toFixed(2));
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

// Present
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentSmall();
}
Script.complete();
