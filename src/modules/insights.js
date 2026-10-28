/**
 * Insights: day / week / month / 6-month views of the measurements stored on the
 * device, and what the Air Coach did with them.
 *
 * Ratings, risks, phases and days follow the firmware so the app and the device
 * agree:
 *   day_analysis.cpp  — Good/Fair/Poor/Bad per part of the day, schedule days
 *   schedule.cpp      — weekday / weekend plans, the phase at a time
 *   air_coach.cpp     — allergy / infection / fatigue / focus risk levels
 *   myday_screen.cpp  — tile order and the tip
 * A night's sleep belongs to the day you wake up into (Fri 23:00 – Sat 07:00 is
 * Saturday's sleep).
 *
 * All days are summarised once when data or the schedule changes (HistoryIndex),
 * so moving between views over six months of data stays instant.
 */

import { t, lang, locale } from '../i18n.js';

// ─── Parts of the day, levels, metrics ──────────────────────────────────────
// Phase index = firmware Schedule::Phase - 1
export const PHASES = [
  { key: 'wake', name: t('Wake'), icon: 'bi-sunrise', color: '#f2b632' },
  { key: 'focus', name: t('Focus'), icon: 'bi-laptop', color: '#3a8dff' },
  { key: 'rest', name: t('Rest'), icon: 'bi-cup-hot', color: '#20a671' },
  { key: 'sleep', name: t('Sleep'), icon: 'bi-moon-stars', color: '#6f42c1' },
];
// Display order of a day, as on the device: sleep, wake, focus, rest
export const DAY_ORDER = [3, 0, 1, 2];

export const LEVELS = [
  { name: t('Good'), color: '#2fb380' },
  { name: t('Fair'), color: '#f2c94c' },
  { name: t('Poor'), color: '#f2994a' },
  { name: t('Bad'), color: '#e5484d' },
];
const DRIVER_NAMES = ['CO₂', 'PM2.5', 'VOC'];
const CO2_TIPS = ['Air the room after waking up', 'Air the room before focus time', 'Open a window in the evening', 'Air the room before bed'].map((tip) => t(tip));

export const METRICS = {
  // limits: [value, level reached above it], drawn as dashed lines
  co2: { label: 'CO₂', unit: 'ppm', digits: 0, limits: [[800, 1], [1000, 2], [1400, 3]] },
  pm25: { label: 'PM2.5', unit: 'µg/m³', digits: 1, limits: [[12, 1], [35, 2], [55, 3]] },
  voc: { label: t('VOC index'), unit: '', digits: 0, limits: [[150, 1], [200, 3]] },
  temp: { label: t('Temperature'), unit: '°C', digits: 1 },
  hum: { label: t('Humidity'), unit: '%', digits: 0 },
};
const METRIC_KEYS = Object.keys(METRICS);

// ─── Air quality rating (day_analysis.cpp) ──────────────────────────────────
const co2Level = (ppm) => (ppm <= 800 ? 0 : ppm <= 1000 ? 1 : ppm <= 1400 ? 2 : 3);
const pmLevel = (ugm3) => (ugm3 <= 12 ? 0 : ugm3 <= 35 ? 1 : ugm3 <= 55 ? 2 : 3);
const vocLevel = (index) => (index <= 150 ? 0 : index <= 200 ? 1 : 3);

/** Worst of the three; voc < 0 means no VOC data. Driver: 0 CO2, 1 PM, 2 VOC. */
export function rate(co2, pm25, voc) {
  let level = co2Level(co2);
  let driver = 0;
  const pm = pmLevel(pm25);
  if (pm > level) { level = pm; driver = 1; }
  if (voc >= 0) {
    const v = vocLevel(voc);
    if (v > level) { level = v; driver = 2; }
  }
  return { level, driver };
}

// ─── Priorities and their risk levels (air_coach.cpp) ───────────────────────
// Index = bit / number used by $SET_PRIORITY (0 allergy, 1 infection, 2 fatigue, 3 focus)
export const PRIORITIES = [
  { key: 'allergy', name: t('Allergy'), icon: 'bi-flower1', color: '#d9534f', exposure: t('fine dust, damp air or irritants') },
  { key: 'infection', name: t('Infection'), icon: 'bi-shield-plus', color: '#0d6efd', exposure: t('stale, already-breathed air') },
  { key: 'fatigue', name: t('Fatigue & migraine'), icon: 'bi-lightning-charge', color: '#fd7e14', exposure: t('stale air, heat or irritants') },
  { key: 'focus', name: t('Focus & productivity'), icon: 'bi-bullseye', color: '#6f42c1', exposure: t('stale air or discomfort while working') },
];

const band = (v, l1, l2, l3) => (v > l3 ? 3 : v > l2 ? 2 : v > l1 ? 1 : 0);

/** Risk level 0-3 for one sample, as the firmware computes it. */
function riskLevels(s) {
  const voc = s.voc > 0 ? s.voc : 0;
  const rh = Number.isFinite(s.hum) ? s.hum : 45;
  const temp = Number.isFinite(s.temp) ? s.temp : 22;
  const pm10 = Number.isFinite(s.pm10) ? s.pm10 : 0;

  let allergy = Math.max(band(s.pm25, 12, 25, 35), band(pm10, 45, 100, 150), band(rh, 50, 60, 70));
  if (voc) allergy = Math.max(allergy, band(voc, 150, 200, 300));

  let infection = band(s.co2, 800, 1000, 1400);
  if ((rh < 40 || s.pm25 > 35) && infection < 3) infection++;

  let fatigue = band(s.co2, 1000, 1400, 2000);
  if (voc) fatigue = Math.max(fatigue, voc > 250 ? 2 : voc > 150 ? 1 : 0);
  fatigue = Math.max(fatigue, s.pm25 > 55 ? 2 : s.pm25 > 35 ? 1 : 0, temp > 28 ? 2 : temp > 26 ? 1 : 0, rh < 30 ? 1 : 0);

  let focus = band(s.co2, 800, 1000, 1400);
  if (voc) focus = Math.max(focus, voc > 250 ? 2 : voc > 150 ? 1 : 0);
  focus = Math.max(focus, temp > 27 ? 2 : (temp > 25 || temp < 20) ? 1 : 0);

  return [allergy, infection, fatigue, focus];
}

