// ODAK Air Quality Monitor — web version of the desktop GUI (Chrome/Edge, Web Serial).
import { SerialLink } from './serial.js';

const $ = (id) => document.getElementById(id);

// ─── DOM ────────────────────────────────────────────────────────────────────
const connectBtn = $('connect-btn');
const disconnectBtn = $('disconnect-btn');
const connectionStatus = $('connection-status');
const errorMessage = $('error-message');
const cliInput = $('cli-input');
const cliOutput = $('cli-output');
const setTimeBtn = $('set-time-btn');
const autoTimeToggle = $('auto-time-toggle');
const clockStatus = $('clock-status');
const loggingToggle = $('logging-toggle');
const logCount = $('log-count');
const downloadCsvBtn = $('download-log-csv');
const downloadJsonBtn = $('download-log-json');
const clearLogBtn = $('clear-log');
const firmwareFileInput = $('firmware-file');
const updateFirmwareBtn = $('update-firmware');
const writeFirmwareBtn = $('write-firmware');
const updateProgress = $('update-progress');
const updateProgressContainer = $('update-progress-container');
const updateStatus = $('update-status');

const stats = {
  co2: $('stat-co2'), aqi: $('stat-aqi'), voc: $('stat-voc'), temp: $('stat-temp'),
  humidity: $('stat-humidity'), pm1: $('stat-pm1'), pm25: $('stat-pm25'), pm10: $('stat-pm10'),
  pressure: $('stat-pressure'), elevation: $('stat-elevation'), battery: $('stat-batt'),
};

// How long the device may stay busy (boot, PM warm-up, measurement) before it reads commands.
const DEVICE_READY_TIMEOUT_MS = 90000;
const AUTO_TIME_KEY = 'odak.autoSetTime';

// ─── Serial link ────────────────────────────────────────────────────────────
const link = new SerialLink({
  onLine: handleLine,
  onStatus: handleStatus,
  onError: displayError,
});

let connectionSeq = 0;  // bumps on every (re)connect so stale startup tasks stop

function handleStatus(status) {
  if (status.connected) {
    connectionSeq++;
    connectionStatus.innerHTML = '<span class="badge connected"><i class="bi bi-link me-1"></i> Connected</span>';
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
    setTimeBtn.disabled = false;
    setScheduleButtons(true);
    updateFirmwareButtons();
    addToCliOutput('Connected to device', 'cli-command');
    runConnectTasks(connectionSeq);
  } else {
    connectionSeq++;
    $('clock-device').textContent = '';
    connectionStatus.innerHTML = status.lost
      ? '<span class="badge bg-warning text-dark"><i class="bi bi-hourglass-split me-1"></i> Device restarting / unplugged — waiting…</span>'
      : '<span class="badge disconnected"><i class="bi bi-broadcast me-1"></i> Disconnected</span>';
    connectBtn.disabled = !SerialLink.supported;
    disconnectBtn.disabled = true;
    setTimeBtn.disabled = true;
    setScheduleButtons(false);
    setScheduleStatus('');
    updateFirmwareButtons();
    addToCliOutput(status.lost ? 'Device disconnected — will reconnect when it comes back' : 'Disconnected from device', 'cli-command');
  }
}

async function connect() {
  try {
    connectBtn.disabled = true;
    await link.requestAndOpen();
  } catch (err) {
    connectBtn.disabled = false;
    if (err.name !== 'NotFoundError') {  // NotFoundError = user closed the picker
      displayError({ message: 'Connection error', details: err.message });
    }
  }
}

async function disconnect() {
  disconnectBtn.disabled = true;
  await link.close();
}

/** Wait until the device is reading commands (it is deaf while measuring). */
async function waitForDeviceReady(seq) {
  const reply = await link.request('$GET_SETTINGS', (l) => l.startsWith('Language:'), DEVICE_READY_TIMEOUT_MS);
  return reply !== null && seq === connectionSeq;
}

