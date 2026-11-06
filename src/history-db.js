// Local measurement history: a SQLite file in the app's data folder, meant to keep years of data.
//
// Odak only keeps its newest records, so this is the long-term copy, one history per device. Nothing
// in it is ever dropped: a device that was erased starts counting `seq` again, and its records simply
// join the older ones. That is why a record is identified by (device, time_utc, seq).
//
//   devices        every Odak seen: its id (USB serial number), the name the user gave it, and the
//                  newest record already stored (last_seq)
//   measurements   one row per device record; a column per CSV column. Firmware can add columns,
//                  which are added to the table the first time they arrive.
//   care           the Air Coach log, one row per card; a card's answer and outcome can still
//                  change, so newer data replaces older
//
// Data from before devices were told apart (the JSON cache) has device '' until the first device
// that recognises it claims it.
//
// Uses Node's built-in SQLite, so there is no native module to build, sign or package per platform.

const fs = require('fs');
const path = require('path');

const DB_FILE = 'odak-history.db';
const OLD_CACHE_FILE = 'history-cache.json';   // what versions before 0.8 kept
const UNASSIGNED = '';
const COLUMN_NAME = /^[a-z][a-z0-9_]*$/;

// What Insights reads; every other column is only needed for exports
const SERIES = {
  co2: 'co2_ppm', pm1: 'pm1', pm25: 'pm25', pm10: 'pm10', voc: 'voc_index', temp: 'temp_c',
  hum: 'hum_pct', pressure: 'pressure_hpa', aqi: 'aqi', battery: 'battery_pct',
};

// A clock glitch on the device can stamp records years ahead (seen: 7 years, marked valid). They stay
// stored and exported, but Insights leaves them out; otherwise it would open on an empty future day.
const FUTURE_MARGIN_S = 86400;
const latestShownTime = () => Math.floor(Date.now() / 1000) + FUTURE_MARGIN_S;

let db = null;

const tableColumns = () => db.prepare('PRAGMA table_info(measurements)').all().map((c) => c.name);
const recordColumns = () => tableColumns().filter((c) => c !== 'device');
const countOf = (device) => db.prepare('SELECT COUNT(*) AS n FROM measurements WHERE device = ?').get(device).n;
const deviceRow = (id) => db.prepare('SELECT * FROM devices WHERE id = ?').get(id);