// ─── Air Coach actions (docs/air_coach_model.md) ────────────────────────────
// risks: the priorities an action serves. Instant actions follow the model's table;
// for coming-up actions (S, W, F, R) the grouping is the app's, from what each targets.
export const ACTIONS = {
  I1: { text: t('Open a window for 10 min'), kind: 'Instant', risks: [1, 2, 3] },
  I2: { text: t('Air across the room 5 min'), kind: 'Instant', risks: [0, 1, 2, 3] },
  I3: { text: t('Take a 5-min fresh-air break'), kind: 'Instant', risks: [2, 3] },
  I4: { text: t('Close windows, run a purifier'), kind: 'Instant', risks: [0, 2] },
  I5: { text: t('Damp-dust and vacuum'), kind: 'Instant', risks: [0] },
  I6: { text: t('No sprays or scents; ventilate'), kind: 'Instant', risks: [0, 2] },
  I7: { text: t('Lower humidity: ventilate, dehumidify'), kind: 'Instant', risks: [0] },
  I8: { text: t('Raise humidity: humidifier'), kind: 'Instant', risks: [1, 2] },
  I9: { text: t('Cool the room'), kind: 'Instant', risks: [2, 3] },
  I10: { text: t('Drink a glass of water'), kind: 'Instant', risks: [2] },
  S1: { text: t('Air the bedroom 15 min before bed'), kind: 'Before sleep', risks: [1, 2, 3] },
  S2: { text: t('Leave the door or a window ajar tonight'), kind: 'Before sleep', risks: [1, 2, 3] },
  S3: { text: t('Cool the bedroom to 24 °C or less'), kind: 'Before sleep', risks: [2] },
  S4: { text: t('Run the purifier, windows closed'), kind: 'Before sleep', risks: [0, 2] },
  S5: { text: t('Ventilate bathroom steam, dehumidify'), kind: 'Before sleep', risks: [0] },
  W: { text: t('Morning plan after the night'), kind: 'Morning', risks: [0, 1, 2, 3] },
  F1: { text: t('Air the room before you start'), kind: 'Before focus', risks: [1, 3] },
  F2: { text: t('Air 5 min every 45 min today'), kind: 'Before focus', risks: [1, 3] },
  F3: { text: t('Set the room to 21–23 °C'), kind: 'Before focus', risks: [3] },
  F4: { text: t('No candles or sprays while you work'), kind: 'Before focus', risks: [2, 3] },
  R1: { text: t('Use the hood and ventilate while cooking'), kind: 'Before rest', risks: [0, 2] },
  R2: { text: t('A short walk outside'), kind: 'Before rest', risks: [2, 3] },
  R3: { text: t('Air the room after dinner'), kind: 'Before rest', risks: [1, 2] },
};
const actionInfo = (code) => ACTIONS[code] || { text: code, kind: '', risks: [] };

/** Parse $CARE_LOG rows ("2026-10-17 22:42,S4,pm25,2,none,pending") into entries. */
export function parseCareLog(lines) {
  const entries = [];
  for (const line of lines) {
    const [time, action, driver, level, answer, outcome] = line.split(',').map(f => f.trim());
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(time || '');
    if (!m || !action) continue;
    entries.push({
      t: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime(),
      action, driver, level: Number(level) || 0, answer, outcome,
    });
  }
  return entries;
}

/** Merge new log entries into old ones; the same card (time + action) takes its newest answer and outcome. */
export function mergeCareLog(oldEntries, newEntries) {
  const byKey = new Map();
  for (const e of [...(oldEntries || []), ...newEntries]) byKey.set(`${e.t}|${e.action}`, e);
  return [...byKey.values()].sort((a, b) => a.t - b.t);
}

// ─── Values and statistics ──────────────────────────────────────────────────
function metricValue(sample, metric) {
  const v = sample[metric];
  if (v === undefined || v === null || Number.isNaN(v)) return null;
  if (metric === 'voc' && v <= 0) return null;  // VOC index 0 = no data
  return v;
}

function formatMetric(value, metric, withUnit = true) {
  if (value === null || value === undefined) return '—';
  const m = METRICS[metric];
  const text = value.toFixed(m.digits);
  return withUnit && m.unit ? `${text} ${m.unit}` : text;
}

class Stats {
  constructor() {
    this.n = 0; this.co2 = 0; this.pm = 0; this.voc = 0; this.vocN = 0;
    this.above1000 = 0; this.good = 0;
  }
  add(s) {
    this.n++;
    this.co2 += s.co2;
    this.pm += s.pm25;
    if (s.voc > 0) { this.voc += s.voc; this.vocN++; }
    if (s.co2 > 1000) this.above1000++;
    if (rate(s.co2, s.pm25, s.voc > 0 ? s.voc : -1).level === 0) this.good++;
  }
  merge(o) {
    this.n += o.n; this.co2 += o.co2; this.pm += o.pm; this.voc += o.voc; this.vocN += o.vocN;
    this.above1000 += o.above1000; this.good += o.good;
  }
  get empty() { return this.n === 0; }
  get avgCo2() { return this.n ? this.co2 / this.n : 0; }
  get avgPm() { return this.n ? this.pm / this.n : 0; }
  get avgVoc() { return this.vocN ? this.voc / this.vocN : -1; }
  rating() { return rate(this.avgCo2, this.avgPm, this.avgVoc); }
  level() { return this.empty ? null : this.rating().level; }
  driverValue(driver) {
    return driver === 1 ? `${this.avgPm.toFixed(0)} µg/m³` : driver === 2 ? t('index {value}', { value: this.avgVoc.toFixed(0) }) : `${this.avgCo2.toFixed(0)} ppm`;
  }
}

/** Running min / sum / max of every metric. */
class MetricAcc {
  constructor() { for (const k of METRIC_KEYS) this[k] = { n: 0, sum: 0, min: Infinity, max: -Infinity }; }
  add(s) {
    for (const k of METRIC_KEYS) {
      const v = metricValue(s, k);
      if (v === null) continue;
      const a = this[k];
      a.n++; a.sum += v;
      if (v < a.min) a.min = v;
      if (v > a.max) a.max = v;
    }
  }
  merge(o) {
    for (const k of METRIC_KEYS) {
      const a = this[k]; const b = o[k];
      a.n += b.n; a.sum += b.sum; a.min = Math.min(a.min, b.min); a.max = Math.max(a.max, b.max);
    }
  }
  get(k) { const a = this[k]; return a.n ? { n: a.n, avg: a.sum / a.n, min: a.min, max: a.max } : null; }
}

/** Everything known about a period: air rating, metrics, risk exposure, coach log. */
class PeriodAgg {
  constructor() {
    this.stats = new Stats();
    this.phases = PHASES.map(() => new Stats());
    this.metrics = new MetricAcc();
    this.phaseMetrics = PHASES.map(() => new MetricAcc());
    this.riskHigh = [0, 0, 0, 0];  // samples with raised exposure (risk level >= 1)
    this.riskN = [0, 0, 0, 0];
    this.care = [];
  }
  merge(o) {
    this.stats.merge(o.stats);
    this.phases.forEach((p, i) => p.merge(o.phases[i]));
    this.metrics.merge(o.metrics);
    this.phaseMetrics.forEach((p, i) => p.merge(o.phaseMetrics[i]));
    for (let i = 0; i < 4; i++) { this.riskHigh[i] += o.riskHigh[i]; this.riskN[i] += o.riskN[i]; }
    this.care.push(...o.care);
  }
}