async function runConnectTasks(seq) {
  $('info-firmware').textContent = 'checking…';
  if (!(await waitForDeviceReady(seq))) {
    if (seq === connectionSeq) $('info-firmware').textContent = 'no reply';
    return;
  }
  const version = await link.request('$PRINT_VERSION', (l) => /^v\d+\.\d+/.test(l) || l.includes('Unknown command: PRINT_VERSION'), 5000);
  if (seq !== connectionSeq) return;
  $('info-firmware').textContent = version === null ? 'no reply' : version.startsWith('v') ? version : 'older firmware (no version command)';

  if (autoTimeToggle.checked) await setDeviceTime({ seq, alreadyReady: true });
  else await refreshDeviceTime(seq);
  if (seq === connectionSeq) await readDeviceSchedule({ seq, alreadyReady: true });
}

/** Show the device's own clock ($GET_TIME). */
async function refreshDeviceTime(seq = connectionSeq) {
  const reply = await link.request('$GET_TIME', (l) => l.startsWith('Time:') || l.includes('Unknown command: GET_TIME'), 5000);
  if (seq !== connectionSeq) return;
  const el = $('clock-device');
  if (reply === null) {
    el.textContent = '';
  } else if (reply.includes('Unknown command')) {
    el.innerHTML = '<span class="text-muted">Device clock: not available in this firmware</span>';
  } else if (reply.startsWith('Time: not set')) {
    el.innerHTML = '<span class="text-warning fw-medium"><i class="bi bi-exclamation-triangle me-1"></i>Device clock is not set</span>';
  } else {
    // "Time: 2026-10-15 09:18:18 UTC (local 2026-10-15 12:18:18, offset +180 min)"
    const local = /local ([\d-]+ [\d:]+)/.exec(reply);
    el.innerHTML = `<span class="text-success fw-medium"><i class="bi bi-check-circle me-1"></i>Device clock: ${local ? local[1] : reply.slice(6)}</span>`;
  }
}

