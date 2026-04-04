// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: magic;
// VERSION 2.1 - 2026-04-04
// ===================================================================
//  VACATION EXPENSE DASHBOARD  -  ExpenseDashboard.js
//  Large Home Screen widget - tap opens in-app dashboard
//  Reads from: iCloud Drive / Scriptable / expenses.json
//             iCloud Drive / Scriptable / expense_settings.json
//  Multi-currency: mirrors ADAPTIVE display rules from ExpenseTracker
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
  const defaults = { chfToEur: 1.09, adaptiveAvgCur: "EUR" };
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

// Convert any amount to EUR using the exchange rate
function toEur(amount, currency, rate) {
  return currency === "CHF" ? amount * rate : amount;
}

// Convert a EUR-equivalent amount into a target display currency
function fromEur(eurAmount, currency, rate) {
  return currency === "CHF" ? eurAmount / rate : eurAmount;
}

// Format an amount with its currency symbol (ASCII-safe euro sign)
function fmtCur(amount, currency) {
  return currency === "CHF"
    ? "CHF " + amount.toFixed(2)
    : "\u20AC" + amount.toFixed(2);
}

// Which currency dominates a set of entries (by EUR-equivalent value)
function dominantCurrency(dayEntries, rate) {
  let eurSum = 0, chfSum = 0;
  dayEntries.forEach(e => {
    const cur = e.currency || "EUR";
    if (cur === "CHF") chfSum += e.amount;
    else               eurSum += e.amount;
  });
  return (chfSum * rate) > eurSum ? "CHF" : "EUR";
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
const rate           = settings.chfToEur;
const adaptiveAvgCur = settings.adaptiveAvgCur || "EUR";

const entries      = loadData();
const today        = todayStr();
const todayEntries = entries.filter(e => e.date === today);
const pastEntries  = entries.filter(e => e.date !== today);

// Unique past days for average (excludes today)
const nPastDays = [...new Set(pastEntries.map(e => e.date))].length;

// Today's dominant currency - drives TODAY block and category TODAY column
const todayDomCur = dominantCurrency(todayEntries, rate);

// All totals stored in EUR; converted to display currency at render time
const totalTodayEur   = todayEntries.reduce((s, e) => s + toEur(e.amount, e.currency || "EUR", rate), 0);
const pastTotalEur    = pastEntries.reduce( (s, e) => s + toEur(e.amount, e.currency || "EUR", rate), 0);
const totalAllEur     = totalTodayEur + pastTotalEur;
const avgPerDayEur    = nPastDays > 0 ? pastTotalEur / nPastDays : 0;

// Per-category EUR stats
const catStats = {};
CATEGORIES.forEach(c => {
  catStats[c.label] = { dailyEur: 0, pastEur: 0, overallEur: 0, avgEur: 0 };
});
entries.forEach(e => {
  if (!catStats[e.category]) return;
  const eur = toEur(e.amount, e.currency || "EUR", rate);
  catStats[e.category].overallEur += eur;
  if (e.date === today) catStats[e.category].dailyEur += eur;
  else                  catStats[e.category].pastEur  += eur;
});
CATEGORIES.forEach(c => {
  const s  = catStats[c.label];
  s.avgEur = nPastDays > 0 ? s.pastEur / nPastDays : 0;
});

// ==================================================================
//  BUILD WIDGET
// ==================================================================
const widget = new ListWidget();
widget.backgroundGradient = makeGradient(BG_TOP, BG_BOT);
widget.setPadding(16, 14, 12, 14);
widget.url = "scriptable:///run/ExpenseTracker?action=dashboard";

// ── Header ────────────────────────────────────────────────────────
const header = widget.addStack();
header.layoutHorizontally();
header.centerAlignContent();
const titleTxt = header.addText("\u2708\uFE0F  Vacation Expenses");
titleTxt.font      = Font.boldSystemFont(13);
titleTxt.textColor = C_MUTED;
header.addSpacer();
// Show date + mode hint
const dateTxt = header.addText(fmtDateShort(today));
dateTxt.font      = Font.systemFont(11);
dateTxt.textColor = C_MUTED;

widget.addSpacer(6);

// ── Grand totals row ──────────────────────────────────────────────
//   TODAY   : today's dominant currency; CHF-dominant adds EUR sub-note
//   AVG/DAY : adaptiveAvgCur (from settings)
//   OVERALL : adaptiveAvgCur (from settings)

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
const todayDispVal = fromEur(totalTodayEur, todayDomCur, rate);
const todaySubNote = (todayDomCur === "CHF" && totalTodayEur > 0)
  ? "= \u20AC" + totalTodayEur.toFixed(2)
  : null;
grandTotalBlock(totalsRow, "TODAY",
  fmtCur(todayDispVal, todayDomCur), todaySubNote, C_TODAY);

vsep(totalsRow);

// AVG/DAY
grandTotalBlock(totalsRow, "AVG/DAY (" + adaptiveAvgCur + ")",
  nPastDays > 0 ? fmtCur(fromEur(avgPerDayEur, adaptiveAvgCur, rate), adaptiveAvgCur) : "-",
  null, C_AVG);

vsep(totalsRow);

// OVERALL
grandTotalBlock(totalsRow, "OVERALL (" + adaptiveAvgCur + ")",
  fmtCur(fromEur(totalAllEur, adaptiveAvgCur, rate), adaptiveAvgCur),
  null, C_ACCENT);

totalsRow.addSpacer();

widget.addSpacer(6);

// Rate note
const rateNote = widget.addText("1 CHF = " + rate + " EUR  \u00B7  Adaptive");
rateNote.font      = Font.systemFont(8);
rateNote.textColor = new Color("#8FA3B0", 0.5);

widget.addSpacer(6);
addDivider(widget);
widget.addSpacer(6);

// ── Category table header ─────────────────────────────────────────
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

// ── Category rows ─────────────────────────────────────────────────
//   TODAY   : today's dominant currency  (matches dashboard adaptive rule)
//   AVG/DAY : adaptiveAvgCur
//   TOTAL   : adaptiveAvgCur
CATEGORIES.forEach(cat => {
  const s   = catStats[cat.label];
  const pct = totalAllEur > 0 ? s.overallEur / totalAllEur : 0;

  const row = widget.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();

  // Dot + name
  const dot = row.addText("\u25CF ");
  dot.font      = Font.boldSystemFont(9);
  dot.textColor = cat.color;
  const name = row.addText(cat.short);
  name.font      = Font.systemFont(10);
  name.textColor = C_MUTED;
  name.lineLimit = 1;

  row.addSpacer();

  // Mini bar
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
  const todayCatAmt = fromEur(s.dailyEur, todayDomCur, rate);
  const col1 = row.addStack();
  col1.size = new Size(COL_W, 14);
  const t1 = col1.addText(s.dailyEur > 0 ? fmtCur(todayCatAmt, todayDomCur) : "-");
  t1.font              = Font.boldSystemFont(10);
  t1.textColor         = s.dailyEur > 0 ? C_TODAY : new Color("#FFFFFF", 0.2);
  t1.rightAlignText();
  t1.minimumScaleFactor = 0.6;
  row.addSpacer(4);

  // AVG/DAY — adaptiveAvgCur
  const avgCatAmt = fromEur(s.avgEur, adaptiveAvgCur, rate);
  const col2 = row.addStack();
  col2.size = new Size(COL_W, 14);
  const t2 = col2.addText((nPastDays > 0 && s.avgEur > 0) ? fmtCur(avgCatAmt, adaptiveAvgCur) : "-");
  t2.font              = Font.boldSystemFont(10);
  t2.textColor         = (nPastDays > 0 && s.avgEur > 0) ? C_AVG : new Color("#FFFFFF", 0.2);
  t2.rightAlignText();
  t2.minimumScaleFactor = 0.6;
  row.addSpacer(4);

  // TOTAL — adaptiveAvgCur
  const totalCatAmt = fromEur(s.overallEur, adaptiveAvgCur, rate);
  const col3 = row.addStack();
  col3.size = new Size(COL_W, 14);
  const t3 = col3.addText(fmtCur(totalCatAmt, adaptiveAvgCur));
  t3.font              = Font.boldSystemFont(10);
  t3.textColor         = C_ACCENT;
  t3.rightAlignText();
  t3.minimumScaleFactor = 0.6;

  widget.addSpacer(5);
});

widget.addSpacer(4);
addDivider(widget);
widget.addSpacer(6);

// ── Today's entries list ──────────────────────────────────────────
//   Amounts shown in NATIVE currency — never converted.
//   Matches the ALL ENTRIES table behaviour in the main dashboard.
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

    // Native currency — always original, never converted
    const cur   = e.currency || "EUR";
    const amtT  = row.addText(fmtCur(e.amount, cur));
    amtT.font              = Font.boldSystemFont(10);
    amtT.textColor         = C_ACCENT;
    amtT.minimumScaleFactor = 0.8;

    widget.addSpacer(3);
  });
}

// ── Footer ────────────────────────────────────────────────────────
widget.addSpacer();
const hint = widget.addText("Tap to open dashboard");
hint.font      = Font.systemFont(9);
hint.textColor = new Color("#FFFFFF", 0.25);
hint.rightAlignText();

// -- Present -------------------------------------------------------
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentLarge();
}
Script.complete();