// ─── History parsing ────────────────────────────────────────────────────────
/** Turn device columns + rows into samples sorted by time (records without a valid clock are skipped). */
export function samplesFromHistory(columns, rows) {
  const col = (name) => columns.indexOf(name);
  const idx = {
    time: col('time_utc'), valid: col('time_valid'), co2: col('co2_ppm'), pm1: col('pm1'), pm25: col('pm25'),
    pm10: col('pm10'), voc: col('voc_index'), temp: col('temp_c'), hum: col('hum_pct'),
    pressure: col('pressure_hpa'), aqi: col('aqi'), battery: col('battery_pct'),
  };
  if (idx.time < 0) return [];
  const num = (row, i) => (i < 0 || row[i] === '' || row[i] === undefined ? NaN : Number(row[i]));
  const samples = [];
  for (const row of rows) {
    if (idx.valid >= 0 && Number(row[idx.valid]) !== 1) continue;
    const t = num(row, idx.time) * 1000;
    if (!Number.isFinite(t)) continue;
    samples.push({
      t,
      co2: num(row, idx.co2) || 0,
      pm1: num(row, idx.pm1),
      pm25: num(row, idx.pm25) || 0,
      pm10: num(row, idx.pm10),
      voc: num(row, idx.voc) || 0,
      temp: num(row, idx.temp),
      hum: num(row, idx.hum),
      pressure: num(row, idx.pressure),
      aqi: num(row, idx.aqi),
      battery: num(row, idx.battery),
    });
  }
  samples.sort((a, b) => a.t - b.t);
  return samples;
}

/** Split one CSV line, honouring "quoted, fields". */
function splitCsv(line) {
  const out = [];
  let cur = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = false; else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Read a file people import: an Odak backup (.json with measurements, coach log and
 * plan), or a CSV / JSON history saved by this app. Returns { columns, rows, care, plan }.
 */
export function parseImportFile(text, fileName) {
  if (fileName.toLowerCase().endsWith('.json')) {
    const data = JSON.parse(text);
    if (data && data.format === 'odak-backup') {
      return { columns: data.columns || [], rows: data.rows || [], care: data.care || [], plan: data.plan || null };
    }
    const records = Array.isArray(data) ? data : [];
    if (records.length === 0) return { columns: [], rows: [], care: [] };
    const columns = Object.keys(records[0]);
    return { columns, rows: records.map(r => columns.map(c => (r[c] === undefined ? '' : String(r[c])))), care: [] };
  }
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return { columns: [], rows: [], care: [] };
  return { columns: splitCsv(lines[0]).map(c => c.trim()), rows: lines.slice(1).map(splitCsv), care: [] };
}

// ─── Dates and schedule days ────────────────────────────────────────────────
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));  // Monday
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmt = (d, opts) => d.toLocaleDateString(locale, opts);
/** "67%" in English, "%67" in Turkish. */
const percent = (n) => (lang === 'tr' ? `%${n}` : `${n}%`);
const hhmm = (minutes) => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Weekday or weekend plan for a local date (Sat/Sun = weekend), like Schedule::profileAt. */
export function profileFor(date) {
  const day = date.getDay();
  return day === 0 || day === 6 ? 'weekend' : 'weekday';
}

/** Phase that started most recently, going back around the clock. */
function phaseInPlan(plan, minuteOfDay) {
  let best = 0;
  let bestBack = 1440;
  for (let i = 0; i < 4; i++) {
    const back = (minuteOfDay - plan[i] + 1440) % 1440;
    if (back < bestBack) { bestBack = back; best = i; }
  }
  return best;
}

export function phaseAt(date, schedule) {
  const plan = schedule && schedule[profileFor(date)];
  if (!plan) return -1;
  return phaseInPlan(plan, date.getHours() * 60 + date.getMinutes());
}

/**
 * The schedule day a moment belongs to (day_analysis.cpp scheduleDay): sleep belongs
 * to the day you wake up into; awake after midnight but before waking (a late rest)
 * still belongs to the day before. Without a schedule: the calendar day.
 */
export function scheduleDay(t, schedule) {
  const d = new Date(t);
  const day = startOfDay(d);
  if (!schedule) return day;
  const plan = schedule[profileFor(day)];
  const wake = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, plan[0]).getTime();
  if (phaseAt(d, schedule) === 3) return wake > t ? day : addDays(day, 1);
  return wake <= t ? day : addDays(day, -1);
}

/** First and last moment (ms) of a schedule day. */
function dayWindow(day, schedule) {
  if (!schedule) return [day.getTime(), addDays(day, 1).getTime()];
  const key = isoDate(day);
  const plan = schedule[profileFor(day)];
  const wake = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, plan[0]).getTime();
  const step = 60000;
  let start = wake;
  while (start - step > wake - 30 * 3600000 && isoDate(scheduleDay(start - step, schedule)) === key) start -= step;
  let end = wake;
  while (end < wake + 30 * 3600000 && isoDate(scheduleDay(end, schedule)) === key) end += step;
  return [start, end];
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ─── Index: one summary per schedule day ────────────────────────────────────
export class HistoryIndex {
  constructor(samples, care, schedule) {
    this.samples = samples;
    this.schedule = schedule;
    this.days = new Map();       // 'YYYY-MM-DD' -> PeriodAgg (+ first / last sample index)
    let current = null; let currentKey = null;
    samples.forEach((s, i) => {
      const day = scheduleDay(s.t, schedule);
      const key = isoDate(day);
      if (key !== currentKey) {
        current = this.days.get(key);
        if (!current) {
          current = new PeriodAgg();
          current.date = day;
          current.first = i;
          this.days.set(key, current);
        }
        currentKey = key;
      }
      current.last = i;
      current.stats.add(s);
      current.metrics.add(s);
      const p = schedule ? phaseAt(new Date(s.t), schedule) : -1;
      if (p >= 0) { current.phases[p].add(s); current.phaseMetrics[p].add(s); }
      const risks = riskLevels(s);
      for (let r = 0; r < 3; r++) {
        current.riskN[r]++;
        if (risks[r] >= 1) current.riskHigh[r]++;
      }
      // Focus risk counts during focus time (or all day without a schedule)
      if (p === 1 || p < 0) {
        current.riskN[3]++;
        if (risks[3] >= 1) current.riskHigh[3]++;
      }
    });
    for (const entry of care || []) {
      const key = isoDate(scheduleDay(entry.t, schedule));
      let agg = this.days.get(key);
      if (!agg) {
        agg = new PeriodAgg();
        agg.date = fromIso(key);
        this.days.set(key, agg);
      }
      agg.care.push(entry);
    }
    this.firstDay = samples.length ? scheduleDay(samples[0].t, schedule) : null;
    this.lastDay = samples.length ? scheduleDay(samples[samples.length - 1].t, schedule) : null;
  }