// ─── Device clock (SET_TIME) ────────────────────────────────────────────────
// Protocol: $SET_TIME,<unix seconds, UTC>,<UTC offset in minutes>
// The firmware is expected to answer with a line starting "Time set".
function formatOffset(minutes) {
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

function tickClock() {
  const now = new Date();
  $('clock-now').textContent = now.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  $('clock-tz').textContent = `${formatOffset(-now.getTimezoneOffset())} ${tzName}`;
}

function setClockStatus(text, kind = 'muted') {
  clockStatus.className = `small text-${kind}`;
  clockStatus.textContent = text;
}

async function setDeviceTime({ seq = connectionSeq, alreadyReady = false } = {}) {
  if (!link.connected) return;
  setTimeBtn.disabled = true;
  try {
    if (!alreadyReady) {
      setClockStatus('Waiting for the device to finish what it is doing…');
      if (!(await waitForDeviceReady(seq))) {
        if (seq === connectionSeq) setClockStatus('The device did not respond.', 'danger');
        return;
      }
    }
    // Take the time right before sending so it isn't stale.
    const now = new Date();
    const epoch = Math.floor(now.getTime() / 1000);
    const offset = -now.getTimezoneOffset();
    const reply = await link.request(
      `$SET_TIME,${epoch},${offset}`,
      (l) => l.startsWith('Time set') || l.startsWith('SET_TIME error') || l.includes('Unknown command: SET_TIME'),
      5000,
    );
    if (seq !== connectionSeq) return;
    if (reply === null) {
      setClockStatus('No answer to SET_TIME.', 'danger');
    } else if (reply.includes('Unknown command')) {
      setClockStatus('This firmware does not support setting the time yet.', 'warning');
    } else if (reply.startsWith('SET_TIME error')) {
      setClockStatus(`The device rejected the time: ${reply}`, 'danger');
    } else {
      setClockStatus(`Device time set at ${now.toLocaleTimeString()} (${formatOffset(offset)}).`, 'success');
      await refreshDeviceTime(seq);
    }
  } catch (err) {
    setClockStatus(`Failed: ${err.message}`, 'danger');
  } finally {
    setTimeBtn.disabled = !link.connected;
  }
}

// ─── Daily schedule ─────────────────────────────────────────────────────────
// Protocol: $SET_SCHEDULE,<weekday|weekend>,<wake>,<focus>,<rest>,<sleep>  (HH:MM)
//           $GET_SCHEDULE -> "Schedule weekday: wake 07:00, focus 09:00, rest 18:00, sleep 23:00"
//                            "Schedule weekend: ..."  or  "Schedule: not set"
//           $CLEAR_SCHEDULE -> "Schedule cleared"
const SCHEDULE_PROFILES = ['weekday', 'weekend'];
const SCHEDULE_PHASES = ['Wake', 'Focus', 'Rest', 'Sleep'];
const schedButtons = () => [$('sched-save-btn'), $('sched-read-btn'), $('sched-clear-btn')];

function setScheduleStatus(text, kind = 'muted') {
  const el = $('sched-status');
  el.className = `small text-${kind}`;
  el.textContent = text;
}

function showScheduleProfile(profile) {
  for (const el of document.querySelectorAll('.schedule-profile')) el.classList.toggle('d-none', el.dataset.profile !== profile);
  $(`sched-tab-${profile}`).checked = true;
}

function setScheduleButtons(enabled) {
  for (const b of schedButtons()) b.disabled = !enabled;
}

const toMinutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

/** Times of one profile from the form, or an error message (same rules as the firmware). */
function readSchedulePlan(profile) {
  const times = SCHEDULE_PHASES.map((_, i) => $(`sched-${profile}-${i}`).value);
  const minutes = times.map(toMinutes);
  const label = profile === 'weekday' ? 'Mon–Fri' : 'Sat–Sun';
  const missing = minutes.findIndex(Number.isNaN);
  if (missing >= 0) return { error: `${label}: enter a ${SCHEDULE_PHASES[missing].toLowerCase()} time.` };
  // Going around the clock from wake, each part must start after the previous one.
  let prev = 0;
  for (let i = 1; i < 4; i++) {
    const d = (minutes[i] - minutes[0] + 1440) % 1440;
    if (d <= prev) {
      return { error: `${label}: ${SCHEDULE_PHASES[i].toLowerCase()} must come after ${SCHEDULE_PHASES[i - 1].toLowerCase()} (order: wake, focus, rest, sleep).` };
    }
    prev = d;
  }
  return { times };
}

/** Wait for the device, then run `task`; keeps the buttons and status in step. */
async function withDevice(seq, alreadyReady, task) {
  if (!link.connected) return;
  setScheduleButtons(false);
  try {
    if (!alreadyReady) {
      setScheduleStatus('Waiting for the device to finish what it is doing…');
      if (!(await waitForDeviceReady(seq))) {
        if (seq === connectionSeq) setScheduleStatus('The device did not respond.', 'danger');
        return;
      }
    }
    await task();
  } catch (err) {
    setScheduleStatus(`Failed: ${err.message}`, 'danger');
  } finally {
    setScheduleButtons(link.connected);
  }
}

async function readDeviceSchedule({ seq = connectionSeq, alreadyReady = false } = {}) {
  await withDevice(seq, alreadyReady, async () => {
    const unknown = (l) => l.includes('Unknown command: GET_SCHEDULE');
    const notSet = (l) => l.startsWith('Schedule: not set');
    const replies = SCHEDULE_PROFILES.map((p) => link.waitForLine((l) => l.startsWith(`Schedule ${p}:`) || notSet(l) || unknown(l), 5000));
    await link.send('$GET_SCHEDULE');
    const [weekday, weekend] = await Promise.all(replies);
    if (seq !== connectionSeq) return;
    if (weekday === null) return setScheduleStatus('No answer to GET_SCHEDULE.', 'danger');
    if (unknown(weekday)) return setScheduleStatus('This firmware does not support schedules yet.', 'warning');
    if (notSet(weekday)) return setScheduleStatus('No schedule on the device yet — adjust the times and save.', 'warning');
    for (const [profile, line] of [['weekday', weekday], ['weekend', weekend]]) {
      const times = line ? line.match(/\d{2}:\d{2}/g) : null;
      if (times && times.length === 4) times.forEach((t, i) => { $(`sched-${profile}-${i}`).value = t; });
    }
    setScheduleStatus('Showing the schedule stored on the device.', 'success');
  });
}

async function saveDeviceSchedule() {
  const plans = SCHEDULE_PROFILES.map(readSchedulePlan);
  const badIndex = plans.findIndex((p) => p.error);
  if (badIndex >= 0) {
    showScheduleProfile(SCHEDULE_PROFILES[badIndex]);
    return setScheduleStatus(plans[badIndex].error, 'danger');
  }
  const seq = connectionSeq;
  await withDevice(seq, false, async () => {
    for (let i = 0; i < SCHEDULE_PROFILES.length; i++) {
      const profile = SCHEDULE_PROFILES[i];
      const reply = await link.request(
        `$SET_SCHEDULE,${profile},${plans[i].times.join(',')}`,
        (l) => l.startsWith('Schedule set') || l.startsWith('SET_SCHEDULE error') || l.includes('Unknown command: SET_SCHEDULE'),
        5000,
      );
      if (seq !== connectionSeq) return;
      if (reply === null) return setScheduleStatus('No answer to SET_SCHEDULE.', 'danger');
      if (reply.includes('Unknown command')) return setScheduleStatus('This firmware does not support schedules yet.', 'warning');
      if (reply.startsWith('SET_SCHEDULE error')) return setScheduleStatus(`The device rejected the ${profile} schedule.`, 'danger');
    }
    setScheduleStatus(`Schedule saved at ${new Date().toLocaleTimeString()}.`, 'success');
  });
}

async function clearDeviceSchedule() {
  if (!confirm('Remove the daily schedule from the device? The "My day" screens will be empty until a new one is saved.')) return;
  const seq = connectionSeq;
  await withDevice(seq, false, async () => {
    const reply = await link.request('$CLEAR_SCHEDULE', (l) => l.startsWith('Schedule cleared') || l.includes('Unknown command: CLEAR_SCHEDULE'), 5000);
    if (seq !== connectionSeq) return;
    if (reply === null) setScheduleStatus('No answer to CLEAR_SCHEDULE.', 'danger');
    else if (reply.includes('Unknown command')) setScheduleStatus('This firmware does not support schedules yet.', 'warning');
    else setScheduleStatus('Schedule removed from the device.', 'success');
  });
}

// ─── Incoming lines ─────────────────────────────────────────────────────────
function handleLine(line) {
  logLine(line);
  if (line.startsWith('{') && line.endsWith('}')) {
    try {
      updateSensorReadings(JSON.parse(line));
      return;
    } catch { /* not JSON after all */ }
  }
  addToCliOutput(line);
}

function updateSensorReadings(data) {
  const show = (key, chartKey, value, text) => {
    if (value === undefined || value === null || Number.isNaN(Number(value))) return;
    stats[key].textContent = text(Number(value));
    addDataPoint(chartKey, Number(value));
  };
  show('temp', 'temperature', data.temperature, (v) => `${v.toFixed(1)} °C`);
  show('humidity', 'humidity', data.humidity, (v) => `${v.toFixed(1)} %`);
  show('co2', 'co2', data.co2, (v) => `${v.toFixed(0)} ppm`);
  show('voc', 'voc', data.voc, (v) => `${v.toFixed(0)} index`);
  show('pm1', 'pm1', data.pm1, (v) => `${v.toFixed(1)} µg/m³`);
  show('pm25', 'pm25', data['pm2.5'], (v) => `${v.toFixed(1)} µg/m³`);
  show('pm10', 'pm10', data.pm10, (v) => `${v.toFixed(1)} µg/m³`);
  show('aqi', 'aqi', data.aqi, (v) => `${v.toFixed(0)}`);
  show('pressure', 'pressure', data.pressure, (v) => `${v.toFixed(1)} hPa`);
  show('elevation', 'elevation', data.elevation, (v) => `${v.toFixed(1)} m`);
  show('battery', 'battery', data.battery, (v) => `${v.toFixed(1)} %`);
  if (data.batteryV !== undefined) $('info-battery-v').textContent = `${Number(data.batteryV).toFixed(2)} V`;
  updateCharts();
}

// ─── CLI ────────────────────────────────────────────────────────────────────
const commandHistory = [];
let commandIndex = -1;

function timestamp() {
  const d = new Date();
  return `${d.toTimeString().split(' ')[0]}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function addToCliOutput(text, className = 'cli-output') {
  const line = document.createElement('div');
  line.className = className;
  if (className === 'cli-output') {
    if (text.includes('ERROR ') || text.startsWith('Unknown command')) line.className = 'cli-error';
    else if (text.includes('WARNING ') || text.includes('WARN ')) line.className = 'cli-warning';
    else if (text.includes('INFO ') || /success/i.test(text)) line.className = 'cli-info';
    else if (text.includes('TRACE ') || text.includes('DEBUG ')) line.className = 'cli-debug';
    else if (text.includes('FATAL ')) line.className = 'cli-fatal';
  }
  line.textContent = className === 'cli-command' ? text : `[${timestamp()}] ${text}`;
  const atBottom = cliOutput.scrollHeight - cliOutput.scrollTop - cliOutput.clientHeight < 40;
  cliOutput.appendChild(line);
  while (cliOutput.childElementCount > 5000) cliOutput.firstElementChild.remove();
  if (atBottom) cliOutput.scrollTop = cliOutput.scrollHeight;
}

async function sendCommand() {
  const command = cliInput.value.trim();
  if (!command) return;
  if (!link.connected) {
    displayError({ message: 'Not connected to device' });
    return;
  }
  commandHistory.push(command);
  commandIndex = commandHistory.length;
  addToCliOutput(`$ ${command.replace(/^\$/, '')}`, 'cli-command');
  try {
    await link.send(command);
    if (/SYS_RST/i.test(command)) {
      addToCliOutput('System reset sent. The page reconnects automatically when the device is back.', 'cli-info');
    }
  } catch (err) {
    addToCliOutput(`Error: ${err.message}`, 'cli-error');
  }
  cliInput.value = '';
}

function navigateCommandHistory(direction) {
  if (commandHistory.length === 0) return;
  commandIndex = Math.max(0, commandIndex + direction);
  if (commandIndex >= commandHistory.length) {
    commandIndex = commandHistory.length;
    cliInput.value = '';
    return;
  }
  cliInput.value = commandHistory[commandIndex];
  requestAnimationFrame(() => cliInput.setSelectionRange(cliInput.value.length, cliInput.value.length));
}

function downloadText(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileStamp() {
  return new Date().toISOString().replace(/:/g, '-').substring(0, 19);
}

function exportConsoleOutput() {
  const body = Array.from(cliOutput.children).map((l) => l.textContent).join('\n');
  const header = `ODAK Console Export - ${new Date().toLocaleString()}\n${'='.repeat(50)}\n\n`;
  downloadText(`ODAK_Console_${fileStamp()}.txt`, header + body);
}

// ─── Data logging ───────────────────────────────────────────────────────────
let logEntries = [];

function logLine(line) {
  if (!loggingToggle.checked) return;
  logEntries.push({ timestamp: new Date().toISOString(), data: line });
  updateLogUi();
}

function updateLogUi() {
  logCount.textContent = `${logEntries.length} line${logEntries.length === 1 ? '' : 's'} recorded`;
  const empty = logEntries.length === 0;
  downloadCsvBtn.disabled = empty;
  downloadJsonBtn.disabled = empty;
  clearLogBtn.disabled = empty;
}

function downloadLogCsv() {
  const rows = logEntries.map((e) => `${e.timestamp},"${e.data.replace(/"/g, '""')}"`);
  downloadText(`ODAK_Log_${fileStamp()}.csv`, `timestamp,data\n${rows.join('\n')}\n`, 'text/csv');
}

