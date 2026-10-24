// Renderer process for ODAK Air Quality Monitor GUI

// Initialize chart containers
const charts = {};
const chartData = {
  temperature: [],
  humidity: [],
  co2: [],
  voc: [],
  pm1: [],
  pm25: [],
  pm10: [],
  aqi: [],
  pressure: [],
  elevation: [],
  battery: []
};

// Import modules
import { initCharts, addDataPoint, updateCharts, clearCharts } from './modules/chart-management.js';
import { InsightsView, PHASES, samplesFromHistory, parseImportFile, parseCareLog, mergeCareLog } from './modules/insights.js';

// Daily schedule: profiles and parts of the day, in the firmware's order
const SCHEDULE_PROFILES = ['weekday', 'weekend'];
const SCHEDULE_PHASES = ['Wake', 'Focus', 'Rest', 'Sleep'];

document.addEventListener('DOMContentLoaded', () => {
  // Initialize all charts
  initCharts();
  
  // DOM Elements
  const portSelect = document.getElementById('port-select');
  const refreshPortsBtn = document.getElementById('refresh-ports');
  const connectBtn = document.getElementById('connect-btn');
  const disconnectBtn = document.getElementById('disconnect-btn');
  const connectionStatus = document.getElementById('connection-status');
  const cliInput = document.getElementById('cli-input');
  const cliSendBtn = document.getElementById('cli-send');
  const cliOutput = document.getElementById('cli-output');
  const cmdBtns = document.querySelectorAll('.cmd-btn');
  const loggingToggle = document.getElementById('logging-toggle');
  const selectLogFileBtn = document.getElementById('select-log-file');
  const logFilePath = document.getElementById('log-file-path');
  const selectFirmwareBtn = document.getElementById('select-firmware');
  const firmwareFileInput = document.getElementById('firmware-file');
  const updateFirmwareBtn = document.getElementById('update-firmware');
  const updateProgress = document.getElementById('update-progress');
  const updateProgressContainer = document.getElementById('update-progress-container');
  const updateStatus = document.getElementById('update-status');
  const clearChartsBtn = document.getElementById('clear-charts');
  const errorMessage = document.getElementById('error-message');
  
  // Additional DOM elements for enhanced UI
  const statCo2 = document.getElementById('stat-co2');
  const statAqi = document.getElementById('stat-aqi');
  const statVoc = document.getElementById('stat-voc');
  const statTemp = document.getElementById('stat-temp');
  const statHumidity = document.getElementById('stat-humidity');
  const statPm1 = document.getElementById('stat-pm1');
  const statPm25 = document.getElementById('stat-pm25');
  const statPm10 = document.getElementById('stat-pm10');
  const statPressure = document.getElementById('stat-pressure');
  const statElevation = document.getElementById('stat-elevation');
  const statBattery = document.getElementById('stat-batt');
  const infoFirmware = document.getElementById('info-firmware');
  const infoBatteryV = document.getElementById('info-battery-v');
  const logCount = document.getElementById('log-count');
  
  // Device clock elements
  const setTimeBtn = document.getElementById('set-time-btn');
  const autoTimeToggle = document.getElementById('auto-time-toggle');
  const clockNow = document.getElementById('clock-now');
  const clockTz = document.getElementById('clock-tz');
  const clockDevice = document.getElementById('clock-device');
  const clockStatus = document.getElementById('clock-status');
  
  // Device history elements
  const downloadHistoryBtn = document.getElementById('download-history-btn');
  const historyProgress = document.getElementById('history-progress');
  const historyProgressContainer = document.getElementById('history-progress-container');
  const historyStatus = document.getElementById('history-status');
  
  // Application state
  let isConnected = false;
  let selectedPort = null;
  let commandHistory = [];
  let commandIndex = -1;
  let selectedFirmwarePath = null;
  let loggedLines = 0;
  
  // Connection lifecycle state
  let connectionSeq = 0;          // bumps on every (re)connect/disconnect so stale startup tasks stop
  let lastConnectedPort = null;   // port to come back to after the device restarts or is replugged
  let reconnectWanted = false;    // true after an unexpected loss of the device
  let reconnecting = false;       // a reconnect attempt is in progress
  let reconnectPoll = null;       // faster port polling while waiting for the device
  let expectingClose = false;     // the user asked to disconnect
  let firmwareUpdating = false;   // the flash script owns the port
  const lineWaiters = new Set();  // pending request() calls waiting for a reply line
  let historyDump = null;         // history download in progress ($DATA_DUMP)
  let quietCareLog = false;       // Air Coach log download in progress ($CARE_LOG)
  
  // ODAK is a Raspberry Pi RP2040 (USB vendor 2e8a)
  const ODAK_USB_VENDOR_ID = '2e8a';
  // How long the device may stay busy (boot, PM warm-up, measurement) before it reads commands
  const DEVICE_READY_TIMEOUT_MS = 90000;
  const AUTO_TIME_KEY = 'odak.autoSetTime';
  const PRIORITY_KEY = 'odak.priorities';
  const BOARD_KEY = 'odak.board';
  const fw = {
    version: null,        // installed version read from the device, e.g. '2.9'
    board: null,          // 'v1' / 'v2' from that version
    readState: 'none',    // 'none' (not connected) | 'checking' | 'ok' | 'unknown' | 'no-reply'
    boards: null,         // the firmware list: { v1: {...}, v2: {...} }
    listError: null,
    loading: false,
    busy: false,
    offered: new Set(),   // updates already offered this session ('v2-2.10')
  };
  const MAX_CLI_LINES = 5000;
  
  // Setup event listeners
  setupEventListeners();
  
  // Handle API communications
  setupApiCommunication();
  
  function setupEventListeners() {
    // Port selection and connection
    connectBtn.addEventListener('click', () => connectToPort());
    disconnectBtn.addEventListener('click', disconnectPort);
    refreshPortsBtn.addEventListener('click', refreshPorts);
    portSelect.addEventListener('change', handlePortSelection);
    
    // CLI Interface
    cliSendBtn.addEventListener('click', sendCommand);
    cliInput.addEventListener('keydown', handleCliInputKeydown);
    
    // Add clear console button listener
    const clearConsoleBtn = document.getElementById('clear-console');
    if (clearConsoleBtn) {
      clearConsoleBtn.addEventListener('click', () => {
        clearCliOutput();
      });
    }
    
    // Add export console button listener
    const exportConsoleBtn = document.getElementById('export-console');
    if (exportConsoleBtn) {
      exportConsoleBtn.addEventListener('click', () => {
        exportConsoleOutput();
      });
    }
    
    cmdBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        const immediate = btn.dataset.immediate === 'true';
        
        if (immediate) {
          // Send immediately for commands that don't require values
          cliInput.value = cmd;
          sendCommand();
        } else {
          // Commands that take a value: fill "CMD," and let the user type it
          cliInput.value = `${cmd},`;
          cliInput.focus();
          if (btn.title) addToCliOutput(`${cmd}: ${btn.title}`, 'cli-info');
        }
      });
    });
    
    // Data logging
    loggingToggle.addEventListener('change', toggleLogging);
    selectLogFileBtn.addEventListener('click', selectLogFile);
    
    // Firmware update
    selectFirmwareBtn.addEventListener('click', selectFirmwareFile);
    updateFirmwareBtn.addEventListener('click', updateFirmware);
    byId('fw-install').addEventListener('click', installLatestFirmware);
    byId('fw-check').addEventListener('click', loadFirmwareList);
    byId('firmware-tab').addEventListener('shown.bs.tab', () => {
      if (!fw.boards && !fw.loading) loadFirmwareList();
    });
    byId('fw-board-select').addEventListener('change', () => {
      try { localStorage.setItem(BOARD_KEY, byId('fw-board-select').value); } catch (e) { /* ignore */ }
      renderFirmware();
    });
    byId('fw-modal-update').addEventListener('click', () => {
      bootstrap.Modal.getOrCreateInstance(byId('fw-modal')).hide();
      bootstrap.Tab.getOrCreateInstance(byId('firmware-tab')).show();
      installLatestFirmware();
    });
    try {
      const savedBoard = localStorage.getItem(BOARD_KEY);
      if (savedBoard) byId('fw-board-select').value = savedBoard;
    } catch (e) { /* ignore */ }
    
    // Charts
    clearChartsBtn.addEventListener('click', clearCharts);
    
    // Device clock
    setTimeBtn.addEventListener('click', () => setDeviceTime());
    try {
      autoTimeToggle.checked = localStorage.getItem(AUTO_TIME_KEY) !== 'false';
    } catch (e) { /* storage blocked: keep default */ }
    autoTimeToggle.addEventListener('change', () => {
      try { localStorage.setItem(AUTO_TIME_KEY, String(autoTimeToggle.checked)); } catch (e) { /* ignore */ }
    });
    tickClock();
    setInterval(tickClock, 1000);
    
    // Daily schedule
    byId('sched-save-btn').addEventListener('click', saveDeviceSchedule);
    byId('sched-read-btn').addEventListener('click', () => readDeviceSchedule());
    byId('sched-clear-btn').addEventListener('click', clearDeviceSchedule);
    for (const input of document.querySelectorAll('.schedule-profile input[type="time"]')) {
      input.addEventListener('input', renderScheduleVisuals);
    }
    byId('sched-copy-btn').addEventListener('click', () => {
      SCHEDULE_PHASES.forEach((_, i) => { byId(`sched-weekend-${i}`).value = byId(`sched-weekday-${i}`).value; });
      renderScheduleVisuals();
      setScheduleStatus('Weekend times copied from weekdays. Click "Save to device" to keep them.');
    });
    
    // Insights
    byId('ins-sync-btn').addEventListener('click', syncInsights);
    byId('ins-open-btn').addEventListener('click', openHistoryFile);
    byId('ins-export-btn').addEventListener('click', exportBackup);
    setupDropImport();
    
    // Priorities
    for (const c of priorityChecks()) {
      c.addEventListener('change', () => {
        updatePriorityPicker();
        setPriorityStatus(isConnected ? 'Click "Save to device" to keep this choice.' : 'Used in Insights. Connect to save it on the device.');
        insightsView.render();
      });
    }
    byId('prio-save-btn').addEventListener('click', saveDevicePriorities);
    try {
      const saved = JSON.parse(localStorage.getItem(PRIORITY_KEY) || '[]');
      if (Array.isArray(saved)) setPriorities(saved);
    } catch (e) { /* storage blocked or bad value */ }
    byId('insights-tab').addEventListener('shown.bs.tab', () => {
      insightsView.render();  // the chart needs a visible canvas
      // Fetch new measurements when the tab is opened (at most every 10 minutes)
      if (isConnected && insightsSource === 'device' && Date.now() - lastSyncAt > 10 * 60 * 1000) syncInsights();
    });
    byId('schedule-tab').addEventListener('shown.bs.tab', renderScheduleVisuals);
    
    // Device history
    downloadHistoryBtn.addEventListener('click', downloadHistory);
  }
  
  function setupApiCommunication() {
    // Listen for port list updates
    window.api.onPortsList((ports) => {
      updatePortList(ports);
    });
    
    // Listen for connection status updates
    window.api.onConnectionStatus((status) => {
      updateConnectionStatus(status);
    });
    
    // Listen for serial data
    window.api.onSerialData((data) => {
      processSerialData(data);
    });
    
    // Listen for errors
    window.api.onError((error) => {
      displayError(error);
    });
    
    // Listen for firmware update progress
    window.api.onFirmwareProgress((data) => {
      updateFirmwareProgress(data);
    });
  }
  
  // Port Management Functions
  function isOdakPort(port) {
    return (port.vendorId || '').toLowerCase() === ODAK_USB_VENDOR_ID;
  }
  
  function portLabel(port) {
    return isOdakPort(port) ? `${port.path} — ODAK` : `${port.path}`;
  }
  
  function updatePortList(portsData) {
    // Extract the ports list and connection info
    const ports = Array.isArray(portsData) ? portsData : (portsData.ports || []);
    const connectionInfo = !Array.isArray(portsData) ? {
      isConnected: portsData.isConnected,
      currentPort: portsData.currentPort
    } : { isConnected: false, currentPort: null };
    
    // Remember the currently selected port before updating the list
    // Prefer the selectedPort variable (set by handlePortSelection) if available
    const previouslySelectedPort = selectedPort || portSelect.value;
    
    // Don't modify button states if we're already connected
    if (connectionInfo.isConnected && isConnected) {
      // Still update the port list, but preserve connection state
      portSelect.innerHTML = '';
      
      ports.forEach(port => {
        const option = document.createElement('option');
        option.value = port.path;
        option.text = portLabel(port);
        
        // Select the current connected port
        if (port.path === connectionInfo.currentPort) {
          option.selected = true;
        }
        
        portSelect.add(option);
      });
      
      // Make sure buttons remain in the correct state
      connectBtn.disabled = true;
      disconnectBtn.disabled = false;
      return;
    }
    
    // If not connected, proceed with normal port list update
    portSelect.innerHTML = '';
    
    if (ports.length === 0) {
      const option = document.createElement('option');
      option.text = 'No ports available';
      option.disabled = true;
      portSelect.add(option);
      connectBtn.disabled = true;
    } else {
      let userSelectedPreserved = false;
      
      ports.forEach(port => {
        const option = document.createElement('option');
        option.value = port.path;
        option.text = portLabel(port);
        
        // Preserve user's previous selection if it still exists in the list
        if (previouslySelectedPort && port.path === previouslySelectedPort) {
          option.selected = true;
          userSelectedPreserved = true;
          selectedPort = previouslySelectedPort; // Update the selectedPort variable
        }
        
        portSelect.add(option);
      });
      
      // Otherwise preselect the first ODAK device
      const odakPort = ports.find(isOdakPort);
      if (!userSelectedPreserved && odakPort) {
        portSelect.value = odakPort.path;
      }
      
      // Only enable connect button if we're definitely not connected
      connectBtn.disabled = isConnected || reconnectWanted;
    }
    
    tryAutoReconnect(ports);
  }
  
  async function refreshPorts() {
    // Triggers the 'ports-list' event which is handled by the onPortsList listener
    try {
      await window.api.refreshPorts();
    } catch (error) {
      displayError({ message: 'Failed to refresh ports', details: error.message });
    }
  }
  
  // Track when user has explicitly selected a port
  function handlePortSelection() {
    if (portSelect.value) {
      selectedPort = portSelect.value;
    }
  }
  
  async function connectToPort(path = portSelect.value, { auto = false } = {}) {
    if (!path) return false;
    
    try {
      // Disable both buttons during the connection attempt
      connectBtn.disabled = true;
      disconnectBtn.disabled = true;
      
      const result = await window.api.connectToPort({ path });
      
      if (result.success) {
        selectedPort = path;
        handleConnected(path);
        return true;
      }
      if (auto) {
        // Expected while the device is still enumerating; keep waiting quietly
        addToCliOutput(`Reconnect attempt failed: ${result.error}`, 'cli-debug');
      } else {
        displayError({ message: 'Failed to connect', details: result.error });
      }
    } catch (error) {
      displayError({ message: 'Connection error', details: error.message });
    }
    // Reset buttons if connection failed (Disconnect cancels a pending reconnect)
    connectBtn.disabled = reconnectWanted;
    disconnectBtn.disabled = !reconnectWanted;
    return false;
  }
  
  function handleConnected(path) {
    isConnected = true;
    lastConnectedPort = path;
    stopReconnectWait();
    connectionSeq++;
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
    setTimeBtn.disabled = false;
    setScheduleButtons(true);
    downloadHistoryBtn.disabled = false;
    insSyncBtn.disabled = false;
    byId('prio-save-btn').disabled = false;
    connectionStatus.innerHTML = `<span class="badge connected"><i class="bi bi-link me-1"></i> Connected to ${path}</span>`;
    updateFirmwareBtn.disabled = !selectedFirmwarePath;
    addToCliOutput(`Connected to ${path}`, 'cli-command');
    runConnectTasks(connectionSeq);
  }
  
  async function disconnectPort() {
    // While waiting for the device to come back, Disconnect cancels the wait
    if (!isConnected && reconnectWanted) {
      stopReconnectWait();
      showDisconnected();
      addToCliOutput('Stopped waiting for the device', 'cli-command');
      return;
    }
    
    try {
      // Disable both buttons during the disconnection attempt
      connectBtn.disabled = true;
      disconnectBtn.disabled = true;
      expectingClose = true;
      
      const result = await window.api.disconnectPort();
      
      if (result.success) {
        // Immediately update UI state for successful disconnection
        isConnected = false;
        expectingClose = false;
        connectionSeq++;
        cancelLineWaiters();
        finishHistoryDump('Disconnected during the download.');
        showDisconnected();
        addToCliOutput('Disconnected from device', 'cli-command');
      } else {
        expectingClose = false;
        // Reset buttons if disconnection failed
        connectBtn.disabled = isConnected;
        disconnectBtn.disabled = !isConnected;
        displayError({ message: 'Failed to disconnect', details: result.error });
      }
    } catch (error) {
      expectingClose = false;
      // Reset buttons on error
      connectBtn.disabled = isConnected;
      disconnectBtn.disabled = !isConnected;
      displayError({ message: 'Disconnect error', details: error.message });
    }
  }
  
  function showDisconnected() {
    connectionStatus.innerHTML = '<span class="badge disconnected"><i class="bi bi-broadcast me-1"></i> Disconnected</span>';
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
    setTimeBtn.disabled = true;
    setScheduleButtons(false);
    setScheduleStatus('');
    downloadHistoryBtn.disabled = !historyCache;
    insSyncBtn.disabled = true;
    // Forget the board: another Odak may be plugged in next. The dropdown keeps the last one as a suggestion.
    if (!firmwareUpdating) {
      if (fw.board) byId('fw-board-select').value = fw.board;
      fw.version = null;
      fw.board = null;
      fw.readState = 'none';
      renderFirmware();
    }
    byId('prio-save-btn').disabled = true;
    clockDevice.textContent = '';
  }
  
  function updateConnectionStatus(status) {
    // Connections are reported by connectToPort(); here we only react to losing one
    if (status.connected || !isConnected) return;
    
    isConnected = false;
    connectionSeq++;
    cancelLineWaiters();
    finishHistoryDump('The device disconnected during the download.');
    
    if (expectingClose) {
      expectingClose = false;
      showDisconnected();
      return;
    }
    
    showDisconnected();
    if (firmwareUpdating) {
      // The flash script closed the port; we reconnect once the update is done
      connectionStatus.innerHTML = '<span class="badge bg-warning text-dark"><i class="bi bi-arrow-up-circle me-1"></i> Updating firmware…</span>';
      connectBtn.disabled = true;
      return;
    }
    
    // Lost without the user asking (unplug, SYS_RST): reconnect when it comes back
    addToCliOutput('Device disconnected — will reconnect when it comes back', 'cli-command');
    startReconnectWait();
  }
  
  // ─── Auto reconnect ─────────────────────────────────────────────────────────
  function startReconnectWait() {
    if (!lastConnectedPort) return;
    reconnectWanted = true;
    connectionStatus.innerHTML = '<span class="badge bg-warning text-dark"><i class="bi bi-hourglass-split me-1"></i> Device restarting / unplugged — waiting…</span>';
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;  // acts as "stop waiting"
    // Poll ports faster than the regular 5 s refresh while we wait
    clearInterval(reconnectPoll);
    reconnectPoll = setInterval(() => window.api.refreshPorts(), 1000);
  }
  
  function stopReconnectWait() {
    reconnectWanted = false;
    clearInterval(reconnectPoll);
    reconnectPoll = null;
  }
  
  async function tryAutoReconnect(ports) {
    if (!reconnectWanted || reconnecting || isConnected) return;
    // The device may come back on a different path (e.g. ttyACM0 -> ttyACM1)
    const port = ports.find(p => p.path === lastConnectedPort) || ports.find(isOdakPort);
    if (!port) return;
    
    reconnecting = true;
    try {
      // Give the device a moment to finish enumerating before opening it
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (reconnectWanted && !isConnected) {
        await connectToPort(port.path, { auto: true });
      }
    } finally {
      reconnecting = false;
    }
  }
  
  // ─── Request / reply ────────────────────────────────────────────────────────
  // Resolve with the first incoming line matching `match`, or null after `timeoutMs`
  function waitForLine(match, timeoutMs) {
    return new Promise((resolve) => {
      const waiter = { match, resolve };
      waiter.timer = setTimeout(() => {
        lineWaiters.delete(waiter);
        resolve(null);
      }, timeoutMs);
      lineWaiters.add(waiter);
    });
  }
  
  function deliverToWaiters(line) {
    for (const waiter of [...lineWaiters]) {
      if (waiter.match(line)) {
        lineWaiters.delete(waiter);
        clearTimeout(waiter.timer);
        waiter.resolve(line);
      }
    }
  }
  
  function cancelLineWaiters() {
    for (const waiter of lineWaiters) {
      clearTimeout(waiter.timer);
      waiter.resolve(null);
    }
    lineWaiters.clear();
  }
  
  // Send a command and wait for a matching reply line
  async function request(command, match, timeoutMs) {
    const reply = waitForLine(match, timeoutMs);
    const result = await window.api.sendCommand(command);
    if (!result.success) {
      cancelLineWaiters();
      return null;
    }
    return reply;
  }
  
  // ─── Startup tasks after connecting ─────────────────────────────────────────
  // Wait until the device is reading commands (it ignores them while booting or measuring)
  async function waitForDeviceReady(seq) {
    const reply = await request('$GET_SETTINGS', (l) => l.startsWith('Language:'), DEVICE_READY_TIMEOUT_MS);
    return reply !== null && seq === connectionSeq;
  }
  
  async function runConnectTasks(seq) {
    infoFirmware.textContent = 'checking…';
    setDeviceFirmware(null, 'checking');
    if (!(await waitForDeviceReady(seq))) {
      if (seq === connectionSeq) {
        infoFirmware.textContent = 'no reply';
        setDeviceFirmware(null);
        checkFirmwareAfterConnect(seq);
      }
      return;
    }
    const version = await request('$PRINT_VERSION', (l) => /^v\d+\.\d+/.test(l) || l.includes('Unknown command: PRINT_VERSION'), 5000);
    if (seq !== connectionSeq) return;
    infoFirmware.textContent = version === null ? 'no reply' : version.startsWith('v') ? version : 'older firmware (no version command)';
    setDeviceFirmware(version);
    checkFirmwareAfterConnect(seq);
    
    if (autoTimeToggle.checked) await setDeviceTime({ seq, alreadyReady: true });
    else await refreshDeviceTime(seq);
    if (seq === connectionSeq) await readDeviceSchedule({ seq, alreadyReady: true });
    if (seq === connectionSeq) await readDevicePriorities(seq);
  }
  
  // ─── Device clock ───────────────────────────────────────────────────────────
  // Protocol: $SET_TIME,<unix seconds, UTC>,<UTC offset in minutes>; $GET_TIME reads it back
  function formatOffset(minutes) {
    const sign = minutes >= 0 ? '+' : '-';
    const abs = Math.abs(minutes);
    return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  }
  
  function tickClock() {
    const now = new Date();
    clockNow.textContent = now.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
    const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    clockTz.textContent = `${formatOffset(-now.getTimezoneOffset())} ${tzName}`;
  }
  
  function setClockStatus(text, kind = 'muted') {
    clockStatus.className = `small text-${kind}`;
    clockStatus.textContent = text;
  }
  
  // Show the device's own clock ($GET_TIME)
  async function refreshDeviceTime(seq = connectionSeq) {
    const reply = await request('$GET_TIME', (l) => l.startsWith('Time:') || l.includes('Unknown command: GET_TIME'), 5000);
    if (seq !== connectionSeq) return;
    if (reply === null) {
      clockDevice.textContent = '';
    } else if (reply.includes('Unknown command')) {
      clockDevice.innerHTML = '<span class="text-muted">Device clock: not available in this firmware</span>';
    } else if (reply.startsWith('Time: not set')) {
      clockDevice.innerHTML = '<span class="text-warning fw-medium"><i class="bi bi-exclamation-triangle me-1"></i>Device clock is not set</span>';
    } else {
      // "Time: 2026-10-15 09:18:18 UTC (local 2026-10-15 12:18:18, offset +180 min)"
      const local = /local ([\d-]+ [\d:]+)/.exec(reply);
      clockDevice.innerHTML = '<span class="text-success fw-medium"><i class="bi bi-check-circle me-1"></i></span>';
      clockDevice.firstChild.append(`Device clock: ${local ? local[1] : reply.slice(6)}`);
    }
  }
  
  async function setDeviceTime({ seq = connectionSeq, alreadyReady = false } = {}) {
    if (!isConnected) return;
    setTimeBtn.disabled = true;
    try {
      if (!alreadyReady) {
        setClockStatus('Waiting for the device to finish what it is doing…');
        if (!(await waitForDeviceReady(seq))) {
          if (seq === connectionSeq) setClockStatus('The device did not respond.', 'danger');
          return;
        }
      }
      // Take the time right before sending so it isn't stale
      const now = new Date();
      const epoch = Math.floor(now.getTime() / 1000);
      const offset = -now.getTimezoneOffset();
      const reply = await request(
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
    } catch (error) {
      setClockStatus(`Failed: ${error.message}`, 'danger');
    } finally {
      setTimeBtn.disabled = !isConnected;
    }
  }
  
  // ─── Daily schedule ─────────────────────────────────────────────────────────
  // Protocol: $SET_SCHEDULE,<weekday|weekend>,<wake>,<focus>,<rest>,<sleep>  (HH:MM)
  //           $GET_SCHEDULE -> "Schedule weekday: wake 07:00, focus 09:00, rest 18:00, sleep 23:00"
  //                            "Schedule weekend: ..."  or  "Schedule: not set"
  //           $CLEAR_SCHEDULE -> "Schedule cleared"
  function byId(id) { return document.getElementById(id); }
  function schedButtons() { return [byId('sched-save-btn'), byId('sched-read-btn'), byId('sched-clear-btn')]; }

  function setScheduleStatus(text, kind = 'muted') {
    const el = byId('sched-status');
    el.className = `small text-${kind}`;
    el.textContent = text;
  }

  // Point at the day plan that has a problem
  function showScheduleProfile(profile) {
    const el = document.querySelector(`.schedule-profile[data-profile="${profile}"]`);
    el.classList.add('has-error');
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  
  /** The schedule in the form as minutes, for Insights; null while it has an error. */
  function getSchedule() {
    const result = {};
    for (const profile of SCHEDULE_PROFILES) {
      const plan = readSchedulePlan(profile);
      if (plan.error) return null;
      result[profile] = plan.times.map(toMinutes);
    }
    return result;
  }
  
  function formatDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
  }
  
  /** Coloured 24-hour bar for a day plan (minutes of wake, focus, rest, sleep). */
  function scheduleBarHtml(plan, { ticks = true } = {}) {
    const marks = [...new Set([0, ...plan, 1440])].sort((a, b) => a - b);
    const segments = [];
    for (let i = 0; i < marks.length - 1; i++) {
      const from = marks[i];
      const to = marks[i + 1];
      if (to <= from) continue;
      // The phase running at `from` is the one that started most recently
      let phase = 0;
      let back = 1440;
      plan.forEach((start, p) => {
        const d = (from - start + 1440) % 1440;
        if (d < back) { back = d; phase = p; }
      });
      const width = ((to - from) / 1440) * 100;
      const p = PHASES[phase];
      segments.push(`<div class="sched-seg" style="width:${width}%;background:${p.color}" title="${p.name}">${width > 9 ? `<i class="bi ${p.icon}"></i> ${p.name}` : ''}</div>`);
    }
    const tickHtml = ticks ? `<div class="sched-ticks">${[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => `<span style="left:${(h / 24) * 100}%">${String(h).padStart(2, '0')}</span>`).join('')}</div>` : '';
    return `<div class="sched-segs">${segments.join('')}</div>${tickHtml}`;
  }
  
  // Redraw durations, the two day bars and the week overview from the form
  function renderScheduleVisuals() {
    const plans = {};
    for (const profile of SCHEDULE_PROFILES) {
      const plan = readSchedulePlan(profile);
      const box = document.querySelector(`.schedule-profile[data-profile="${profile}"]`);
      box.classList.toggle('has-error', !!plan.error);
      if (plan.error) {
        byId(`sched-bar-${profile}`).innerHTML = `<div class="sched-error small"><i class="bi bi-exclamation-triangle me-1"></i>${plan.error.replace(/^[^:]+: /, '')}</div>`;
        SCHEDULE_PHASES.forEach((_, i) => { byId(`sched-dur-${profile}-${i}`).textContent = ''; });
        continue;
      }
      const minutes = plan.times.map(toMinutes);
      plans[profile] = minutes;
      minutes.forEach((start, i) => {
        const next = minutes[(i + 1) % 4];
        byId(`sched-dur-${profile}-${i}`).textContent = formatDuration((next - start + 1440) % 1440);
      });
      byId(`sched-bar-${profile}`).innerHTML = scheduleBarHtml(minutes);
    }
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    byId('sched-week').innerHTML = days.map((day, i) => {
      const profile = i >= 5 ? 'weekend' : 'weekday';
      return `<div class="sched-week-row ${profile}"><span class="sched-week-day">${day}</span>
        <div class="sched-bar flex-grow-1">${plans[profile] ? scheduleBarHtml(plans[profile], { ticks: i === 6 }) : '<div class="sched-error small">Fix the times above</div>'}</div></div>`;
    }).join('');
    insightsView.render();
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
    const times = SCHEDULE_PHASES.map((_, i) => byId(`sched-${profile}-${i}`).value);
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
    if (!isConnected) return;
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
      setScheduleButtons(isConnected);
    }
  }

  async function readDeviceSchedule({ seq = connectionSeq, alreadyReady = false } = {}) {
    await withDevice(seq, alreadyReady, async () => {
      const unknown = (l) => l.includes('Unknown command: GET_SCHEDULE');
      const notSet = (l) => l.startsWith('Schedule: not set');
      const replies = SCHEDULE_PROFILES.map((p) => waitForLine((l) => l.startsWith(`Schedule ${p}:`) || notSet(l) || unknown(l), 5000));
      const sent = await window.api.sendCommand('$GET_SCHEDULE');
      if (!sent.success) cancelLineWaiters();
      const [weekday, weekend] = await Promise.all(replies);
      if (seq !== connectionSeq) return;
      if (weekday === null) return setScheduleStatus('No answer to GET_SCHEDULE.', 'danger');
      if (unknown(weekday)) return setScheduleStatus('This firmware does not support schedules yet.', 'warning');
      if (notSet(weekday)) return setScheduleStatus('No schedule on the device yet — adjust the times and save.', 'warning');
      for (const [profile, line] of [['weekday', weekday], ['weekend', weekend]]) {
        const times = line ? line.match(/\d{2}:\d{2}/g) : null;
        if (times && times.length === 4) times.forEach((t, i) => { byId(`sched-${profile}-${i}`).value = t; });
      }
      renderScheduleVisuals();
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
        const reply = await request(
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
      const reply = await request('$CLEAR_SCHEDULE', (l) => l.startsWith('Schedule cleared') || l.includes('Unknown command: CLEAR_SCHEDULE'), 5000);
      if (seq !== connectionSeq) return;
      if (reply === null) setScheduleStatus('No answer to CLEAR_SCHEDULE.', 'danger');
      else if (reply.includes('Unknown command')) setScheduleStatus('This firmware does not support schedules yet.', 'warning');
      else setScheduleStatus('Schedule removed from the device.', 'success');
    });
  }
  
  // ─── Priorities ─────────────────────────────────────────────────────────────
  // Protocol: $SET_PRIORITY[,<a>[,<b>]]  (0 allergy, 1 infection, 2 fatigue/migraine, 3 focus; up to 2; none = clear)
  //           $GET_PRIORITY -> "Priority: 0 allergy 3 focus"  or  "Priority: not set"
  function priorityChecks() {
    return [...document.querySelectorAll('.priority-check')];
  }
  
  function getPriorities() {
    return priorityChecks().filter(c => c.checked).map(c => Number(c.value));
  }
  
  function setPriorityStatus(text, kind = 'muted') {
    const el = byId('prio-status');
    el.className = `small text-${kind}`;
    el.textContent = text;
  }
  
  // At most two; remember the choice for when no device is connected
  function updatePriorityPicker() {
    const chosen = getPriorities();
    for (const c of priorityChecks()) {
      c.disabled = !c.checked && chosen.length >= 2;
      c.closest('.priority-option').classList.toggle('selected', c.checked);
    }
    try { localStorage.setItem(PRIORITY_KEY, JSON.stringify(chosen)); } catch (e) { /* ignore */ }
  }
  
  function setPriorities(list) {
    for (const c of priorityChecks()) c.checked = list.includes(Number(c.value));
    updatePriorityPicker();
  }
  
  async function readDevicePriorities(seq) {
    const reply = await request('$GET_PRIORITY', (l) => l.startsWith('Priority:') || l.includes('Unknown command: GET_PRIORITY'), 5000);
    if (seq !== connectionSeq || reply === null) return;
    if (reply.includes('Unknown command')) {
      setPriorityStatus('This firmware has no Air Coach yet; priorities are only used in Insights.', 'warning');
      return;
    }
    setPriorities(reply.includes('not set') ? [] : [...reply.matchAll(/(\d) [a-z]+/g)].map(m => Number(m[1])));
    setPriorityStatus(reply.includes('not set') ? 'No priorities on the device yet.' : 'Showing the priorities stored on the device.', reply.includes('not set') ? 'warning' : 'success');
    insightsView.render();
  }
  
  async function saveDevicePriorities() {
    if (!isConnected) return;
    const seq = connectionSeq;
    const chosen = getPriorities();
    const button = byId('prio-save-btn');
    button.disabled = true;
    try {
      setPriorityStatus('Waiting for the device to finish what it is doing…');
      if (!(await waitForDeviceReady(seq))) {
        if (seq === connectionSeq) setPriorityStatus('The device did not respond.', 'danger');
        return;
      }
      const reply = await request(
        `$SET_PRIORITY${chosen.length ? `,${chosen.join(',')}` : ''}`,
        (l) => l.startsWith('Priority:') || l.startsWith('SET_PRIORITY error') || l.includes('Unknown command: SET_PRIORITY'),
        5000,
      );
      if (seq !== connectionSeq) return;
      if (reply === null) setPriorityStatus('No answer to SET_PRIORITY.', 'danger');
      else if (reply.includes('Unknown command')) setPriorityStatus('This firmware has no Air Coach yet.', 'warning');
      else if (reply.startsWith('SET_PRIORITY error')) setPriorityStatus('The device rejected the priorities.', 'danger');
      else setPriorityStatus(`Priorities saved at ${new Date().toLocaleTimeString()}.`, 'success');
    } finally {
      button.disabled = !isConnected;
    }
  }
  
  /** Put a plan from a backup into the form ({ schedule: { weekday, weekend } in minutes, priorities }). */
  function applyPlan(plan) {
    if (plan.schedule) {
      for (const profile of SCHEDULE_PROFILES) {
        const minutes = plan.schedule[profile];
        if (!Array.isArray(minutes) || minutes.length !== 4) continue;
        minutes.forEach((m, i) => { byId(`sched-${profile}-${i}`).value = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; });
      }
      renderScheduleVisuals();
    }
    if (Array.isArray(plan.priorities)) setPriorities(plan.priorities);
  }
  
  // ─── Device history ($DATA_DUMP) ────────────────────────────────────────────
  // Protocol: $DATA_DUMP[,<from seq>] answers
  //   DATA_BEGIN,<count>
  //   seq,time_utc,time_valid,co2_ppm,...   (CSV header)
  //   <count> CSV rows, oldest first
  //   DATA_END,<sent>
  // Firmware without a data log answers "Data log: not available ..." or "Unknown command: DATA_DUMP".
  const HISTORY_IDLE_TIMEOUT_MS = 15000;
  const POLLUTANT_NAMES = {
    1: 'Clean air',
    2: 'CO2 (moderate)', 3: 'VOC (moderate)', 4: 'PM2.5 (moderate)',
    5: 'CO2 (high)', 6: 'VOC (high)', 7: 'PM2.5 (high)',
  };
  
  function setHistoryStatus(text, kind = 'muted') {
    historyStatus.className = `small mt-2 text-${kind}`;
    historyStatus.textContent = text;
  }
  
  function setHistoryProgress(percent, kind) {
    historyProgressContainer.classList.toggle('d-none', percent === null);
    if (percent === null) return;
    historyProgress.style.width = `${percent}%`;
    historyProgress.classList.toggle('bg-danger', kind === 'danger');
    historyProgress.classList.toggle('bg-success', kind === 'success');
    historyProgress.classList.toggle('progress-bar-animated', !kind);
  }
  
  // Returns true when the line belongs to the download
  function collectHistoryLine(line) {
    const dump = historyDump;
    if (line.startsWith('{')) return false;  // live sensor JSON
    dump.lastLineAt = Date.now();
    
    if (dump.state === 'waiting') {
      if (line.startsWith('DATA_BEGIN,')) {
        dump.expected = parseInt(line.split(',')[1], 10) || 0;
        dump.state = 'header';
        return true;
      }
      if (line.startsWith('Data log: not available')) {
        finishHistoryDump('This device has no data log (flash not available).');
      } else if (line.includes('Unknown command: DATA_DUMP')) {
        finishHistoryDump('This firmware does not store history yet. Update the firmware first.');
      }
      return false;
    }
    if (dump.state === 'header') {
      dump.columns = line.split(',').map(c => c.trim());
      dump.state = 'rows';
      return true;
    }
    if (line.startsWith('DATA_END,')) {
      const sent = parseInt(line.split(',')[1], 10);
      if (sent !== dump.rows.length) {
        finishHistoryDump(`Download incomplete: received ${dump.rows.length} of ${sent} records.`);
      } else {
        finishHistoryDump(null);
      }
      return true;
    }
    dump.rows.push(line.split(','));
    if (dump.rows.length % 50 === 0 && dump.expected > 0) dump.onProgress(dump.rows.length, dump.expected);
    return true;
  }
  
  // Ends the download; `error` is null on success
  function finishHistoryDump(error) {
    const dump = historyDump;
    if (!dump) return;
    historyDump = null;
    clearInterval(dump.watchdog);
    dump.resolve({ error, columns: dump.columns, rows: dump.rows });
  }
  
  function formatLocal(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
      `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }
  
  // Turn the device's CSV rows into records, adding readable time and pollutant columns
  function buildHistory(deviceColumns, rows) {
    const columns = [];
    for (const column of deviceColumns) {
      columns.push(column);
      if (column === 'time_utc') columns.push('time_iso_utc', 'time_local');
      if (column === 'pollutant') columns.push('pollutant_name');
    }
    const records = rows.map((row) => {
      const record = {};
      deviceColumns.forEach((column, i) => {
        const value = row[i] === undefined ? '' : row[i].trim();
        record[column] = value !== '' && !Number.isNaN(Number(value)) ? Number(value) : value;
      });
      if ('time_utc' in record) {
        const date = new Date(Number(record.time_utc) * 1000);
        const valid = record.time_valid === undefined || Number(record.time_valid) === 1;
        record.time_iso_utc = date.toISOString().replace('.000Z', 'Z');
        record.time_local = valid ? formatLocal(date) : '';  // clock was not set when it was stored
      }
      if ('pollutant' in record) record.pollutant_name = POLLUTANT_NAMES[record.pollutant] || '';
      // Same field order as the CSV columns
      return Object.fromEntries(columns.map(column => [column, record[column]]));
    });
    return { columns, records };
  }
  
  /** Run $DATA_DUMP[,from] and collect the rows. Resolves { error, columns, rows }. */
  async function dumpHistory(fromSeq, onProgress) {
    const done = new Promise((resolve) => {
      historyDump = { state: 'waiting', expected: 0, columns: [], rows: [], lastLineAt: Date.now(), onProgress, resolve };
    });
    historyDump.watchdog = setInterval(() => {
      if (historyDump && Date.now() - historyDump.lastLineAt > HISTORY_IDLE_TIMEOUT_MS) {
        finishHistoryDump(historyDump.state === 'waiting' ? 'No answer to DATA_DUMP.' : 'The device stopped sending data.');
      }
    }, 1000);
    const sent = await window.api.sendCommand(fromSeq > 0 ? `$DATA_DUMP,${fromSeq}` : '$DATA_DUMP');
    if (!sent.success) finishHistoryDump(sent.error || 'Could not send DATA_DUMP.');
    return done;
  }
  
  /**
   * $DATA_STATUS -> "Data log: 432 records, 3 of 1024 KB used"
   *                 "  oldest #1  2026-10-15 19:16:06 UTC"   "  newest #432  2026-10-16 16:24:00 UTC"
   * Resolves { count, oldest: { seq, time }, newest: { seq, time } } or { error }.
   */
  async function readDataStatus() {
    const record = (which) => waitForLine((l) => l.startsWith(`  ${which} #`), 3000);
    const oldestLine = record('oldest');
    const newestLine = record('newest');
    const head = await request('$DATA_STATUS', (l) => l.startsWith('Data log:') || l.includes('Unknown command: DATA_STATUS'), 5000);
    const parse = (line) => {
      const m = line && /#(\d+)\s+(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) UTC/.exec(line);
      return m ? { seq: Number(m[1]), time: Date.UTC(m[2], m[3] - 1, m[4], m[5], m[6], m[7]) / 1000 } : null;
    };
    if (head === null) return { error: 'No answer to DATA_STATUS.' };
    if (head.includes('Unknown command')) return { error: 'This firmware does not store history yet. Update the firmware first.' };
    if (head.startsWith('Data log: not available')) return { error: 'This device has no data log (flash not available).' };
    const count = Number((/Data log: (\d+) records/.exec(head) || [])[1] || 0);
    if (count === 0) {
      cancelLineWaiters();
      return { count: 0 };
    }
    const [oldest, newest] = (await Promise.all([oldestLine, newestLine])).map(parse);
    return { count, oldest, newest };
  }
  
  /**
   * $CARE_LOG -> CARE_BEGIN,<n> / header / rows / CARE_END,shown=..,done=..,improved=..,prevented=..
   * Resolves the parsed entries, or null on firmware without the Air Coach.
   */
  async function readCareLog() {
    const lines = [];
    let collecting = false;
    const end = waitForLine((l) => {
      if (l.startsWith('CARE_BEGIN,')) { collecting = true; return false; }
      if (l.startsWith('CARE_END') || l.includes('Unknown command: CARE_LOG')) return true;
      if (collecting && !l.startsWith('local_time,') && !l.startsWith('{')) lines.push(l);
      return false;
    }, 15000);
    quietCareLog = true;  // keep the rows out of the console
    const sent = await window.api.sendCommand('$CARE_LOG');
    if (!sent.success) { cancelLineWaiters(); quietCareLog = false; return null; }
    const last = await end;
    quietCareLog = false;
    if (last === null || last.includes('Unknown command')) return null;
    return parseCareLog(lines);
  }
  
  // ─── History cache and sync ─────────────────────────────────────────────────
  // Everything downloaded so far is kept on disk ({ columns, rows, syncedAt }); a sync
  // only asks the device for records newer than the cache, and keeps data the device
  // has already overwritten. A device that was erased or swapped starts a new cache.
  let historyCache = null;
  let historySync = null;          // sync in progress (promise)
  let lastSyncAt = 0;
  
  function cacheSeqs() {
    if (!historyCache || historyCache.rows.length === 0) return null;
    const i = historyCache.columns.indexOf('seq');
    const rows = historyCache.rows;
    return { first: Number(rows[0][i]), last: Number(rows[rows.length - 1][i]), index: i };
  }
  
  /** Add downloaded rows to the cache; columns are matched by name (they change between firmware versions). */
  function mergeIntoCache(columns, rows) {
    if (!historyCache) {
      historyCache = { columns: [...columns], rows: [], syncedAt: 0 };
    }
    const cache = historyCache;
    const added = columns.filter((c) => !cache.columns.includes(c));
    if (added.length) {
      cache.columns.push(...added);
      for (const row of cache.rows) row.push(...added.map(() => ''));
    }
    const positions = cache.columns.map((c) => columns.indexOf(c));
    const seqIndex = columns.indexOf('seq');
    const last = cacheSeqs()?.last ?? -1;
    let count = 0;
    for (const row of rows) {
      if (Number(row[seqIndex]) <= last) continue;
      cache.rows.push(positions.map((i) => (i < 0 || row[i] === undefined ? '' : row[i].trim())));
      count++;
    }
    return count;
  }
  
  /**
   * Bring the cache up to date with the device. `ui` = { status(text, kind), progress(percent|null, kind) }.
   * Resolves { added, total } or { error }.
   */
  function syncHistory(ui) {
    if (historySync) return historySync;
    historySync = (async () => {
      const seq = connectionSeq;
      try {
        ui.progress(0);
        ui.status('Waiting for the device to finish what it is doing…');
        if (!(await waitForDeviceReady(seq))) return { error: 'The device did not respond.' };
        
        const status = await readDataStatus();
        if (status.error) return status;
        
        let from = 0;
        const cached = cacheSeqs();
        if (cached && status.count > 0) {
          const cachedOldest = historyCache.rows.find((r) => Number(r[cached.index]) === status.oldest?.seq);
          const timeIndex = historyCache.columns.indexOf('time_utc');
          const sameDevice = status.newest && status.newest.seq >= cached.last
            && (!cachedOldest || !status.oldest || Number(cachedOldest[timeIndex]) === status.oldest.time);
          if (sameDevice) {
            from = cached.last + 1;
          } else {
            historyCache = null;  // erased or a different device: start over
          }
        }
        
        let added = 0;
        if (status.count > 0 && (!historyCache || from <= status.newest.seq)) {
          ui.status('Reading stored measurements…');
          const result = await dumpHistory(from, (got, total) => {
            ui.progress(Math.min(99, Math.round((got / total) * 100)));
            ui.status(`Downloading… ${got} of ${total} records`);
          });
          if (result.error) return { error: result.error };
          added = mergeIntoCache(result.columns, result.rows);
        }
        
        // Air Coach log ($CARE_LOG): the device keeps the last 480 cards, the cache keeps all
        let careAdded = 0;
        const care = await readCareLog();
        if (care && historyCache) {
          // New cards, or cards whose answer / outcome changed since the last sync
          const known = new Map((historyCache.care || []).map(e => [`${e.t}|${e.action}`, `${e.answer}|${e.outcome}`]));
          careAdded = care.filter(e => known.get(`${e.t}|${e.action}`) !== `${e.answer}|${e.outcome}`).length;
          historyCache.care = mergeCareLog(historyCache.care, care);
        }
        if (historyCache) {
          historyCache.syncedAt = Date.now();
          const saved = await window.api.saveHistoryCache(historyCache);
          if (!saved.success) addToCliOutput(`Could not save the history cache: ${saved.error}`, 'cli-warning');
        }
        lastSyncAt = Date.now();
        showDeviceHistory();
        return { added, careAdded, total: historyCache ? historyCache.rows.length : 0 };
      } catch (error) {
        finishHistoryDump(error.message);
        return { error: error.message };
      } finally {
        historySync = null;
      }
    })();
    return historySync;
  }
  
  // Sidebar: download (sync) and save everything stored as CSV or JSON
  async function downloadHistory() {
    downloadHistoryBtn.disabled = true;
    const ui = { status: setHistoryStatus, progress: setHistoryProgress };
    try {
      if (isConnected) {
        const result = await syncHistory(ui);
        if (result.error) {
          setHistoryStatus(result.error, 'danger');
          setHistoryProgress(100, 'danger');
          return;
        }
      }
      if (!historyCache || historyCache.rows.length === 0) {
        setHistoryStatus('The device has no stored measurements yet.', 'warning');
        setHistoryProgress(null);
        return;
      }
      
      setHistoryProgress(100, 'success');
      const history = buildHistory(historyCache.columns, historyCache.rows);
      const first = history.records[0];
      const last = history.records[history.records.length - 1];
      const range = first.time_local && last.time_local ? ` (${first.time_local} → ${last.time_local})` : '';
      setHistoryStatus(`${history.records.length} records${range}. Choose where to save…`);
      
      const saved = await window.api.saveHistory(history);
      if (saved.success) {
        setHistoryStatus(`Saved ${history.records.length} records${range} to ${saved.filePath}`, 'success');
        addToCliOutput(`Device history saved to: ${saved.filePath}`, 'cli-info');
      } else if (saved.canceled) {
        setHistoryStatus(`${history.records.length} records${range} ready, but not saved.`, 'warning');
      } else {
        setHistoryStatus(`Could not save the file: ${saved.error}`, 'danger');
      }
    } finally {
      downloadHistoryBtn.disabled = !isConnected && !historyCache;
    }
  }
  
  // ─── Insights tab ───────────────────────────────────────────────────────────
  const insightsView = new InsightsView({
    viewButtons: [...document.querySelectorAll('#insights [data-view]')],
    prev: byId('ins-prev'),
    next: byId('ins-next'),
    today: byId('ins-today'),
    date: byId('ins-date'),
    metric: byId('ins-metric'),
    title: byId('ins-title'),
    summary: byId('ins-summary'),
    content: byId('ins-content'),
    chartWrap: byId('ins-chart-wrap'),
    chart: byId('ins-chart'),
    coach: byId('ins-coach'),
  }, getSchedule, getPriorities);
  const insSyncBtn = byId('ins-sync-btn');
  let insightsSource = 'device';   // 'device' (cache) or a file name
  
  function setInsightsStatus(text, kind = 'muted') {
    const el = byId('ins-status');
    el.className = `small mb-2 text-${kind}`;
    el.textContent = text;
  }
  
  function setInsightsProgress(percent, kind) {
    byId('ins-progress-container').classList.toggle('d-none', percent === null || kind === 'success');
    if (percent === null) return;
    const bar = byId('ins-progress');
    bar.style.width = `${percent}%`;
    bar.classList.toggle('bg-danger', kind === 'danger');
  }
  
  function describeData(samples, care, source) {
    if (samples.length === 0) return source;
    const day = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const coach = care.length ? ` · ${care.length} coach suggestions` : '';
    return `${source} · ${samples.length.toLocaleString()} measurements${coach} · ${day(samples[0].t)} – ${day(samples[samples.length - 1].t)}`;
  }
  
  function showDeviceHistory() {
    insightsSource = 'device';
    const samples = historyCache ? samplesFromHistory(historyCache.columns, historyCache.rows) : [];
    const care = historyCache?.care || [];
    const synced = historyCache?.syncedAt ? `synced ${new Date(historyCache.syncedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : '';
    byId('ins-data-info').textContent = samples.length ? describeData(samples, care, `Device data${synced ? `, ${synced}` : ''}`) : '';
    insightsView.setData(samples, care);
    downloadHistoryBtn.disabled = !isConnected && !historyCache;
    byId('ins-export-btn').disabled = !historyCache;
  }
  
  async function syncInsights() {
    insSyncBtn.disabled = true;
    try {
      const result = await syncHistory({ status: setInsightsStatus, progress: setInsightsProgress });
      if (result.error) {
        setInsightsStatus(result.error, 'danger');
        setInsightsProgress(100, 'danger');
      } else {
        setInsightsProgress(null);
        const parts = [];
        if (result.added > 0) parts.push(`${result.added.toLocaleString()} new measurements`);
        if (result.careAdded > 0) parts.push(`${result.careAdded} coach updates`);
        setInsightsStatus(parts.length ? `Downloaded ${parts.join(' and ')}.` : 'Up to date.', 'success');
      }
    } finally {
      insSyncBtn.disabled = !isConnected;
    }
  }
  
  /** Show an imported file (backup or history) in Insights; the device cache is not changed. */
  function importText(text, fileName) {
    try {
      const data = parseImportFile(text, fileName);
      const samples = samplesFromHistory(data.columns, data.rows);
      if (samples.length === 0) {
        setInsightsStatus('No measurements found in that file.', 'warning');
        return;
      }
      // A backup carries its owner's plan; use it while no device is connected
      if (data.plan && !isConnected) applyPlan(data.plan);
      insightsSource = fileName;
      byId('ins-data-info').textContent = describeData(samples, data.care, `Imported ${fileName}`);
      setInsightsStatus(`Showing ${fileName}${data.plan && !isConnected ? ' with its plan' : ''}. Click "Sync from device" to go back to your device's data.`);
      insightsView.setData(samples, data.care);
    } catch (error) {
      setInsightsStatus(`Could not read the file: ${error.message}`, 'danger');
    }
  }
  
  async function openHistoryFile() {
    const result = await window.api.openHistoryFile();
    if (!result.success) {
      if (!result.canceled) setInsightsStatus(`Could not open the file: ${result.error}`, 'danger');
      return;
    }
    importText(result.content, result.filePath.split(/[\\/]/).pop());
  }
  
  // Drop a backup or history file anywhere on the Insights tab
  function setupDropImport() {
    const pane = byId('insights');
    const hint = byId('ins-drop');
    let depth = 0;
    pane.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; hint.classList.remove('d-none'); });
    pane.addEventListener('dragover', (e) => e.preventDefault());
    pane.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; hint.classList.add('d-none'); } });
    pane.addEventListener('drop', async (e) => {
      e.preventDefault();
      depth = 0;
      hint.classList.add('d-none');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (!/\.(csv|json)$/i.test(file.name)) {
        setInsightsStatus('Drop an Odak backup (.json) or a history file (.csv / .json).', 'warning');
        return;
      }
      importText(await file.text(), file.name);
    });
  }
  
  // A single file with everything: measurements, coach log and the plan
  async function exportBackup() {
    if (!historyCache) return;
    const backup = {
      format: 'odak-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      app: `ODAK Air Quality Monitor ${infoFirmware.textContent && infoFirmware.textContent.startsWith('v') ? `(firmware ${infoFirmware.textContent})` : ''}`.trim(),
      plan: { schedule: getSchedule(), priorities: getPriorities() },
      columns: historyCache.columns,
      rows: historyCache.rows,
      care: historyCache.care || [],
    };
    const result = await window.api.saveBackup(backup);
    if (result.success) setInsightsStatus(`Backup saved to ${result.filePath}`, 'success');
    else if (!result.canceled) setInsightsStatus(`Could not save the backup: ${result.error}`, 'danger');
  }
  
  // CLI Interface Functions
  async function sendCommand() {
    if (!isConnected) {
      displayError({ message: 'Not connected to device' });
      return;
    }
    
    const command = cliInput.value.trim();
    if (!command) return;
    
    try {
      // Add to history
      commandHistory.push(command);
      commandIndex = commandHistory.length;
      
      // Display command in output
      addToCliOutput(`$ ${command.replace(/^\$/, '')}`, 'cli-command');
      
      // Send command
      const formattedCommand = command.startsWith('$') ? command : `$${command}`;
      const result = await window.api.sendCommand(formattedCommand);
      
      if (!result.success) {
        addToCliOutput(`Error: ${result.error}`, 'cli-error');
      }
      
      // The device restarts after SYS_RST; auto-reconnect brings it back
      if (result.success && (result.isSystemReset || command.toUpperCase().includes('SYS_RST'))) {
        addToCliOutput('System reset sent. Reconnecting automatically when the device is back...', 'cli-info');
      }
      
      // Clear input
      cliInput.value = '';
    } catch (error) {
      displayError({ message: 'Command error', details: error.message });
    }
  }
  
  // Enhance CLI with colored output and timestamps
  function addToCliOutput(text, className = 'cli-output') {
    const line = document.createElement('div');
    line.className = className;
    
    // Add timestamp prefix to each line
    const timestamp = new Date().toTimeString().split(' ')[0] + '.' + String(new Date().getMilliseconds()).padStart(3, '0'); // Format as HH:MM:SS.mmm
    
    // Enhanced colored output based on content
    if (className === 'cli-output') {
      if (text.includes('ERROR ') || text.startsWith('Unknown command')) {
        line.className = 'cli-error';
      } else if (text.includes('WARNING ') || text.includes('WARN ')) {
        line.className = 'cli-warning';
      } else if (text.includes('INFO ') || text.includes('success') || text.includes('Success')) {
        line.className = 'cli-info';
      } else if (text.includes('TRACE ') || text.includes('DEBUG ')) {
        line.className = 'cli-debug';
      } else if (text.includes('FATAL ')) {
        line.className = 'cli-fatal';
      }
    }
    
    // Add timestamp prefix except for command lines (which already have $ prefix)
    if (className === 'cli-command') {
      line.textContent = text;
    } else {
      line.textContent = `[${timestamp}] ${text}`;
    }
    
    // Only follow new output if the user hasn't scrolled up to read something
    const atBottom = cliOutput.scrollHeight - cliOutput.scrollTop - cliOutput.clientHeight < 40;
    cliOutput.appendChild(line);
    while (cliOutput.childElementCount > MAX_CLI_LINES) cliOutput.firstElementChild.remove();
    if (atBottom) cliOutput.scrollTop = cliOutput.scrollHeight;
  }
  
  function handleCliInputKeydown(event) {
    if (event.key === 'Enter') {
      sendCommand();
    } else if (event.key === 'ArrowUp') {
      navigateCommandHistory(-1);
      event.preventDefault();
    } else if (event.key === 'ArrowDown') {
      navigateCommandHistory(1);
      event.preventDefault();
    }
  }
  
  function navigateCommandHistory(direction) {
    if (commandHistory.length === 0) return;
    
    commandIndex += direction;
    
    if (commandIndex < 0) {
      commandIndex = 0;
    } else if (commandIndex >= commandHistory.length) {
      commandIndex = commandHistory.length;
      cliInput.value = '';
      return;
    }
    
    cliInput.value = commandHistory[commandIndex];
    
    // Move cursor to end
    setTimeout(() => {
      cliInput.selectionStart = cliInput.value.length;
      cliInput.selectionEnd = cliInput.value.length;
    }, 0);
  }
  
  // Data Processing
  function processSerialData(data) {
    deliverToWaiters(data);
    
    // History rows go to the download, not the console
    if (historyDump && collectHistoryLine(data)) return;
    if (quietCareLog && !data.startsWith('{')) return;
    
    // The main process writes the line to the log file; count it here
    if (loggingToggle.checked && logFilePath.textContent) {
      loggedLines++;
      logCount.textContent = `${loggedLines} line${loggedLines === 1 ? '' : 's'} recorded`;
    }
    
    // Try to parse as JSON
    try {
      if (data.startsWith('{') && data.endsWith('}')) {
        const jsonData = JSON.parse(data);
        updateSensorReadings(jsonData);
      } else {
        // Add as terminal output
        addToCliOutput(data);
      }
    } catch (error) {
      // Not JSON, treat as text output
      addToCliOutput(data);
    }
  }
  
  function updateSensorReadings(data) {
    // Skip missing or non-numeric values instead of failing on .toFixed()
    const show = (statEl, chartKey, value, format) => {
      if (value === undefined || value === null || Number.isNaN(Number(value))) return;
      statEl.textContent = format(Number(value));
      addDataPoint(chartKey, Number(value));
    };
    
    show(statTemp, 'temperature', data.temperature, (v) => `${v.toFixed(1)} °C`);
    show(statHumidity, 'humidity', data.humidity, (v) => `${v.toFixed(1)} %`);
    show(statCo2, 'co2', data.co2, (v) => `${v.toFixed(0)} ppm`);
    show(statVoc, 'voc', data.voc, (v) => `${v.toFixed(0)} index`);
    show(statPm1, 'pm1', data.pm1, (v) => `${v.toFixed(1)} µg/m³`);
    show(statPm25, 'pm25', data['pm2.5'], (v) => `${v.toFixed(1)} µg/m³`);
    show(statPm10, 'pm10', data.pm10, (v) => `${v.toFixed(1)} µg/m³`);
    show(statAqi, 'aqi', data.aqi, (v) => `${v.toFixed(0)}`);
    show(statPressure, 'pressure', data.pressure, (v) => `${v.toFixed(1)} hPa`);
    show(statElevation, 'elevation', data.elevation, (v) => `${v.toFixed(1)} m`);
    show(statBattery, 'battery', data.battery, (v) => `${v.toFixed(1)} %`);
    if (data.batteryV !== undefined && !Number.isNaN(Number(data.batteryV))) {
      infoBatteryV.textContent = `${Number(data.batteryV).toFixed(2)} V`;
    }
    
    // Update all charts with the new data
    updateCharts();
  }
  
  // Data Logging Functions
  async function selectLogFile() {
    try {
      const result = await window.api.selectLogFile();
      
      if (result.success) {
        logFilePath.textContent = result.filePath;
        loggedLines = 0;
        logCount.textContent = '';
      }
    } catch (error) {
      displayError({ message: 'File selection error', details: error.message });
    }
  }
  
  async function toggleLogging() {
    try {
      const isEnabled = loggingToggle.checked;
      
      if (isEnabled && !logFilePath.textContent) {
        await selectLogFile();
        if (!logFilePath.textContent) {
          loggingToggle.checked = false;
          return;
        }
      }
      
      const result = await window.api.toggleLogging(isEnabled);
      
      if (!result.success) {
        displayError({ message: 'Failed to toggle logging' });
        loggingToggle.checked = !isEnabled;
      }
    } catch (error) {
      displayError({ message: 'Logging error', details: error.message });
      loggingToggle.checked = false;
    }
  }
  
  // ─── Firmware updates ───────────────────────────────────────────────────────
  // The app reads the firmware version ($PRINT_VERSION, "v2.9"): firmware 1.x runs on the original
  // board (v1), 2.x on the new board (v2). It compares that with the firmware list, offers the
  // update, downloads the right file for the board and flashes it. When the version can't be read,
  // the user reads it on Odak's start-up screen and picks the board.
  
  function compareVersions(a, b) {
    const pa = String(a).split('.').map(Number);
    const pb = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d;
    }
    return 0;
  }
  
  function chosenBoard() {
    const v = byId('fw-board-select').value;
    return v || null;
  }
  
  /** The board to update: read from the device, else the one the user picked. */
  function targetBoard() {
    return fw.board || chosenBoard();
  }
  
  /** Called with the $PRINT_VERSION reply (null = not connected / gone). */
  function setDeviceFirmware(reply, state) {
    if (state) {
      fw.readState = state;
    } else if (reply && /^v\d+\.\d+/.test(reply)) {
      fw.version = reply.slice(1).trim();
      fw.board = `v${fw.version.split('.')[0]}`;
      fw.readState = 'ok';
      try { localStorage.setItem(BOARD_KEY, fw.board); } catch (e) { /* ignore */ }
    } else {
      fw.version = null;
      fw.board = null;
      fw.readState = reply === null ? 'no-reply' : 'unknown';
    }
    renderFirmware();
  }
  
  async function loadFirmwareList() {
    if (fw.loading) return;
    fw.loading = true;
    renderFirmware();
    const result = await window.api.getFirmwareManifest();
    fw.loading = false;
    fw.boards = result.success ? result.boards : null;
    fw.listError = result.success ? null : result.error;
    renderFirmware();
  }
  
  function setFirmwareState(icon, text, kind) {
    const state = byId('fw-state');
    state.className = `fw-cell fw-state ${kind || ''}`;
    state.querySelector('i').className = `bi ${icon}`;
    byId('fw-state-text').textContent = text;
  }
  
  /** Redraw the Firmware tab from what we know. Returns the update on offer, if any. */
  function renderFirmware() {
    const board = targetBoard();
    const entry = board && fw.boards ? fw.boards[board] : null;
    const boardName = (b) => (b === 'v1' ? 'v1 · original board' : b === 'v2' ? 'v2 · new board' : b);
  
    // Your Odak
    if (!isConnected && fw.readState === 'none') {
      byId('fw-board').textContent = board ? boardName(board) : 'Not connected';
      byId('fw-installed').textContent = 'Connect Odak to check its firmware';
    } else if (fw.readState === 'checking') {
      byId('fw-board').textContent = 'Checking…';
      byId('fw-installed').textContent = 'Reading the firmware version';
    } else if (fw.readState === 'ok') {
      byId('fw-board').textContent = boardName(fw.board);
      byId('fw-installed').textContent = `Firmware v${fw.version}`;
    } else {
      byId('fw-board').textContent = board ? boardName(board) : 'Unknown board';
      byId('fw-installed').textContent = 'Version could not be read';
    }
  
    // Latest firmware
    byId('fw-latest').textContent = entry ? `v${entry.version}` : '—';
    byId('fw-latest-date').textContent = entry && entry.date ? `Released ${entry.date}` : (board && fw.boards && !entry ? `None published for ${board}` : '');
    const notes = byId('fw-notes');
    notes.classList.toggle('d-none', !entry || !entry.notes);
    notes.textContent = entry && entry.notes ? entry.notes : '';
  
    // Ask for the board when the device can't tell us
    const needBoard = fw.readState === 'unknown' || fw.readState === 'no-reply' || (!isConnected && !fw.board);
    byId('fw-unknown').classList.toggle('d-none', !needBoard);
    byId('fw-unknown-why').textContent = fw.readState === 'unknown'
      ? 'This Odak runs firmware that is too old to report its version.'
      : fw.readState === 'no-reply'
        ? 'Odak did not answer when asked for its version.'
        : 'Odak is not connected. If it does not connect any more, you can still reinstall its firmware.';
  
    // State and the install button
    const install = byId('fw-install');
    const note = byId('fw-install-note');
    let offer = null;
    install.className = 'btn btn-primary';
    if (fw.busy) {
      install.disabled = true;
      return null;
    }
    if (fw.listError) {
      setFirmwareState('bi-wifi-off', `Could not get the firmware list: ${fw.listError}`, 'warn');
      install.disabled = true;
      byId('fw-install-text').textContent = 'Install update';
      note.textContent = 'Check your internet connection and click "Check for updates".';
      return null;
    }
    if (!fw.boards) {
      setFirmwareState('bi-hourglass', fw.loading ? 'Checking for updates…' : 'Click "Check for updates"', '');
      install.disabled = true;
      note.textContent = '';
      return null;
    }
    if (!board) {
      setFirmwareState('bi-question-circle', isConnected ? 'Choose your board below' : 'Waiting for the device', '');
      install.disabled = true;
      byId('fw-install-text').textContent = 'Install update';
      note.textContent = '';
      return null;
    }
    if (!entry) {
      setFirmwareState('bi-dash-circle', `No firmware published for board ${board} yet`, '');
      install.disabled = true;
      note.textContent = '';
      return null;
    }
    if (fw.readState === 'ok') {
      // "v2.9" counts as 2.9.0, so the July 2.9 release is offered 2.9.5. Firmware must report its
      // full version from 2.9.5 on, or a device that has it would be offered it again.
      const diff = compareVersions(entry.version, fw.version);
      if (diff > 0) {
        setFirmwareState('bi-arrow-up-circle-fill', `Update available: v${fw.version} → v${entry.version}`, 'update');
        byId('fw-install-text').textContent = `Install v${entry.version}`;
        note.textContent = '';
        offer = entry;
      } else {
        setFirmwareState('bi-check-circle-fill', `Up to date (v${fw.version})`, 'ok');
        install.className = 'btn btn-outline-secondary';
        byId('fw-install-text').textContent = `Reinstall v${entry.version}`;
        note.textContent = 'Only needed if Odak misbehaves.';
      }
    } else {
      setFirmwareState('bi-info-circle', `Ready to install v${entry.version} for board ${board}`, 'update');
      byId('fw-install-text').textContent = `Install v${entry.version}`;
      note.textContent = isConnected ? '' : 'Connect Odak first so the app can restart it into update mode. Only if it no longer connects: hold BOOTSEL while plugging it in.';
    }
    install.disabled = false;
    return offer;
  }
  
  /** After connecting: fetch the list and offer a newer firmware once per session. */
  async function checkFirmwareAfterConnect(seq) {
    if (!fw.boards) await loadFirmwareList();
    if (seq !== connectionSeq || fw.busy) return;
    const offer = renderFirmware();
    const key = offer ? `${fw.board}-${offer.version}` : null;
    if (!offer || fw.offered.has(key)) return;
    fw.offered.add(key);
    byId('fw-modal-text').textContent = `Odak firmware v${offer.version} is available for your ${fw.board === 'v1' ? 'original (v1)' : 'v2'} board. You have v${fw.version}. Update now?`;
    byId('fw-modal-notes').textContent = offer.notes;
    bootstrap.Modal.getOrCreateInstance(byId('fw-modal')).show();
  }
  
  /** Download the latest firmware for the board and flash it. */
  async function installLatestFirmware() {
    const board = targetBoard();
    const entry = board && fw.boards ? fw.boards[board] : null;
    if (!entry || fw.busy) return;
    fw.busy = true;
    renderFirmware();
    updateProgressContainer.classList.remove('d-none');
    updateProgress.classList.add('progress-bar-animated');
    updateProgress.classList.remove('bg-danger', 'bg-success');
    updateProgress.style.width = '0%';
    updateStatus.innerHTML = `<div class="alert alert-info">Downloading firmware v${entry.version}…</div>`;
    const stop = window.api.onFirmwareDownloadProgress(({ received, total }) => {
      if (total) updateProgress.style.width = `${Math.round((received / total) * 40)}%`;
    });
    let file = null;
    try {
      const result = await window.api.downloadFirmware(board);
      if (!result.success) {
        updateProgress.classList.remove('progress-bar-animated');
        updateProgress.classList.add('bg-danger');
        updateProgress.style.width = '100%';
        updateStatus.innerHTML = '';
        const alert = document.createElement('div');
        alert.className = 'alert alert-danger';
        alert.textContent = `Download failed: ${result.error}`;
        updateStatus.appendChild(alert);
        return;
      }
      file = result.path;
    } finally {
      stop();
      if (!file) { fw.busy = false; renderFirmware(); }
    }
    await flashFirmware(file, `v${entry.version}`);
    fw.busy = false;
    renderFirmware();
  }
  
  // Advanced: a firmware file picked by hand
  async function selectFirmwareFile() {
    try {
      const result = await window.api.selectFirmwareFile();
      
      if (result.success) {
        selectedFirmwarePath = result.filePath;
        firmwareFileInput.value = selectedFirmwarePath;
        updateFirmwareBtn.disabled = false;
      }
    } catch (error) {
      displayError({ message: 'File selection error', details: error.message });
    }
  }
  
  async function updateFirmware() {
    if (!selectedFirmwarePath || fw.busy) return;
    fw.busy = true;
    renderFirmware();
    await flashFirmware(selectedFirmwarePath, 'the selected file');
    fw.busy = false;
    renderFirmware();
  }
  
  /** Put a .uf2 file on Odak; the device restarts and the app reconnects. */
  async function flashFirmware(firmwarePath, label) {
    // The flasher closes the port; reconnect to the device once it is back
    const wasConnected = isConnected;
    firmwareUpdating = true;
    stopReconnectWait();
    
    try {
      updateFirmwareBtn.disabled = true;
      updateProgress.classList.add('progress-bar-animated');
      updateProgress.classList.remove('bg-danger', 'bg-success');
      updateProgressContainer.classList.remove('d-none');
      updateProgress.style.width = '40%';
      updateStatus.innerHTML = `<div class="alert alert-info">Installing ${label}…</div>`;
      
      // Move the bar along while the device restarts and takes the file
      let progress = 40;
      const progressInterval = setInterval(() => {
        progress += 3;
        if (progress > 95) {
          clearInterval(progressInterval);
        } else {
          updateProgress.style.width = `${progress}%`;
        }
      }, 500);
      
      const result = await window.api.updateFirmware({ firmwarePath });
      
      clearInterval(progressInterval);
      
      if (result.success) {
        updateProgress.style.width = '100%';
        updateProgress.classList.remove('progress-bar-animated');
        updateProgress.classList.add('bg-success');
        updateStatus.innerHTML = wasConnected
          ? `<div class="alert alert-success">Installed ${label}. Odak is restarting; the app reconnects by itself.</div>`
          : `<div class="alert alert-success">Installed ${label}.</div>`;
      } else {
        updateProgress.style.width = '100%';
        updateProgress.classList.remove('progress-bar-animated');
        updateProgress.classList.add('bg-danger');
        updateStatus.innerHTML = '';
        const alert = document.createElement('div');
        alert.className = 'alert alert-danger fw-error';
        alert.textContent = `Firmware update failed: ${result.error}`;
        updateStatus.appendChild(alert);
      }
    } catch (error) {
      updateProgress.style.width = '100%';
      updateProgress.classList.remove('progress-bar-animated');
      updateProgress.classList.add('bg-danger');
      updateStatus.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
      displayError({ message: 'Firmware update error', details: error.message });
    } finally {
      updateFirmwareBtn.disabled = !selectedFirmwarePath;
      firmwareUpdating = false;
      if (wasConnected && !isConnected) startReconnectWait();
    }
  }
  
  function updateFirmwareProgress(data) {
    if (data && data.message) {
      // Display the message in the update status area
      const messageLines = data.message.split('\n').filter(line => line.trim() !== '');
      
      if (messageLines.length > 0) {
        // Update the status text
        for (const line of messageLines) {
          // Extract progress percentage if available
          if (line.includes('Waiting')) {
            updateStatus.innerHTML = `<div class="alert alert-info">${line}</div>`;
            updateProgress.style.width = '30%';
          } else if (line.includes('Resetting')) {
            updateStatus.innerHTML = `<div class="alert alert-info">${line}</div>`;
            updateProgress.style.width = '10%';
          } else if (line.includes('Copying')) {
            updateStatus.innerHTML = `<div class="alert alert-info">${line}</div>`;
            updateProgress.style.width = '70%';
          } else if (line.includes('Flash successful')) {
            updateStatus.innerHTML = `<div class="alert alert-success">${line}</div>`;
            updateProgress.style.width = '100%';
            // Stop any spinning animation
            updateProgress.classList.remove('progress-bar-animated');
          } else if (line.includes('Error') || line.includes('failed')) {
            updateStatus.innerHTML = `<div class="alert alert-danger">${line}</div>`;
            updateProgress.classList.remove('progress-bar-animated');
            updateProgress.classList.add('bg-danger');
          } else {
            // For dots showing progress of waiting
            if (line.trim() === '.') {
              const currentText = updateStatus.querySelector('.alert')?.textContent || '';
              if (currentText.endsWith('...')) {
                updateStatus.querySelector('.alert').textContent = currentText.replace('...', '.');
              } else {
                updateStatus.querySelector('.alert').textContent = currentText + '.';
              }
            } else {
              // Just display the message
              addToCliOutput(line);
            }
          }
        }
      }
    }
  }
  
  // Chart Functions
  function initCharts() {
    // Chart.js global defaults
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = '#495057';
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 6;
    Chart.defaults.plugins.tooltip.titleFont = { weight: 'bold', size: 13 };
    Chart.defaults.plugins.title.display = true;
    Chart.defaults.plugins.title.font = { weight: 'bold', size: 14 };
    
    // Temperature and Humidity Chart
    const tempHumCtx = document.getElementById('tempHumChart');
    charts.tempHum = new Chart(tempHumCtx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Temperature (°C)',
            borderColor: 'rgb(220, 53, 69)', // Danger/red - matching stat card
            backgroundColor: 'rgba(220, 53, 69, 0.1)',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.2,
            data: [],
            yAxisID: 'y'
          },
          {
            label: 'Humidity (%)',
            borderColor: 'rgb(13, 110, 253)', // Primary/blue - matching stat card
            backgroundColor: 'rgba(13, 110, 253, 0.1)',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.2,
            data: [],
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          title: {
            text: 'Temperature & Humidity'
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'minute',
              tooltipFormat: 'HH:mm:ss',
              displayFormats: {
                minute: 'HH:mm'
              }
            },
            title: {
              display: true,
              text: 'Time'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Temperature (°C)'
            },
            position: 'left',
            suggestedMin: 10,
            suggestedMax: 40
          },
          y1: {
            title: {
              display: true,
              text: 'Humidity (%)'
            },
            position: 'right',
            grid: {
              drawOnChartArea: false
            },
            suggestedMin: 0,
            suggestedMax: 100
          }
        }
      }
    });

    // CO2 Chart
    const co2Ctx = document.getElementById('co2Chart');
    charts.co2Voc = new Chart(co2Ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'CO2 (ppm)',
            borderColor: 'rgb(255, 152, 0)', // Amber - matching stat card
            backgroundColor: 'rgba(255, 152, 0, 0.1)',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.2,
            data: [],
            yAxisID: 'y'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          title: {
            text: 'CO2 Level'
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'minute',
              tooltipFormat: 'HH:mm:ss',
              displayFormats: {
                minute: 'HH:mm'
              }
            },
            title: {
              display: true,
              text: 'Time'
            }
          },
          y: {
            title: {
              display: true,
              text: 'CO2 (ppm)'
            },
            position: 'left'
          }
        }
      }
    });

    // VOC Chart with updated consistent styling
    const vocCtx = document.getElementById('vocChart');
    charts.voc = new Chart(vocCtx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'VOC index',
            borderColor: 'rgb(108, 117, 125)', // Gray - matching stat card
            backgroundColor: 'rgba(108, 117, 125, 0.1)',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.2,
            data: [],
            yAxisID: 'y'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          title: {
            text: 'VOC Level'
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'minute',
              tooltipFormat: 'HH:mm:ss',
              displayFormats: {
                minute: 'HH:mm'
              }
            },
            title: {
              display: true,
              text: 'Time'
            }
          },
          y: {
            title: {
              display: true,
              text: 'VOC index (100 = usual air)'
            },
            position: 'left'
          }
        }
      }
    });
    
    // Use updated styling for Particulate Matter Chart
    const pmCtx = document.getElementById('pmChart');
    charts.pm = new Chart(pmCtx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'PM1.0 (µg/m³)',
            borderColor: 'rgb(25, 135, 84)', // Green - matching stat card
            backgroundColor: 'rgba(124, 255, 112, 0.1)',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.2,
            data: []
          },
          {
            label: 'PM2.5 (µg/m³)',
            borderColor: 'rgb(255, 190, 93)', // Amber - matching stat card
            backgroundColor: 'rgba(255, 165, 0, 0.1)',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.2,
            data: []
          },
          {
            label: 'PM10 (µg/m³)',
            borderColor: 'rgb(153, 132, 13)', // Danger/red - matching stat card
            backgroundColor: 'rgba(255, 255, 0, 0.1)',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.2,
            data: []
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          title: {
            text: 'Particulate Matter'
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'minute',
              tooltipFormat: 'HH:mm:ss',
              displayFormats: {
                minute: 'HH:mm'
              }
            },
            title: {
              display: true,
              text: 'Time'
            }
          },
          y: {
            title: {
              display: true,
              text: 'PM (µg/m³)'
            }
          }
        }
      }
    });
    
    // Battery Chart
    const batteryCtx = document.getElementById('batteryChart');
    charts.battery = new Chart(batteryCtx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Battery (%)',
            borderColor: 'rgb(13, 202, 240)', // Cyan - matching stat card
            backgroundColor: 'rgba(13, 202, 240, 0.1)',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.2,
            data: []
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          title: {
            text: 'Battery Voltage'
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'minute',
              tooltipFormat: 'HH:mm:ss',
              displayFormats: {
                minute: 'HH:mm'
              }
            },
            title: {
              display: true,
              text: 'Time'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Voltage (V)'
            }
          }
        }
      }
    });

    // AQI Chart
    const aqiCtx = document.getElementById('aqiChart');
    charts.aqi = new Chart(aqiCtx, {
        type: 'line',
        data: {
            datasets: [
            {
                label: 'Air Quality Index',
                borderColor: 'rgb(111, 66, 193)', // Purple - matching stat card
                backgroundColor: 'rgba(111, 66, 193, 0.1)',
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 5,
                tension: 0.2,
                data: []
            }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
            mode: 'index',
            intersect: false,
            },
            plugins: {
            title: {
                text: 'Air Quality Index (AQI)'
            }
            },
            scales: {
            x: {
                type: 'time',
                time: {
                unit: 'minute',
                tooltipFormat: 'HH:mm:ss',
                displayFormats: {
                    minute: 'HH:mm'
                }
                },
                title: {
                display: true,
                text: 'Time'
                }
            },
            y: {
                title: {
                display: true,
                text: 'AQI'
                },
                suggestedMin: 0,
                suggestedMax: 300
            }
            }
        }
    });
    
    // Pressure Chart
    const pressureCtx = document.getElementById('pressureChart');
    charts.pressure = new Chart(pressureCtx, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'Pressure (hPa)',
                    borderColor: 'rgb(145, 70, 255)', // Violet - matching stat card
                    backgroundColor: 'rgba(145, 70, 255, 0.1)',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    tension: 0.2,
                    data: []
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                title: {
                    text: 'Barometric Pressure'
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'minute',
                        tooltipFormat: 'HH:mm:ss',
                        displayFormats: {
                            minute: 'HH:mm'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Time'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Pressure (hPa)'
                    }
                }
            }
        }
    });
    
    // Elevation Chart
    const elevationCtx = document.getElementById('elevationChart');
    charts.elevation = new Chart(elevationCtx, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'Elevation (m)',
                    borderColor: 'rgb(40, 167, 89)', // Forest green - matching stat card
                    backgroundColor: 'rgba(0, 255, 136, 0.1)',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    tension: 0.2,
                    data: []
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                title: {
                    text: 'Elevation'
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'minute',
                        tooltipFormat: 'HH:mm:ss',
                        displayFormats: {
                            minute: 'HH:mm'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Time'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Elevation (m)'
                    }
                }
            }
        }
    });
  }
  
  function addDataPoint(type, value) {
    const timestamp = new Date();
    
    switch(type) {
      case 'temperature':
        chartData.temperature.push({
          x: timestamp,
          y: value
        });
        if (chartData.temperature.length > 100) chartData.temperature.shift();
        break;
      case 'humidity':
        chartData.humidity.push({
          x: timestamp,
          y: value
        });
        if (chartData.humidity.length > 100) chartData.humidity.shift();
        break;
      case 'co2':
        chartData.co2.push({
          x: timestamp,
          y: value
        });
        if (chartData.co2.length > 100) chartData.co2.shift();
        break;
      case 'voc':
        chartData.voc.push({
          x: timestamp,
          y: value
        });
        if (chartData.voc.length > 100) chartData.voc.shift();
        break;
      case 'pm1':
        chartData.pm1.push({
          x: timestamp,
          y: value
        });
        if (chartData.pm1.length > 100) chartData.pm1.shift();
        break;
      case 'pm25':
        chartData.pm25.push({
          x: timestamp,
          y: value
        });
        if (chartData.pm25.length > 100) chartData.pm25.shift();
        break;
      case 'pm10':
        chartData.pm10.push({
          x: timestamp,
          y: value
        });
        if (chartData.pm10.length > 100) chartData.pm10.shift();
        break;
      case 'battery':
        chartData.battery.push({
          x: timestamp,
          y: value
        });
        if (chartData.battery.length > 100) chartData.battery.shift();
        break;
      case 'aqi':
        chartData.aqi.push({
          x: timestamp,
          y: value
        });
        if (chartData.aqi.length > 100) chartData.aqi.shift();
        break;
      case 'pressure':
        chartData.pressure.push({
          x: timestamp,
          y: value
        });
        if (chartData.pressure.length > 100) chartData.pressure.shift();
        break;
      case 'elevation':
        chartData.elevation.push({
          x: timestamp,
          y: value
        });
        if (chartData.elevation.length > 100) chartData.elevation.shift();
        break;
    }
  }
  
  function updateCharts() {
    console.log('Updating charts with data:', chartData);

    // Temperature and Humidity
    charts.tempHum.data.datasets[0].data = chartData.temperature;
    charts.tempHum.data.datasets[1].data = chartData.humidity;
    charts.tempHum.update();
    
    // CO2 - fix reference to the chart object
    charts.co2Voc.data.datasets[0].data = chartData.co2;
    charts.co2Voc.update();

    // VOC
    charts.voc.data.datasets[0].data = chartData.voc;
    charts.voc.update();
    
    // Particulate Matter
    charts.pm.data.datasets[0].data = chartData.pm1;
    charts.pm.data.datasets[1].data = chartData.pm25;
    charts.pm.data.datasets[2].data = chartData.pm10;
    charts.pm.update();
    
    // Battery
    charts.battery.data.datasets[0].data = chartData.battery;
    charts.battery.update();

    // AQI
    charts.aqi.data.datasets[0].data = chartData.aqi;
    charts.aqi.update();
    
    // Pressure
    charts.pressure.data.datasets[0].data = chartData.pressure;
    charts.pressure.update();
    
    // Elevation
    charts.elevation.data.datasets[0].data = chartData.elevation;
    charts.elevation.update();
  }
  
  function clearCharts() {
    // Reset chart data
    Object.keys(chartData).forEach(key => {
      chartData[key] = [];
    });
    
    // Update charts with empty data
    updateCharts();
    
    addToCliOutput('Charts cleared', 'cli-command');
  }
  
  // Exports the console output to a file
  async function exportConsoleOutput() {
    try {
      // Get all content from the console output with formatting preserved
      const consoleContent = Array.from(cliOutput.children)
        .map(line => line.textContent)
        .join('\n');
      
      // Add header with timestamp
      const header = `ODAK Console Export - ${new Date().toLocaleString()}\n${'='.repeat(50)}\n\n`;
      const fullContent = header + consoleContent;
      
      const result = await window.api.exportConsoleOutput(fullContent);
      
      if (result.success) {
        addToCliOutput(`Console content exported to: ${result.filePath}`, 'cli-info');
      } else if (!result.canceled) {
        displayError({ message: 'Failed to export console content', details: result.error });
      }
    } catch (error) {
      displayError({ message: 'Export error', details: error.message });
    }
  }
  
  // Function to clear the CLI output
  function clearCliOutput() {
    cliOutput.innerHTML = '';
    // You can add a small message to indicate the console was cleared
    addToCliOutput('Console cleared', 'cli-info');
  }
  
  // Error handling
  function displayError(error) {
    console.error(error);
    
    // Show error in UI
    errorMessage.textContent = error.message || 'An error occurred';
    errorMessage.classList.add('pulse');
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      errorMessage.textContent = '';
      errorMessage.classList.remove('pulse');
    }, 5000);
    
    // Show in CLI if connected to that context
    if (error.details) {
      addToCliOutput(`Error: ${error.message} - ${error.details}`, 'cli-error');
    } else {
      addToCliOutput(`Error: ${error.message}`, 'cli-error');
    }
  }
  
  // Start-up that needs the Insights view: show the cached history and the schedule
  renderScheduleVisuals();
  renderFirmware();
  window.api.loadHistoryCache().then((result) => {
    if (result.success && result.cache && Array.isArray(result.cache.rows)) historyCache = result.cache;
    else if (!result.success) addToCliOutput(`Could not load the history cache: ${result.error}`, 'cli-warning');
    showDeviceHistory();
  });
});