  day(date) { return this.days.get(isoDate(date)) || null; }

  /** Summary of the days in [from, to). */
  range(from, to) {
    const agg = new PeriodAgg();
    for (let d = from; d < to; d = addDays(d, 1)) {
      const day = this.days.get(isoDate(d));
      if (day) agg.merge(day);
    }
    return agg;
  }

  daySamples(date) {
    const day = this.day(date);
    return day && day.first !== undefined ? this.samples.slice(day.first, day.last + 1) : [];
  }
}

// ─── Coach summary ──────────────────────────────────────────────────────────
function careCounts(entries) {
  const c = { shown: entries.length, done: 0, improved: 0, prevented: 0, keptGood: 0, byAction: new Map() };
  for (const e of entries) {
    const done = e.answer === 'done';
    if (done) c.done++;
    if (e.outcome === 'improved') c.improved++;
    if (e.outcome === 'prevented') c.prevented++;
    if (e.outcome === 'kept_good') c.keptGood++;
    const a = c.byAction.get(e.action) || { shown: 0, done: 0, helped: 0 };
    a.shown++;
    if (done) a.done++;
    if (e.outcome === 'improved' || e.outcome === 'prevented') a.helped++;
    c.byAction.set(e.action, a);
  }
  return c;
}

const OUTCOME_TEXT = {
  improved: [t('Air improved'), 'success'], prevented: [t('Bad air prevented'), 'success'], kept_good: [t('Kept good'), 'success'],
  no_change: [t('No change'), 'muted'], not_measured: [t('Not measurable'), 'muted'], pending: [t('Checking…'), 'muted'],
};
const ANSWER_TEXT = { done: t('Done'), later: t('Later'), none: t('No answer'), pending: t('Open') };