function downloadLogJson() {
  downloadText(`ODAK_Log_${fileStamp()}.json`, JSON.stringify(logEntries, null, 2), 'application/json');
}

// ─── Firmware update ────────────────────────────────────────────────────────
let firmwareFile = null;

function updateFirmwareButtons() {
  updateFirmwareBtn.disabled = !firmwareFile;
}

function setUpdateStatus(html, progress, kind) {
  updateStatus.innerHTML = html;
  if (progress !== undefined) {
    updateProgressContainer.classList.remove('d-none');
    updateProgress.style.width = `${progress}%`;
    updateProgress.classList.toggle('bg-danger', kind === 'danger');
    updateProgress.classList.toggle('bg-success', kind === 'success');
    updateProgress.classList.toggle('progress-bar-animated', kind !== 'danger' && kind !== 'success');
  }
}

const MANUAL_FLASH_HINT =
  'If it does not finish, copy the .uf2 file onto the <b>RPI-RP2</b> drive yourself (drag and drop in your file manager).';

async function startFirmwareUpdate() {
  if (!firmwareFile) return;
  updateFirmwareBtn.disabled = true;
  const wasConnected = link.connected;
  try {
    if (wasConnected) {
      setUpdateStatus('<div class="alert alert-info">Restarting the device into update mode…</div>', 15);
      await link.rebootToBootloader();
      await new Promise((r) => setTimeout(r, 2500));
    }
    setUpdateStatus(
      '<div class="alert alert-info">An <b>RPI-RP2</b> drive should now be visible. Click <b>Write to RPI-RP2 Drive</b> and select it.' +
        (wasConnected ? '' : '<br><small>Not connected: if the drive is not there, unplug the device, hold its <b>BOOTSEL</b> button and plug it back in.</small>') +
        '</div>',
      35,
    );
    writeFirmwareBtn.classList.remove('d-none');
  } catch (err) {
    setUpdateStatus(`<div class="alert alert-danger">Could not restart the device: ${err.message}</div>`, 100, 'danger');
  } finally {
    updateFirmwareBtn.disabled = !firmwareFile;
  }
}