function transaction(work) {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** A CSV field as stored: numbers as numbers, empty as NULL. */
function toValue(field) {
  if (field === undefined || field === null) return null;
  const text = String(field).trim();
  if (text === '') return null;
  const number = Number(text);
  return Number.isNaN(number) ? text : number;
}

function addColumns(columns) {
  const known = new Set(tableColumns());
  for (const column of columns) {
    if (known.has(column)) continue;
    if (!COLUMN_NAME.test(column)) throw new Error(`Bad column name from the device: ${column}`);
    db.exec(`ALTER TABLE measurements ADD COLUMN ${column}`);
  }
}

function ensureDevice(id) {
  if (deviceRow(id)) return;
  db.prepare('INSERT INTO devices (id, first_seen, last_seen) VALUES (?, ?, ?)').run(id, Date.now(), Date.now());
}

/** Insert rows of the given columns; returns how many were new. Known records are left as they are. */
function insertRows(device, columns, rows) {
  if (!columns.includes('seq') || !columns.includes('time_utc')) throw new Error('The history has no seq or time_utc column.');
  addColumns(columns);
  const insert = db.prepare(`INSERT OR IGNORE INTO measurements (device, ${columns.join(', ')}) VALUES (?, ${columns.map(() => '?').join(', ')})`);
  const seqAt = columns.indexOf('seq');
  const timeAt = columns.indexOf('time_utc');
  let added = 0;
  for (const row of rows) {
    const values = columns.map((_, i) => toValue(row[i]));
    if (typeof values[seqAt] !== 'number' || typeof values[timeAt] !== 'number') continue;
    added += Number(insert.run(device, ...values).changes);
  }
  return added;
}

function insertCare(device, entries) {
  const insert = db.prepare('INSERT OR REPLACE INTO care (device, t, action, driver, level, answer, outcome) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const e of entries) {
    insert.run(device, e.t, e.action, e.driver ?? null, e.level ?? 0, e.answer ?? null, e.outcome ?? null);
  }
}

/** First start after updating: bring in the old JSON cache, and keep the file as a backup. */
function importOldCache(dir) {
  const file = path.join(dir, OLD_CACHE_FILE);
  if (!fs.existsSync(file)) return;
  const cache = JSON.parse(fs.readFileSync(file, 'utf8'));
  transaction(() => {
    ensureDevice(UNASSIGNED);
    if (Array.isArray(cache.rows) && cache.rows.length) {
      insertRows(UNASSIGNED, cache.columns, cache.rows);
      const seqAt = cache.columns.indexOf('seq');
      const lastSeq = Math.max(...cache.rows.slice(-1000).map((r) => Number(r[seqAt])));
      db.prepare('UPDATE devices SET last_seq = ?, synced_at = ? WHERE id = ?').run(lastSeq, cache.syncedAt || 0, UNASSIGNED);
    }
    if (Array.isArray(cache.care)) insertCare(UNASSIGNED, cache.care);
  });
  fs.renameSync(file, `${file}.imported`);
}

function open(dir) {
  if (db) return;
  fs.mkdirSync(dir, { recursive: true });
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(path.join(dir, DB_FILE));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT,
      first_seen INTEGER,
      last_seen INTEGER,
      last_seq INTEGER NOT NULL DEFAULT -1,
      synced_at INTEGER NOT NULL DEFAULT 0
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS measurements (
      device TEXT NOT NULL,
      seq INTEGER NOT NULL,
      time_utc INTEGER NOT NULL,
      PRIMARY KEY (device, time_utc, seq)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS care (
      device TEXT NOT NULL,
      t INTEGER NOT NULL,
      action TEXT NOT NULL,
      driver TEXT,
      level INTEGER,
      answer TEXT,
      outcome TEXT,
      PRIMARY KEY (device, t, action)
    ) WITHOUT ROWID;
  `);
  importOldCache(dir);
}

function close() {
  if (db) db.close();
  db = null;
}

/** Every device with a name or data, most recently seen first: [{ id, name, count }]. */
function listDevices() {
  const counts = new Map(db.prepare('SELECT device, COUNT(*) AS n FROM measurements GROUP BY device').all().map((r) => [r.device, r.n]));
  return db.prepare('SELECT id, name FROM devices ORDER BY last_seen DESC').all()
    .map((d) => ({ id: d.id, name: d.name, count: counts.get(d.id) || 0 }))
    .filter((d) => d.name || d.count);
}

/** A device was connected. Returns { id, name }; name is null until the user has given it one. */
function deviceSeen(id) {
  ensureDevice(id);
  db.prepare('UPDATE devices SET last_seen = ? WHERE id = ?').run(Date.now(), id);
  return { id, name: deviceRow(id).name };
}

function renameDevice(id, name) {
  ensureDevice(id);
  db.prepare('UPDATE devices SET name = ? WHERE id = ?').run(name, id);
}

/** { count, lastSeq, syncedAt } of a device, or null while it has nothing stored. */
function info(device) {
  const count = countOf(device);
  if (count === 0) return null;
  const row = deviceRow(device);
  return { count, lastSeq: row?.last_seq ?? -1, syncedAt: row?.synced_at ?? 0 };
}

/**
 * Everything Insights needs, as typed arrays (they cross to the window quickly): time in ms, sorted,
 * and one Float64Array per entry of SERIES, NaN for no value. Records without a valid clock, or with
 * a time in the future, are left out.
 */
function series(device) {
  const columns = tableColumns();
  const has = (name) => columns.includes(name);
  const valid = has('time_valid') ? 'AND (time_valid = 1 OR time_valid IS NULL)' : '';
  const where = `WHERE device = ? AND time_utc <= ? ${valid}`;
  const latest = latestShownTime();
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM measurements ${where}`).get(device, latest);
  const out = { n, t: new Float64Array(n) };
  const keys = Object.keys(SERIES).filter((key) => has(SERIES[key]));
  for (const key of Object.keys(SERIES)) out[key] = new Float64Array(n).fill(NaN);
  const select = ['time_utc', ...keys.map((key) => SERIES[key])].join(', ');
  let i = 0;
  for (const row of db.prepare(`SELECT ${select} FROM measurements ${where} ORDER BY time_utc, seq`).all(device, latest)) {
    out.t[i] = row.time_utc * 1000;
    for (const key of keys) {
      const value = row[SERIES[key]];
      if (typeof value === 'number') out[key][i] = value;
    }
    i++;
  }
  return out;
}

const careLog = (device) => db.prepare('SELECT t, action, driver, level, answer, outcome FROM care WHERE device = ? ORDER BY t').all(device)
  .map((e) => ({ ...e }));

/** The Air Coach log as Insights shows it: cards with a future time are left out, like measurements. */
const shownCareLog = (device) => careLog(device).filter((e) => e.t <= latestShownTime() * 1000);

/** All of a device's records in its CSV form, for exports. */
function allRows(device) {
  const columns = recordColumns();
  const rows = [];
  for (const row of db.prepare(`SELECT ${columns.join(', ')} FROM measurements WHERE device = ? ORDER BY time_utc, seq`).all(device)) {
    rows.push(columns.map((column) => (row[column] === null ? '' : String(row[column]))));
  }
  return { columns, rows };
}

/**
 * Do we know the record a device calls its oldest? No record with that seq at all also counts: the
 * device may have overwritten what we hold. A different time for the same seq means it was erased.
 */
function knowsRecord(device, { seq, time }) {
  const bySeq = db.prepare('SELECT COUNT(*) AS n FROM measurements WHERE device = ? AND seq = ?').get(device, seq).n;
  if (bySeq === 0) return true;
  return db.prepare('SELECT COUNT(*) AS n FROM measurements WHERE device = ? AND seq = ? AND time_utc = ?').get(device, seq, time).n > 0;
}

/** Give the data from before devices were told apart to `device`. */
function claimUnassigned(device) {
  const old = deviceRow(UNASSIGNED);
  transaction(() => {
    db.prepare('UPDATE measurements SET device = ? WHERE device = ?').run(device, UNASSIGNED);
    db.prepare('UPDATE care SET device = ? WHERE device = ?').run(device, UNASSIGNED);
    if (old) {
      db.prepare('UPDATE devices SET last_seq = ?, synced_at = ? WHERE id = ?').run(old.last_seq, old.synced_at, device);
      db.prepare('DELETE FROM devices WHERE id = ?').run(UNASSIGNED);
    }
  });
}

/**
 * Before a sync: { lastSeq, known, care }. `known` says the device still has the history we hold, so
 * the sync can carry on after lastSeq; `care` is its stored Air Coach log. `oldest` is the device's
 * oldest record ({ seq, time }), if any.
 */
function syncStart({ device, oldest }) {
  ensureDevice(device);
  if (device !== UNASSIGNED && countOf(UNASSIGNED) > 0 && countOf(device) === 0
      && (!oldest || knowsRecord(UNASSIGNED, oldest))) {
    claimUnassigned(device);
  }
  return { lastSeq: deviceRow(device).last_seq, known: !oldest || knowsRecord(device, oldest), care: careLog(device) };
}

/** Store one sync in a single step. Returns how many measurements were new. */
function addSync({ device, columns, rows, care, lastSeq, syncedAt }) {
  return transaction(() => {
    ensureDevice(device);
    const added = rows && rows.length ? insertRows(device, columns, rows) : 0;
    if (care && care.length) insertCare(device, care);
    if (lastSeq !== undefined) db.prepare('UPDATE devices SET last_seq = ? WHERE id = ?').run(lastSeq, device);
    db.prepare('UPDATE devices SET synced_at = ? WHERE id = ?').run(syncedAt, device);
    return added;
  });
}

module.exports = { open, close, listDevices, deviceSeen, renameDevice, info, series, careLog, shownCareLog, allRows, syncStart, addSync };
