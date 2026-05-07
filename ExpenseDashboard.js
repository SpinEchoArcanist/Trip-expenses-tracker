// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: magic;
// VERSION 3.3 - 2026-05-07
// ===================================================================
//  VACATION EXPENSE DASHBOARD  -  ExpenseDashboard.js
//  Large Home Screen widget - tap opens in-app dashboard
//  Reads from: iCloud Drive / Scriptable / expenses.json
//             iCloud Drive / Scriptable / expense_settings.json
//  Multi-currency: EUR, CHF, + configurable third currency
//  Third currency defined in expense_settings.json:
//    cur3Code, cur3Symbol, cur3Flag, cur3Name, chfToCur3
// ===================================================================

const DATA_FILE     = "expenses.json";
const SETTINGS_FILE = "expense_settings.json";
const fm            = FileManager.iCloud();
const dataPath      = fm.joinPath(fm.documentsDirectory(), DATA_FILE);
const settingsPath  = fm.joinPath(fm.documentsDirectory(), SETTINGS_FILE);

// Categories must match ExpenseTracker.js exactly
const CATEGORIES = [
  { label: "🍽️ Food",               short: "Food",       color: new Color("#E53935") },
  { label: "🛒 Grocery",            short: "Grocery",    color: new Color("#FB8C00") },
  { label: "🛍️ Shopping",           short: "Shopping",   color: new Color("#7B1FA2") },
  { label: "🚌 Transport",          short: "Transport",  color: new Color("#2E7D32") },
  { label: "🏛️ Visit / Activities", short: "Visits",     color: new Color("#1565C0") },
  { label: "🏨 Housing",             short: "Housing",    color: new Color("#00838F") },
];

const CAT_COLOR_MAP = {};
CATEGORIES.forEach(c => CAT_COLOR_MAP[c.label] = c.color);

const BG_TOP   = new Color("#0F1923");
const BG_BOT   = new Color("#1A2E3B");
const C_WHITE  = new Color("#FFFFFF");
const C_MUTED  = new Color("#8FA3B0");
const C_ACCENT = new Color("#FFD166");
const C_TODAY  = new Color("#06D6A0");
const C_AVG    = new Color("#A78BFA");

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

// CHF is the internal reference currency.
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