async function writeFirmwareToDrive() {
  if (!('showDirectoryPicker' in window)) {
    setUpdateStatus(`<div class="alert alert-warning">This browser can't write to drives. ${MANUAL_FLASH_HINT}</div>`, 100, 'danger');
    return;
  }
  let dir;
  try {
    dir = await window.showDirectoryPicker({ id: 'rpi-rp2', mode: 'readwrite' });
  } catch (err) {
    if (err.name !== 'AbortError') {
      setUpdateStatus(`<div class="alert alert-danger">Could not open the drive: ${err.message}. ${MANUAL_FLASH_HINT}</div>`, 35, 'danger');
    }
    return;
  }
  try {
    await dir.getFileHandle('INFO_UF2.TXT');
  } catch {
    setUpdateStatus('<div class="alert alert-warning">That folder is not the <b>RPI-RP2</b> drive (no INFO_UF2.TXT). Pick the RPI-RP2 drive.</div>', 35);
    return;
  }

  writeFirmwareBtn.disabled = true;
  setUpdateStatus('<div class="alert alert-info">Writing firmware… the device restarts by itself when done.</div>', 70);
  try {
    const handle = await dir.getFileHandle(firmwareFile.name.endsWith('.uf2') ? firmwareFile.name : 'firmware.uf2', { create: true });
    const writable = await handle.createWritable();
    await writable.write(firmwareFile);
    await writable.close();
    finishFirmwareUpdate();
  } catch (err) {
    // The bootloader reboots as soon as it has the whole image, which often
    // makes the final step of the write fail. Treat that as success if the
    // device comes back; otherwise point to the manual route.
    setUpdateStatus(`<div class="alert alert-info">Write finished with “${err.message}”. This is normal if the device restarted. Waiting for it to come back…</div>`, 90);
    setTimeout(() => {
      if (!link.connected) {
        setUpdateStatus(`<div class="alert alert-warning">The device has not reconnected yet. ${MANUAL_FLASH_HINT}</div>`, 100, 'danger');
      }
    }, 15000);
  } finally {
    writeFirmwareBtn.disabled = false;
  }
}