// ─── Chart.js plugin: schedule phases, level limits, coach markers ──────────
const backgroundPlugin = {
  id: 'odakBackground',
  beforeDatasetsDraw(chart, args, opts) {
    const { ctx, chartArea: area, scales } = chart;
    if (!area) return;
    ctx.save();
    for (const band of opts.phaseBands || []) {
      const x1 = Math.max(area.left, scales.x.getPixelForValue(band.from));
      const x2 = Math.min(area.right, scales.x.getPixelForValue(band.to));
      if (x2 <= x1) continue;
      ctx.fillStyle = `${PHASES[band.phase].color}1f`;
      ctx.fillRect(x1, area.top, x2 - x1, area.bottom - area.top);
      ctx.fillStyle = PHASES[band.phase].color;
      ctx.font = '600 11px Inter, sans-serif';
      if (x2 - x1 > 40) ctx.fillText(PHASES[band.phase].name, x1 + 4, area.top + 12);
    }
    for (const [value, level] of opts.limits || []) {
      const y = scales.y.getPixelForValue(value);
      if (y < area.top || y > area.bottom) continue;
      ctx.strokeStyle = LEVELS[level].color;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(area.left, y);
      ctx.lineTo(area.right, y);
      ctx.stroke();
    }
    ctx.restore();
  },
  afterDatasetsDraw(chart, args, opts) {
    const { ctx, chartArea: area, scales } = chart;
    if (!area || !opts.markers) return;
    ctx.save();
    for (const m of opts.markers) {
      const x = scales.x.getPixelForValue(m.t);
      if (x < area.left || x > area.right) continue;
      const helped = m.outcome === 'improved' || m.outcome === 'prevented';
      const color = helped ? '#2fb380' : m.answer === 'done' ? '#0057ff' : '#adb5bd';
      ctx.strokeStyle = color;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(x, area.top + 22);
      ctx.lineTo(x, area.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, area.top + 22, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '700 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(m.code, x, area.top + 25);
    }
    ctx.restore();
  },
};

// ─── View ───────────────────────────────────────────────────────────────────
export class InsightsView {
  /**
   * @param {object} el            DOM elements (see index.html "Insights" tab)
   * @param {function} getSchedule  { weekday: [4 minutes], weekend: [...] } or null
   * @param {function} getPriorities  chosen priority indices (0-3), [] when none
   */
  constructor(el, getSchedule, getPriorities) {
    this.el = el;
    this.getSchedule = getSchedule;
    this.getPriorities = getPriorities;
    this.samples = [];
    this.care = [];
    this.index = null;
    this.indexSchedule = null;
    this.view = 'day';
    this.date = startOfDay(new Date());
    this.metric = 'co2';
    this.chart = null;

    el.viewButtons.forEach(btn => btn.addEventListener('click', () => this.setView(btn.dataset.view)));
    el.prev.addEventListener('click', () => this.step(-1));
    el.next.addEventListener('click', () => this.step(1));
    el.today.addEventListener('click', () => { this.date = startOfDay(new Date()); this.render(); });
    el.date.addEventListener('change', () => {
      if (!el.date.value) return;
      this.date = fromIso(el.date.value);
      this.render();
    });
    el.metric.addEventListener('change', () => { this.metric = el.metric.value; this.render(); });
    // Clicking a day opens it; clicking a week opens that week
    el.content.addEventListener('click', (event) => {
      const cell = event.target.closest('[data-date], [data-week]');
      if (!cell) return;
      if (cell.dataset.week) {
        this.date = fromIso(cell.dataset.week);
        this.setView('week');
      } else {
        this.date = fromIso(cell.dataset.date);
        this.setView('day');
      }
    });
  }

  setData(samples, care) {
    this.samples = samples;
    this.care = care || [];
    this.index = null;
    // Start on the newest day with data if the selected one has none
    const idx = this.getIndex();
    if (idx.lastDay && !idx.day(this.date)) this.date = idx.lastDay;
    this.render();
  }

  /** The day index, rebuilt when the data or the schedule changes. */
  getIndex() {
    const schedule = this.getSchedule();
    const key = JSON.stringify(schedule);
    if (!this.index || this.indexSchedule !== key) {
      this.index = new HistoryIndex(this.samples, this.care, schedule);
      this.indexSchedule = key;
    }
    return this.index;
  }

  setView(view) {
    this.view = view;
    this.el.viewButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
    this.render();
  }

  step(direction) {
    if (this.view === 'day') this.date = addDays(this.date, direction);
    else if (this.view === 'week') this.date = addDays(this.date, 7 * direction);
    else this.date = addMonths(this.date, direction);
    this.render();
  }

  render() {
    this.el.date.value = isoDate(this.date);
    if (this.chart) { this.chart.destroy(); this.chart = null; }
    if (this.samples.length === 0) {
      this.el.title.textContent = t('No history yet');
      this.el.summary.innerHTML = '';
      this.el.coach.innerHTML = '';
      this.el.content.innerHTML = `
        <div class="insights-empty">
          <i class="bi bi-graph-up"></i>
          <div>${t('Connect your Odak and click <b>Sync from device</b>, or drop an exported file here.')}</div>
        </div>`;
      this.el.chartWrap.classList.add('d-none');
      return;
    }
    this.el.chartWrap.classList.remove('d-none');
    const index = this.getIndex();
    if (this.view === 'day') this.renderDay(index);
    else if (this.view === 'week') this.renderWeek(index);
    else if (this.view === 'month') this.renderMonth(index);
    else this.renderSixMonths(index);
  }

  // ── Headline numbers ──
  renderSummary(agg) {
    const m = METRICS[this.metric];
    const st = agg.metrics.get(this.metric);
    const all = agg.stats;
    const chips = [];
    if (!all.empty) chips.push([t('Good air'), percent(Math.round((all.good / all.n) * 100)), t('of the time')]);
    if (st) {
      chips.push([t('Average {metric}', { metric: m.label }), formatMetric(st.avg, this.metric), '']);
      chips.push([t('Lowest – highest'), `${formatMetric(st.min, this.metric, false)} – ${formatMetric(st.max, this.metric)}`, '']);
    }
    if (!all.empty) chips.push([t('CO₂ above 1000 ppm'), percent(Math.round((all.above1000 / all.n) * 100)), t('of the time')]);
    chips.push([t('Measurements'), all.n.toLocaleString(locale), '']);
    this.el.summary.innerHTML = chips.map(([label, value, note]) => `
      <div class="insights-chip">
        <div class="insights-chip-label">${label}</div>
        <div class="insights-chip-value">${escapeHtml(value)} <span>${note}</span></div>
      </div>`).join('');
  }

  // ── Air Coach: suggestions, results and the user's priorities for a period ──
  /**
   * What to compare a period with: the previous period when it has enough data,
   * otherwise (long periods) the first month with data against the latest one.
   */
  comparison(index, agg, previous, periodName, from, to) {
    if (previous && previous.stats.n >= agg.stats.n * 0.5) {
      return { before: previous, after: agg, text: (d) => t(`{points} pts vs previous ${periodName}`, { points: d }) };
    }
    if (to - from < 40 * 86400000) return null;
    const months = [];
    for (let m = startOfMonth(from); m < to; m = addMonths(m, 1)) {
      const a = index.range(m, addMonths(m, 1));
      if (a.stats.n > 0) months.push({ m, a });
    }
    if (months.length < 2) return null;
    const first = months[0]; const last = months[months.length - 1];
    const name = (x) => fmt(x.m, { month: 'short' });
    return { before: first.a, after: last.a, firstName: name(first), lastName: name(last) };
  }

  renderCoach(agg, previous, periodName, { list = false, compare = null } = {}) {
    const c = careCounts(agg.care);
    const chosen = this.getPriorities();
    const shownPriorities = chosen.length ? chosen : [0, 1, 2, 3];

    const stat = (value, label, icon, cls = '') => `
      <div class="coach-stat ${cls}">
        <i class="bi ${icon}"></i>
        <div><div class="coach-stat-value">${value}</div><div class="coach-stat-label">${label}</div></div>
      </div>`;
    const helped = c.improved + c.prevented;

    // Per priority: time at high risk now vs the previous period, and the actions that served it
    const pct = (a, p) => (a && a.riskN[p] ? (a.riskHigh[p] / a.riskN[p]) * 100 : null);
    const cards = shownPriorities.map((p) => {
      const pr = PRIORITIES[p];
      const share = pct(agg, p);
      const mine = agg.care.filter(e => actionInfo(e.action).risks.includes(p));
      const done = mine.filter(e => e.answer === 'done').length;
      const good = mine.filter(e => e.outcome === 'improved' || e.outcome === 'prevented').length;
      let trend = '';
      const was = compare ? pct(compare.before, p) : null;
      const now = compare ? pct(compare.after, p) : null;
      if (was !== null && now !== null) {
        const diff = Math.round(now - was);
        const cls = diff < 0 ? 'better' : diff > 0 ? 'worse' : '';
        const icon = diff < 0 ? 'bi-arrow-down' : diff > 0 ? 'bi-arrow-up' : 'bi-dash';
        const text = compare.text
          ? (diff === 0 ? t(`same as previous ${periodName}`) : compare.text(Math.abs(diff)))
          : t('was {before}% in {first}, {after}% in {last}', { before: Math.round(was), first: compare.firstName, after: Math.round(now), last: compare.lastName });
        trend = `<span class="trend ${cls}"><i class="bi ${icon}"></i> ${text}</span>`;
      }
      return `
        <div class="priority-card" style="--accent:${pr.color}">
          <div class="priority-head"><i class="bi ${pr.icon}"></i> ${pr.name}</div>
          <div class="priority-value">${share === null ? '—' : percent(Math.round(share))}</div>
          <div class="priority-note">${t(p === 3 ? 'of focus time with raised exposure to {exposure}' : 'of the time with raised exposure to {exposure}', { exposure: pr.exposure })}</div>
          ${trend}
          <div class="priority-actions">${t(done === 1 ? '1 action done for this · {helped} helped' : '{done} actions done for this · {helped} helped', { done, helped: good })}</div>
        </div>`;
    }).join('');

    const top = [...c.byAction.entries()].sort((a, b) => b[1].shown - a[1].shown).slice(0, 6).map(([code, a]) => `
      <tr><td><span class="action-code">${escapeHtml(code)}</span> ${escapeHtml(actionInfo(code).text)}</td>
        <td class="text-end">${a.shown}</td><td class="text-end">${a.done}</td><td class="text-end">${a.helped}</td></tr>`).join('');

    const entries = list ? agg.care.slice().sort((a, b) => a.t - b.t).map((e) => {
      const [outText, outKind] = OUTCOME_TEXT[e.outcome] || [e.outcome, 'muted'];
      const time = new Date(e.t).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
      return `<li><span class="coach-time">${time}</span><span class="action-code">${escapeHtml(e.action)}</span>
        <span class="flex-grow-1">${escapeHtml(actionInfo(e.action).text)}</span>
        <span class="badge text-bg-light">${ANSWER_TEXT[e.answer] || escapeHtml(e.answer)}</span>
        <span class="small text-${outKind}">${outText}</span></li>`;
    }).join('') : '';

    this.el.coach.innerHTML = `
      <div class="coach-section">
        <div class="d-flex align-items-baseline gap-2 mb-2">
          <h6 class="fw-semibold mb-0"><i class="bi bi-stars me-1"></i> ${t('Air Coach')}</h6>
          <span class="small text-muted">${t('Suggestions Odak made on its screen and what happened next')}</span>
        </div>
        ${c.shown === 0
          ? `<div class="small text-muted mb-3">${t(`No suggestions in this ${periodName}`)}${this.care.length === 0 ? t(' — sync with a device running the Air Coach firmware to see them') : ''}.</div>`
          : `<div class="coach-stats">
              ${stat(c.shown, t('actions suggested'), 'bi-chat-square-text')}
              ${stat(c.done, t('done by you'), 'bi-check2-circle')}
              ${stat(c.improved, t('times air improved'), 'bi-graph-down-arrow', 'good')}
              ${stat(c.prevented, t('bad parts of the day prevented'), 'bi-shield-check', 'good')}
            </div>
            <div class="small text-muted mt-1">${helped > 0 ? t(helped === 1 ? 'Your actions made the air better 1 time' : 'Your actions made the air better {count} times', { count: helped }) : t('No measured improvement yet')}${c.keptGood ? t(', and kept it good {count} more', { count: c.keptGood }) : ''}.</div>`}
        ${entries ? `<ul class="coach-list mt-2">${entries}</ul>` : ''}
        ${!list && top ? `
          <table class="table table-sm small coach-table mt-2">
            <thead><tr><th>${t('Most suggested')}</th><th class="text-end">${t('Shown')}</th><th class="text-end">${t('Done')}</th><th class="text-end">${t('Helped')}</th></tr></thead>
            <tbody>${top}</tbody>
          </table>` : ''}
        <h6 class="fw-semibold mt-3 mb-2">${chosen.length ? t('Your priorities') : t('By priority')}
          ${chosen.length ? '' : `<span class="small text-muted fw-normal">${t('— choose up to two in My Plan to focus on them')}</span>`}</h6>
        <div class="priority-cards">${cards}</div>
        <div class="small text-muted mt-2">${t('Odak coaches you to lower your exposure to known triggers. It does not diagnose or treat any condition.')}</div>
      </div>`;
  }

  // ── Day: the schedule day (last night's sleep, then wake, focus, rest) ──
  renderDay(index) {
    const schedule = index.schedule;
    const day = index.day(this.date);
    const samples = index.daySamples(this.date);
    const profile = profileFor(this.date);
    const [from, to] = dayWindow(this.date, schedule);
    this.el.title.textContent = fmt(this.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const agg = day || new PeriodAgg();
    this.renderSummary(agg);

    let worst = -1; let worstLevel = 0; let worstDriver = 0;
    const tiles = DAY_ORDER.map((p) => {
      const phase = PHASES[p];
      const st = agg.phases[p];
      const plan = schedule ? schedule[p === 3 ? profileFor(addDays(this.date, -1)) : profile] : null;
      const startText = plan ? t('from {time}', { time: hhmm(plan[p]) }) : '';
      const done = agg.care.filter(e => e.answer === 'done' && phaseAt(new Date(e.t), schedule) === p).length;
      const doneText = done ? `<span class="tile-done" title="${t('Actions done')}"><i class="bi bi-check2"></i> ${done}</span>` : '';
      if (st.empty) {
        return `
          <div class="phase-tile empty">
            <div class="phase-tile-head"><i class="bi ${phase.icon}" style="color:${phase.color}"></i> ${phase.name}<span>${startText}</span></div>
            <div class="phase-tile-level">—</div>
            <div class="phase-tile-note">${t('no data')} ${doneText}</div>
          </div>`;
      }
      const { level, driver } = st.rating();
      if (level > worstLevel) { worstLevel = level; worst = p; worstDriver = driver; }
      const note = level > 0 ? `${DRIVER_NAMES[driver]} ${st.driverValue(driver)}` : `CO₂ ${st.avgCo2.toFixed(0)} ppm`;
      return `
        <div class="phase-tile" style="--level:${LEVELS[level].color}">
          <div class="phase-tile-head"><i class="bi ${phase.icon}" style="color:${phase.color}"></i> ${phase.name}<span>${startText}</span></div>
          <div class="phase-tile-level">${LEVELS[level].name}</div>
          <div class="phase-tile-note">${note} ${doneText}</div>
        </div>`;
    });

    // One tip for the worst part of the day, as on the device
    let tip = t('Great air today — keep it up');
    if (worst >= 0) {
      if (worstDriver === 1) tip = t('Dust and vacuum; check outdoor air');
      else if (worstDriver === 2) tip = t('Ventilate; avoid sprays and scents');
      else tip = CO2_TIPS[worst];
    }

    const windowText = schedule
      ? `${new Date(from).toLocaleString(locale, { weekday: 'short', hour: '2-digit', minute: '2-digit' })} – ${new Date(to).toLocaleString(locale, { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · ${t(profile === 'weekend' ? 'weekend plan' : 'weekday plan')} · ${t("last night's sleep counts for this day")}`
      : t('Calendar day — set a plan in My Plan to rate each part of the day');
    this.el.content.innerHTML = samples.length === 0
      ? `<div class="insights-empty small"><i class="bi bi-calendar-x"></i><div>${t('No measurements on this day.')}</div></div>`
      : `
        <div class="small text-muted mb-2"><i class="bi bi-calendar-week me-1"></i>${windowText}</div>
        ${schedule ? `<div class="phase-tiles">${tiles.join('')}</div>
        <div class="insights-tip"><i class="bi bi-lightbulb me-2"></i>${tip}</div>` : ''}`;

    // Phase bands across the day
    const bands = [];
    if (schedule) {
      let bandStart = from;
      let current = phaseAt(new Date(from), schedule);
      for (let t = from + 60000; t <= to; t += 60000) {
        const p = t >= to ? -2 : phaseAt(new Date(t), schedule);
        if (p !== current) {
          bands.push({ from: bandStart, to: t, phase: current });
          bandStart = t;
          current = p;
        }
      }
    }

    const m = METRICS[this.metric];
    const points = samples.map(s => ({ x: s.t, y: metricValue(s, this.metric) })).filter(p => p.y !== null);
    this.chart = new Chart(this.el.chart, {
      type: 'line',
      data: {
        datasets: [{
          label: `${m.label}${m.unit ? ` (${m.unit})` : ''}`,
          data: points,
          borderColor: '#0057ff',
          backgroundColor: 'rgba(0, 87, 255, 0.08)',
          borderWidth: 2,
          pointRadius: points.length > 200 ? 0 : 2,
          tension: 0.25,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          title: { display: false },
          legend: { display: false },
          odakBackground: {
            phaseBands: bands,
            limits: m.limits || [],
            markers: agg.care.map(e => ({ t: e.t, code: e.action, answer: e.answer, outcome: e.outcome })),
          },
        },
        scales: {
          x: {
            type: 'time',
            min: from,
            max: to,
            time: { unit: 'hour', stepSize: 3, tooltipFormat: lang === 'tr' ? 'dd.MM HH:mm' : 'EEE HH:mm', displayFormats: { hour: 'HH:mm' } },
          },
          y: { title: { display: true, text: `${m.label}${m.unit ? ` (${m.unit})` : ''}` } },
        },
      },
      plugins: [backgroundPlugin],
    });

    this.renderCoach(agg, null, 'day', { list: true, compare: this.comparison(index, agg, index.day(addDays(this.date, -1)), 'day', this.date, addDays(this.date, 1)) });
  }

  // Per-period low / average / high chart, with coach actions done as bars
  renderPeriodChart(periods) {
    const m = METRICS[this.metric];
    const stats = periods.map(p => p.agg.metrics.get(this.metric));
    const hasCare = periods.some(p => p.agg.care.length);
    this.chart = new Chart(this.el.chart, {
      type: 'bar',
      data: {
        labels: periods.map(p => p.label),
        datasets: [
          {
            type: 'line',
            label: t('Average'),
            data: stats.map(s => (s ? Number(s.avg.toFixed(m.digits)) : null)),
            borderColor: '#0057ff',
            backgroundColor: '#0057ff',
            borderWidth: 2,
            pointRadius: periods.length > 40 ? 0 : 3,
            tension: 0.25,
            spanGaps: true,
            yAxisID: 'y',
          },
          {
            label: t('Lowest – highest'),
            data: stats.map(s => (s ? [s.min, s.max] : null)),
            backgroundColor: periods.map(p => { const l = p.agg.stats.level(); return l === null ? 'rgba(108,117,125,0.25)' : `${LEVELS[l].color}66`; }),
            borderRadius: 4,
            barPercentage: 0.6,
            yAxisID: 'y',
          },
          ...(hasCare ? [{
            label: t('Actions done'),
            data: periods.map(p => p.agg.care.filter(e => e.answer === 'done').length),
            backgroundColor: 'rgba(111, 66, 193, 0.75)',
            borderRadius: 3,
            barPercentage: 0.3,
            yAxisID: 'y1',
          }] : []),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          title: { display: false },
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (item) => (item.dataset.yAxisID === 'y1'
                ? `${t('Actions done')}: ${item.raw}`
                : Array.isArray(item.raw)
                  ? `${t('Lowest – highest')}: ${formatMetric(item.raw[0], this.metric, false)} – ${formatMetric(item.raw[1], this.metric)}`
                  : `${t('Average')}: ${formatMetric(item.raw, this.metric)}`),
            },
          },
          odakBackground: { limits: m.limits || [] },
        },
        scales: {
          y: { title: { display: true, text: `${m.label}${m.unit ? ` (${m.unit})` : ''}` } },
          ...(hasCare ? { y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { precision: 0 }, title: { display: true, text: t('Actions done') } } } : {}),
        },
      },
      plugins: [backgroundPlugin],
    });
  }

  gridCell(level, value, attr) {
    if (level === null) return `<td class="grid-cell empty" ${attr}>—</td>`;
    return `<td class="grid-cell" ${attr} style="--level:${LEVELS[level].color}" title="${LEVELS[level].name}">
      <span class="grid-level">${LEVELS[level].name}</span>${value ? `<span class="grid-value">${value}</span>` : ''}</td>`;
  }

  // ── Week: parts of the day × days, like the device's "This week" screen ──
  renderWeek(index) {
    const first = startOfWeek(this.date);
    const next = addDays(first, 7);
    const schedule = index.schedule;
    this.el.title.textContent = `${fmt(first, { day: 'numeric', month: 'short' })} – ${fmt(addDays(first, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`;
    const agg = index.range(first, next);
    this.renderSummary(agg);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(first, i);
      days.push({ date, agg: index.day(date) || new PeriodAgg(), label: fmt(date, { weekday: 'short', day: 'numeric' }) });
    }
    const value = (acc) => formatMetric(acc.get(this.metric)?.avg ?? null, this.metric);
    const header = days.map(d => `<th class="${profileFor(d.date) === 'weekend' ? 'weekend' : ''}">${fmt(d.date, { weekday: 'short' })}<br><span>${fmt(d.date, { day: 'numeric', month: 'short' })}</span></th>`).join('');
    const phaseRows = schedule ? DAY_ORDER.map(p => `
      <tr>
        <th class="row-head"><i class="bi ${PHASES[p].icon}" style="color:${PHASES[p].color}"></i> ${PHASES[p].name}</th>
        ${days.map(d => this.gridCell(d.agg.phases[p].level(), d.agg.phases[p].empty ? '' : value(d.agg.phaseMetrics[p]), `data-date="${isoDate(d.date)}"`)).join('')}
      </tr>`).join('') : '';
    const dayRow = `
      <tr class="day-row">
        <th class="row-head"><i class="bi bi-sun me-1"></i>${t('Whole day')}</th>
        ${days.map(d => this.gridCell(d.agg.stats.level(), d.agg.stats.empty ? '' : value(d.agg.metrics), `data-date="${isoDate(d.date)}"`)).join('')}
      </tr>`;
    const doneRow = `
      <tr>
        <th class="row-head"><i class="bi bi-check2-circle me-1"></i>${t('Actions done')}</th>
        ${days.map(d => { const n = d.agg.care.filter(e => e.answer === 'done').length; return `<td class="grid-count">${n || ''}</td>`; }).join('')}
      </tr>`;
    this.el.content.innerHTML = `
      ${schedule ? '' : `<div class="small text-muted mb-2">${t('Set a plan in My Plan to see each part of the day.')}</div>`}
      <div class="table-responsive">
        <table class="insights-grid">
          <thead><tr><th></th>${header}</tr></thead>
          <tbody>${phaseRows}${dayRow}${doneRow}</tbody>
        </table>
      </div>
      <div class="small text-muted mt-1">${t('Values are the average {metric}. Each night is in the column of the morning it ends. Click a day to open it.', { metric: METRICS[this.metric].label })}</div>`;
    this.renderPeriodChart(days);
    this.renderCoach(agg, null, 'week', { compare: this.comparison(index, agg, index.range(addDays(first, -7), first), 'week', first, next) });
  }

  monthCalendar(index, month, { mini = false } = {}) {
    const next = addMonths(month, 1);
    const lead = (month.getDay() + 6) % 7;  // Monday first
    const today = isoDate(new Date());
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<div class="cal-cell outside"></div>');
    for (let date = month; date < next; date = addDays(date, 1)) {
      const day = index.day(date);
      const level = day ? day.stats.level() : null;
      const style = level === null ? '' : ` style="--level:${LEVELS[level].color}"`;
      const done = day ? day.care.filter(e => e.answer === 'done').length : 0;
      const cls = `cal-cell ${level === null ? 'empty' : 'has-data'} ${isoDate(date) === today ? 'today' : ''}`;
      if (mini) {
        cells.push(`<div class="${cls}" data-date="${isoDate(date)}"${style} title="${fmt(date, { weekday: 'short', day: 'numeric', month: 'short' })}${level === null ? '' : ` · ${LEVELS[level].name}`}${done ? ` · ${t('{count} done', { count: done })}` : ''}">${date.getDate()}</div>`);
      } else {
        const st = day ? day.metrics.get(this.metric) : null;
        cells.push(`
          <div class="${cls}" data-date="${isoDate(date)}"${style}>
            <div class="cal-day">${date.getDate()}${done ? `<span class="cal-done" title="${t('Actions done')}"><i class="bi bi-check2"></i>${done}</span>` : ''}</div>
            ${level === null ? '' : `<div class="cal-level">${LEVELS[level].name}</div><div class="cal-value">${formatMetric(st?.avg ?? null, this.metric)}</div>`}
          </div>`);
      }
    }
    const miniHeads = lang === 'tr' ? ['P', 'S', 'Ç', 'P', 'C', 'C', 'P'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const heads = (mini ? miniHeads : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => t(d))).map(n => `<div class="cal-head">${n}</div>`).join('');
    return `<div class="calendar ${mini ? 'mini' : ''}">${heads}${cells.join('')}</div>`;
  }

  legend(extra = '') {
    return `<div class="d-flex flex-wrap gap-3 align-items-center small text-muted mt-2">
      ${LEVELS.map(l => `<span><span class="legend-dot" style="background:${l.color}"></span>${l.name}</span>`).join('')}
      <span class="ms-auto">${extra}</span></div>`;
  }

  // ── Month: calendar coloured by each day's air quality ──
  renderMonth(index) {
    const first = startOfMonth(this.date);
    const next = addMonths(first, 1);
    this.el.title.textContent = fmt(first, { month: 'long', year: 'numeric' });
    const agg = index.range(first, next);
    this.renderSummary(agg);
    const days = [];
    for (let date = first; date < next; date = addDays(date, 1)) days.push({ date, agg: index.day(date) || new PeriodAgg(), label: String(date.getDate()) });
    const dataDays = days.filter(d => !d.agg.stats.empty);
    const goodDays = dataDays.filter(d => d.agg.stats.level() === 0).length;
    this.el.content.innerHTML = `
      ${this.monthCalendar(index, first)}
      ${this.legend(dataDays.length ? t('{good} of {total} days with good air', { good: goodDays, total: dataDays.length }) : t('No measurements this month'))}`;
    this.renderPeriodChart(days);
    this.renderCoach(agg, null, 'month', { compare: this.comparison(index, agg, index.range(addMonths(first, -1), first), 'month', first, next) });
  }

  // ── 6 months: the device's "by week" grid, six calendars and the weekly trend ──
  renderSixMonths(index) {
    const lastMonth = startOfMonth(this.date);
    const first = addMonths(lastMonth, -5);
    const next = addMonths(lastMonth, 1);
    this.el.title.textContent = `${fmt(first, { month: 'short', year: 'numeric' })} – ${fmt(lastMonth, { month: 'short', year: 'numeric' })}`;
    const agg = index.range(first, next);
    this.renderSummary(agg);
    const schedule = index.schedule;

    // Weeks (Monday to Sunday) that touch the six months
    const weeks = [];
    for (let w = startOfWeek(first); w < next; w = addDays(w, 7)) {
      weeks.push({ date: w, agg: index.range(w, addDays(w, 7)), label: fmt(w, { day: 'numeric', month: 'short' }) });
    }
    const monthHeads = [];
    weeks.forEach((w, i) => {
      const thursday = addDays(w.date, 3);  // a week belongs to the month of its Thursday
      const name = fmt(thursday, { month: 'short' });
      if (i === 0 || name !== monthHeads[monthHeads.length - 1].name) monthHeads.push({ name, span: 1, start: i });
      else monthHeads[monthHeads.length - 1].span++;
    });
    const monthStarts = new Set(monthHeads.map(m => m.start).filter(i => i > 0));
    const sep = (i) => (monthStarts.has(i) ? ' month-start' : '');
    const rows = (schedule ? DAY_ORDER : []).map(p => `
      <tr><th class="row-head"><i class="bi ${PHASES[p].icon}" style="color:${PHASES[p].color}"></i> ${PHASES[p].name}</th>
        ${weeks.map((w, i) => { const l = w.agg.phases[p].level(); return `<td class="week-cell${sep(i)} ${l === null ? 'empty' : ''}" data-week="${isoDate(w.date)}" ${l === null ? '' : `style="--level:${LEVELS[l].color}"`} title="${t('Week of {date}', { date: w.label })}${l === null ? '' : ` · ${PHASES[p].name}: ${LEVELS[l].name}`}"></td>`; }).join('')}
      </tr>`).join('');
    const dayRow = `
      <tr class="day-row"><th class="row-head"><i class="bi bi-sun me-1"></i>${t('Whole day')}</th>
        ${weeks.map((w, i) => { const l = w.agg.stats.level(); return `<td class="week-cell${sep(i)} ${l === null ? 'empty' : ''}" data-week="${isoDate(w.date)}" ${l === null ? '' : `style="--level:${LEVELS[l].color}"`} title="${t('Week of {date}', { date: w.label })}${l === null ? '' : ` · ${LEVELS[l].name}`}"></td>`; }).join('')}
      </tr>`;
    const doneRow = `
      <tr><th class="row-head"><i class="bi bi-check2-circle me-1"></i>${t('Done')}</th>
        ${weeks.map((w, i) => { const n = w.agg.care.filter(e => e.answer === 'done').length; return `<td class="week-count${sep(i)}">${n || ''}</td>`; }).join('')}
      </tr>`;
    const months = [];
    for (let i = 0; i < 6; i++) {
      const month = addMonths(first, i);
      months.push(`<div class="mini-month"><div class="mini-month-name">${fmt(month, { month: 'long', year: 'numeric' })}</div>${this.monthCalendar(index, month, { mini: true })}</div>`);
    }
    const dataDays = [...index.days.values()].filter(d => d.date >= first && d.date < next && !d.stats.empty);
    const goodDays = dataDays.filter(d => d.stats.level() === 0).length;
    this.el.content.innerHTML = `
      <h6 class="fw-semibold mb-2">${t('By week')}</h6>
      <div class="table-responsive">
        <table class="weeks-grid">
          <thead><tr><th></th>${monthHeads.map((m, i) => `<th colspan="${m.span}" class="${i > 0 ? 'month-start' : ''}">${m.name}</th>`).join('')}</tr></thead>
          <tbody>${rows}${dayRow}${doneRow}</tbody>
        </table>
      </div>
      <h6 class="fw-semibold mt-3 mb-2">${t('By day')}</h6>
      <div class="mini-months">${months.join('')}</div>
      ${this.legend(dataDays.length ? t('{good} of {total} days with good air · click a week or day to open it', { good: goodDays, total: dataDays.length }) : t('No measurements in these months'))}`;
    this.renderPeriodChart(weeks);
    this.renderCoach(agg, null, '6 months', { compare: this.comparison(index, agg, index.range(addMonths(first, -6), first), '6 months', first, next) });
  }
}