function dominantCurrency(dayEntries, s) {
  let chfSum = 0, eurSum = 0, cur3Sum = 0;
  dayEntries.forEach(e => {
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

function fmtDateShort(iso) {
  const parts  = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun",
                  "Jul","Aug","Sep","Oct","Nov","Dec"];
  return parts[2] + " " + months[parseInt(parts[1]) - 1];
}

function addDivider(container) {
  const d = container.addStack();
  d.size = new Size(0, 1);
  d.backgroundColor = new Color("#FFFFFF", 0.12);
}

function makeGradient(top, bot) {
  const g = new LinearGradient();
  g.colors    = [top, bot];
  g.locations = [0, 1];
  return g;
}

// ==================================================================
//  LOAD DATA + SETTINGS
// ==================================================================
const settings       = loadSettings();
const cur3Code       = settings.cur3Code;
const cur3Symbol     = settings.cur3Symbol;

const entries       = loadData();
const today         = todayStr();
const todayEntries  = entries.filter(e => e.date === today && !e.ghost);
const pastEntries   = entries.filter(e => e.date !== today && !e.ghost);
const activeEntries = entries.filter(e => !e.ghost);

const nPastDays = [...new Set(pastEntries.map(e => e.date))].length;

const todayDomCur   = dominantCurrency(todayEntries, settings);
const overallDomCur = dominantCurrency(activeEntries, settings);

const totalTodayChf  = todayEntries.reduce((s, e) => s + toCHF(e.amount, e.currency || "CHF", settings), 0);
const pastTotalChf   = pastEntries.reduce( (s, e) => s + toCHF(e.amount, e.currency || "CHF", settings), 0);
const totalAllChf    = totalTodayChf + pastTotalChf;
const avgPerDayChf   = nPastDays > 0 ? pastTotalChf / nPastDays : 0;

const catStats = {};
CATEGORIES.forEach(c => {
  catStats[c.label] = { dailyChf: 0, pastChf: 0, overallChf: 0, avgChf: 0 };
});
entries.filter(e => !e.ghost).forEach(e => {
  if (!catStats[e.category]) return;
  const chf = toCHF(e.amount, e.currency || "CHF", settings);
  catStats[e.category].overallChf += chf;
  if (e.date === today) catStats[e.category].dailyChf += chf;
  else                  catStats[e.category].pastChf  += chf;
});
CATEGORIES.forEach(c => {
  const s  = catStats[c.label];
  s.avgChf = nPastDays > 0 ? s.pastChf / nPastDays : 0;
});

// ==================================================================
//  BUILD WIDGET
// ==================================================================
const widget = new ListWidget();
widget.backgroundGradient = makeGradient(BG_TOP, BG_BOT);
widget.setPadding(16, 14, 12, 14);
widget.url = "scriptable:///run/ExpenseTracker?action=dashboard";

// Header
const header = widget.addStack();
header.layoutHorizontally();
header.centerAlignContent();
const titleTxt = header.addText("\u2708\uFE0F  Vacation Expenses");
titleTxt.font      = Font.boldSystemFont(13);
titleTxt.textColor = C_MUTED;
header.addSpacer();
const dateTxt = header.addText(fmtDateShort(today));
dateTxt.font      = Font.systemFont(11);
dateTxt.textColor = C_MUTED;

widget.addSpacer(6);

// Grand totals row
function grandTotalBlock(parent, label, mainVal, subVal, color) {
  const block = parent.addStack();
  block.layoutVertically();
  const lbl = block.addText(label);
  lbl.font      = Font.boldSystemFont(9);
  lbl.textColor = C_MUTED;
  block.addSpacer(2);
  const val = block.addText(mainVal);
  val.font               = Font.boldSystemFont(18);
  val.textColor          = color;
  val.minimumScaleFactor = 0.55;
  val.lineLimit          = 1;
  if (subVal) {
    block.addSpacer(1);
    const sub = block.addText(subVal);
    sub.font      = Font.systemFont(9);
    sub.textColor = new Color("#8FA3B0", 0.85);
  }
}

function vsep(parent) {
  parent.addSpacer(10);
  const s = parent.addStack();
  s.size            = new Size(1, 36);
  s.backgroundColor = new Color("#FFFFFF", 0.15);
  parent.addSpacer(10);
}

const totalsRow = widget.addStack();
totalsRow.layoutHorizontally();
totalsRow.centerAlignContent();

// TODAY
const todayDispVal = fromCHF(totalTodayChf, todayDomCur, settings);
const todaySubNote = (todayDomCur !== "CHF" && totalTodayChf > 0)
  ? "= CHF " + totalTodayChf.toFixed(2)
  : null;
grandTotalBlock(totalsRow, "TODAY",
  fmtCur(todayDispVal, todayDomCur, settings), todaySubNote, C_TODAY);

vsep(totalsRow);

// AVG/DAY
grandTotalBlock(totalsRow, "AVG/DAY (" + overallDomCur + ")",
  nPastDays > 0 ? fmtCur(fromCHF(avgPerDayChf, overallDomCur, settings), overallDomCur, settings) : "-",
  null, C_AVG);

vsep(totalsRow);

// OVERALL
grandTotalBlock(totalsRow, "OVERALL (" + overallDomCur + ")",
  fmtCur(fromCHF(totalAllChf, overallDomCur, settings), overallDomCur, settings),
  null, C_ACCENT);

totalsRow.addSpacer();

widget.addSpacer(6);

// Rate note — shows third currency code dynamically
const rateNote = widget.addText(
  "1 CHF = " + settings.chfToEur + " EUR  \u00B7  1 CHF = " + settings.chfToCur3 + " " + settings.cur3Code + "  \u00B7  Adaptive"
);
rateNote.font      = Font.systemFont(8);
rateNote.textColor = new Color("#8FA3B0", 0.5);

widget.addSpacer(6);
addDivider(widget);
widget.addSpacer(6);

// Category table header
const catHeader = widget.addStack();
catHeader.layoutHorizontally();
catHeader.centerAlignContent();

const chName = catHeader.addText("CATEGORY");
chName.font      = Font.boldSystemFont(8);
chName.textColor = C_MUTED;
catHeader.addSpacer();

const COL_W = 52;
[
  { text: "TODAY",   color: C_TODAY  },
  { text: "AVG/DAY", color: C_AVG    },
  { text: "TOTAL",   color: C_ACCENT },
].forEach((h, i, arr) => {
  const s = catHeader.addStack();
  s.size = new Size(COL_W, 12);
  const t = s.addText(h.text);
  t.font         = Font.boldSystemFont(8);
  t.textColor    = h.color;
  t.rightAlignText();
  if (i < arr.length - 1) catHeader.addSpacer(4);
});

widget.addSpacer(4);

// Category rows
CATEGORIES.forEach(cat => {
  const s   = catStats[cat.label];
  const pct = totalAllChf > 0 ? s.overallChf / totalAllChf : 0;

  const row = widget.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();

  const dot = row.addText("\u25CF ");
  dot.font      = Font.boldSystemFont(9);
  dot.textColor = cat.color;
  const name = row.addText(cat.short);
  name.font      = Font.systemFont(10);
  name.textColor = C_MUTED;
  name.lineLimit = 1;

  row.addSpacer();

  const barBg = row.addStack();
  barBg.size            = new Size(28, 3);
  barBg.cornerRadius    = 2;
  barBg.backgroundColor = new Color("#FFFFFF", 0.08);
  const barFill = barBg.addStack();
  barFill.size            = new Size(Math.max(2, Math.round(pct * 28)), 3);
  barFill.cornerRadius    = 2;
  barFill.backgroundColor = cat.color;
  barBg.addSpacer();
  row.addSpacer(6);

  // TODAY — today's dominant currency
  const todayCatAmt = fromCHF(s.dailyChf, todayDomCur, settings);
  const col1 = row.addStack();
  col1.size = new Size(COL_W, 14);
  const t1 = col1.addText(s.dailyChf > 0 ? fmtCur(todayCatAmt, todayDomCur, settings) : "-");
  t1.font               = Font.boldSystemFont(10);
  t1.textColor          = s.dailyChf > 0 ? C_TODAY : new Color("#FFFFFF", 0.2);
  t1.rightAlignText();
  t1.minimumScaleFactor = 0.6;
  row.addSpacer(4);

  // AVG/DAY — overallDomCur
  const avgCatAmt = fromCHF(s.avgChf, overallDomCur, settings);
  const col2 = row.addStack();
  col2.size = new Size(COL_W, 14);
  const t2 = col2.addText((nPastDays > 0 && s.avgChf > 0) ? fmtCur(avgCatAmt, overallDomCur, settings) : "-");
  t2.font               = Font.boldSystemFont(10);
  t2.textColor          = (nPastDays > 0 && s.avgChf > 0) ? C_AVG : new Color("#FFFFFF", 0.2);
  t2.rightAlignText();
  t2.minimumScaleFactor = 0.6;
  row.addSpacer(4);

  // TOTAL — overallDomCur
  const totalCatAmt = fromCHF(s.overallChf, overallDomCur, settings);
  const col3 = row.addStack();
  col3.size = new Size(COL_W, 14);
  const t3 = col3.addText(fmtCur(totalCatAmt, overallDomCur, settings));
  t3.font               = Font.boldSystemFont(10);
  t3.textColor          = C_ACCENT;
  t3.rightAlignText();
  t3.minimumScaleFactor = 0.6;

  widget.addSpacer(5);
});

widget.addSpacer(4);
addDivider(widget);
widget.addSpacer(6);

// Today's entries list
const secLabel = widget.addText(
  todayEntries.length > 0
    ? "TODAY'S ENTRIES  (" + todayEntries.length + ")"
    : "TODAY'S ENTRIES"
);
secLabel.font      = Font.boldSystemFont(9);
secLabel.textColor = C_MUTED;
widget.addSpacer(4);

if (todayEntries.length === 0) {
  const empty = widget.addText("No entries yet today");
  empty.font      = Font.systemFont(11);
  empty.textColor = new Color("#FFFFFF", 0.3);
} else {
  [...todayEntries].reverse().forEach(e => {
    const row = widget.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();

    const cdot = row.addText("\u25CF ");
    cdot.font      = Font.boldSystemFont(8);
    cdot.textColor = CAT_COLOR_MAP[e.category] || C_MUTED;

    const timeT = row.addText(e.time + "  ");
    timeT.font      = Font.systemFont(10);
    timeT.textColor = C_MUTED;

    const descT = row.addText(e.description);
    descT.font      = Font.systemFont(10);
    descT.textColor = C_WHITE;
    descT.lineLimit = 1;

    row.addSpacer();

    const cur  = e.currency || "EUR";
    const amtT = row.addText(fmtCur(e.amount, cur, settings));
    amtT.font               = Font.boldSystemFont(10);
    amtT.textColor          = C_ACCENT;
    amtT.minimumScaleFactor = 0.8;

    widget.addSpacer(3);
  });
}

// Footer
widget.addSpacer();
const hint = widget.addText("Tap to open dashboard");
hint.font      = Font.systemFont(9);
hint.textColor = new Color("#FFFFFF", 0.25);
hint.rightAlignText();

// Present
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentLarge();
}
Script.complete();