function finishFirmwareUpdate() {
  writeFirmwareBtn.classList.add('d-none');
  setUpdateStatus('<div class="alert alert-success">Firmware written. The device restarts and this page reconnects automatically.</div>', 100, 'success');
}

// ─── Charts ─────────────────────────────────────────────────────────────────
const MAX_POINTS = 100;
const chartData = {
  temperature: [], humidity: [], co2: [], voc: [], pm1: [], pm25: [], pm10: [],
  aqi: [], pressure: [], elevation: [], battery: [],
};
const charts = {};

const timeAxis = {
  type: 'time',
  time: { unit: 'minute', tooltipFormat: 'HH:mm:ss', displayFormats: { minute: 'HH:mm' } },
  title: { display: true, text: 'Time' },
};

function series(label, rgb, fill, extra = {}) {
  return {
    label,
    borderColor: `rgb(${rgb})`,
    backgroundColor: `rgba(${fill}, 0.1)`,
    borderWidth: 2,
    pointRadius: 3,
    pointHoverRadius: 5,
    tension: 0.2,
    data: [],
    ...extra,
  };
}

function lineChart(canvasId, title, datasets, yScales) {
  return new Chart($(canvasId), {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { title: { text: title } },
      scales: { x: timeAxis, ...yScales },
    },
  });
}

function initCharts() {
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = '#495057';
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 6;
  Chart.defaults.plugins.tooltip.titleFont = { weight: 'bold', size: 13 };
  Chart.defaults.plugins.title.display = true;
  Chart.defaults.plugins.title.font = { weight: 'bold', size: 14 };

  const yAxis = (text, more = {}) => ({ title: { display: true, text }, ...more });

  charts.tempHum = lineChart('tempHumChart', 'Temperature & Humidity', [
    series('Temperature (°C)', '220, 53, 69', '220, 53, 69', { yAxisID: 'y' }),
    series('Humidity (%)', '13, 110, 253', '13, 110, 253', { yAxisID: 'y1' }),
  ], {
    y: yAxis('Temperature (°C)', { position: 'left', suggestedMin: 10, suggestedMax: 40 }),
    y1: yAxis('Humidity (%)', { position: 'right', grid: { drawOnChartArea: false }, suggestedMin: 0, suggestedMax: 100 }),
  });
  charts.co2 = lineChart('co2Chart', 'CO2 Level', [series('CO2 (ppm)', '255, 152, 0', '255, 152, 0')], { y: yAxis('CO2 (ppm)') });
  charts.voc = lineChart('vocChart', 'VOC Index', [series('VOC index', '108, 117, 125', '108, 117, 125')], { y: yAxis('VOC index (100 = usual air)', { suggestedMin: 0, suggestedMax: 300 }) });
  charts.pm = lineChart('pmChart', 'Particulate Matter', [
    series('PM1.0 (µg/m³)', '25, 135, 84', '124, 255, 112'),
    series('PM2.5 (µg/m³)', '255, 190, 93', '255, 165, 0'),
    series('PM10 (µg/m³)', '153, 132, 13', '255, 255, 0'),
  ], { y: yAxis('PM (µg/m³)') });
  charts.battery = lineChart('batteryChart', 'Battery', [series('Battery (%)', '13, 202, 240', '13, 202, 240')], { y: yAxis('Battery (%)', { suggestedMin: 0, suggestedMax: 100 }) });
  charts.aqi = lineChart('aqiChart', 'Air Quality Index (AQI)', [series('Air Quality Index', '111, 66, 193', '111, 66, 193')], { y: yAxis('AQI', { suggestedMin: 0, suggestedMax: 300 }) });
  charts.pressure = lineChart('pressureChart', 'Barometric Pressure', [series('Pressure (hPa)', '145, 70, 255', '145, 70, 255')], { y: yAxis('Pressure (hPa)') });
  charts.elevation = lineChart('elevationChart', 'Elevation', [series('Elevation (m)', '40, 167, 89', '0, 255, 136')], { y: yAxis('Elevation (m)') });
}

function addDataPoint(type, value) {
  const list = chartData[type];
  list.push({ x: new Date(), y: value });
  if (list.length > MAX_POINTS) list.shift();
}

function updateCharts() {
  charts.tempHum.data.datasets[0].data = chartData.temperature;
  charts.tempHum.data.datasets[1].data = chartData.humidity;
  charts.co2.data.datasets[0].data = chartData.co2;
  charts.voc.data.datasets[0].data = chartData.voc;
  charts.pm.data.datasets[0].data = chartData.pm1;
  charts.pm.data.datasets[1].data = chartData.pm25;
  charts.pm.data.datasets[2].data = chartData.pm10;
  charts.battery.data.datasets[0].data = chartData.battery;
  charts.aqi.data.datasets[0].data = chartData.aqi;
  charts.pressure.data.datasets[0].data = chartData.pressure;
  charts.elevation.data.datasets[0].data = chartData.elevation;
  Object.values(charts).forEach((c) => c.update());
}

function clearCharts() {
  Object.keys(chartData).forEach((k) => { chartData[k] = []; });
  updateCharts();
  addToCliOutput('Charts cleared', 'cli-command');
}

// ─── Errors ─────────────────────────────────────────────────────────────────
let errorTimer = null;
function displayError(error) {
  console.error(error);
  errorMessage.textContent = error.message || 'An error occurred';
  errorMessage.classList.add('pulse');
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => {
    errorMessage.textContent = '';
    errorMessage.classList.remove('pulse');
  }, 5000);
  addToCliOutput(error.details ? `Error: ${error.message} - ${error.details}` : `Error: ${error.message}`, 'cli-error');
}

// ─── Wiring ─────────────────────────────────────────────────────────────────
function init() {
  initCharts();
  tickClock();
  setInterval(tickClock, 1000);

  try {
    autoTimeToggle.checked = localStorage.getItem(AUTO_TIME_KEY) !== 'false';
  } catch { /* storage blocked: keep default */ }
  autoTimeToggle.addEventListener('change', () => {
    try { localStorage.setItem(AUTO_TIME_KEY, String(autoTimeToggle.checked)); } catch { /* ignore */ }
  });

  connectBtn.addEventListener('click', connect);
  disconnectBtn.addEventListener('click', disconnect);
  setTimeBtn.addEventListener('click', () => setDeviceTime());
  $('sched-save-btn').addEventListener('click', saveDeviceSchedule);
  $('sched-read-btn').addEventListener('click', () => readDeviceSchedule());
  $('sched-clear-btn').addEventListener('click', clearDeviceSchedule);
  for (const radio of document.querySelectorAll('input[name="sched-profile"]')) {
    radio.addEventListener('change', () => showScheduleProfile(radio.value));
  }

  $('cli-send').addEventListener('click', sendCommand);
  cliInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendCommand();
    else if (e.key === 'ArrowUp') { navigateCommandHistory(-1); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { navigateCommandHistory(1); e.preventDefault(); }
  });
  document.querySelectorAll('.cmd-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.immediate === 'true') {
        cliInput.value = btn.dataset.cmd;
        sendCommand();
      } else {
        // Commands that take a value: fill "CMD," and let the user type it.
        cliInput.value = `${btn.dataset.cmd},`;
        cliInput.focus();
        if (btn.title) addToCliOutput(`${btn.dataset.cmd}: ${btn.title}`, 'cli-info');
      }
    });
  });
  $('clear-console').addEventListener('click', () => {
    cliOutput.innerHTML = '';
    addToCliOutput('Console cleared', 'cli-info');
  });
  $('export-console').addEventListener('click', exportConsoleOutput);
  $('clear-charts').addEventListener('click', clearCharts);

  downloadCsvBtn.addEventListener('click', downloadLogCsv);
  downloadJsonBtn.addEventListener('click', downloadLogJson);
  clearLogBtn.addEventListener('click', () => { logEntries = []; updateLogUi(); });

  firmwareFileInput.addEventListener('change', () => {
    firmwareFile = firmwareFileInput.files[0] || null;
    writeFirmwareBtn.classList.add('d-none');
    updateStatus.innerHTML = '';
    updateProgressContainer.classList.add('d-none');
    updateFirmwareButtons();
  });
  updateFirmwareBtn.addEventListener('click', startFirmwareUpdate);
  writeFirmwareBtn.addEventListener('click', writeFirmwareToDrive);

  window.addEventListener('beforeunload', (e) => {
    if (logEntries.length > 0) e.preventDefault();  // unsaved log
  });

  if (!SerialLink.supported) {
    $('unsupported-banner').classList.remove('d-none');
    connectBtn.disabled = true;
    return;
  }
  // Reconnect silently to a device this browser was already allowed to use.
  link.openKnownDevice().catch(() => { /* user can click Connect */ });
}

init();
