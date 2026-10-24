// Main process entry point for ODAK Air Quality Monitor GUI
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { spawn } = require('child_process');
const { flashLinux } = require('./linux-flash');
const firmwareUpdates = require('./firmware-updates');

// Handle creating/removing shortcuts on Windows when installing/uninstalling
if (require('electron-squirrel-startup')) {
  app.quit();
}

// Linux (e.g. Pardus/Debian GNOME): Electron 36 can load GTK 4 alongside GTK 3
// and abort with "GTK 2/3 symbols detected". Force GTK 3 to avoid the crash.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('gtk-version', '3');
}

// Keep a global reference of objects
let mainWindow;
let aboutWindow = null;
let serialConnection = null;
let parser = null;
let dataLogger = null;
let loggingEnabled = false;
let logFilePath = null;
let portRefreshInterval;
let inDataDump = false; // between DATA_BEGIN and DATA_END of a history download

// Create the main window
const createWindow = () => {
  // Define platform-specific icon
  let iconPath;
  if (process.platform === 'darwin') {
    // macOS uses .icns format
    iconPath = path.join(__dirname, '../assets/icons', 'odak.icns');
  } else if (process.platform === 'win32') {
    // Windows uses .ico format
    iconPath = path.join(__dirname, '../assets/icons', 'odak.ico');
  } else {
    // Linux and others can use .png
    iconPath = path.join(__dirname, '../assets/icons', 'odak.png');
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: iconPath
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Open DevTools in development mode
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  // Start port list refresh interval
  startPortRefresh();
};

// Open links in the user's browser instead of inside the app (https only)
function openLinksExternally(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    if (url.startsWith('https://')) shell.openExternal(url);
  });
}

function showAboutWindow() {
  if (aboutWindow) {
    aboutWindow.focus();
    return;
  }

  aboutWindow = new BrowserWindow({
    width: 560,
    height: 680,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWindow,
    modal: process.platform !== 'darwin',
    title: 'About ODAK Air Quality Monitor',
    icon: path.join(__dirname, '../assets/icons', 'odak.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  aboutWindow.removeMenu();
  openLinksExternally(aboutWindow);
  aboutWindow.loadFile(path.join(__dirname, 'about.html'), { query: { version: app.getVersion() } });
  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });
}

function createMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Mountain Labs Website',
          click: () => shell.openExternal('https://mountainlabs.io'),
        },
        { type: 'separator' },
        {
          label: 'About ODAK Air Quality Monitor',
          click: showAboutWindow,
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Start application when ready
app.on('ready', () => {
  createMenu();
  createWindow();
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
  
  // Clean up
  if (serialConnection && serialConnection.isOpen) {
    serialConnection.close();
  }
  
  if (portRefreshInterval) {
    clearInterval(portRefreshInterval);
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Serial port functionality
function startPortRefresh() {
  // Initial port list
  listSerialPorts();
  
  // Refresh less frequently (every 5 seconds) to reduce the chance 
  // of interfering with user selections
  portRefreshInterval = setInterval(listSerialPorts, 5000);
}

async function listSerialPorts() {
  try {
    const ports = await SerialPort.list();
    if (mainWindow) {
      // Send the connection state along with the ports list
      mainWindow.webContents.send('ports-list', {
        ports: ports,
        isConnected: serialConnection && serialConnection.isOpen,
        currentPort: serialConnection ? serialConnection.path : null
      });
    }
  } catch (error) {
    console.error('Error listing ports:', error);
    if (mainWindow) {
      mainWindow.webContents.send('error', { message: 'Failed to list serial ports', details: error.message });
    }
  }
}

// IPC Handlers for renderer process communication
ipcMain.handle('refresh-ports', async () => {
  try {
    await listSerialPorts();
    return { success: true };
  } catch (error) {
    console.error('Error refreshing ports:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('connect-port', async (event, portConfig) => {
  try {
    // Close any existing connection
    if (serialConnection && serialConnection.isOpen) {
      await new Promise(resolve => serialConnection.close(resolve));

      // Add a small delay after closing to ensure port is fully released
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Add a small delay before attempting to reopen
    await new Promise(resolve => setTimeout(resolve, 200));
    
    serialConnection = new SerialPort({
      path: portConfig.path,
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      rtscts: false,
      xon: true,
      xoff: true,
      autoOpen: false
    });
    
    parser = serialConnection.pipe(new ReadlineParser({ delimiter: '\r\n' }));
    
    // Set up event listeners
    serialConnection.on('open', () => {
      mainWindow.webContents.send('connection-status', { connected: true, port: portConfig.path });
    });
    
    const connection = serialConnection;
    connection.on('close', (err) => {
      // Ignore closes of a connection that has already been replaced
      if (connection !== serialConnection) return;
      // err.disconnected is set when the device vanished (unplug, reset, firmware update)
      mainWindow.webContents.send('connection-status', { connected: false, lost: !!(err && err.disconnected) });
    });
    
    serialConnection.on('error', (err) => {
      console.error('Serial port error:', err);
      const details = isLinuxPermissionError(err) ? linuxSerialPermissionMessage(portConfig.path) : err.message;
      mainWindow.webContents.send('error', { message: 'Serial port error', details });
    });
    
    parser.on('data', (data) => {
      try {
        // Process incoming data
        mainWindow.webContents.send('serial-data', data);
        
        // Log data if enabled (history downloads are saved separately, not into the live log)
        if (data.startsWith('DATA_BEGIN,')) inDataDump = true;
        if (loggingEnabled && logFilePath && !inDataDump) {
          logData(data);
        }
        if (data.startsWith('DATA_END,')) inDataDump = false;
      } catch (error) {
        console.error('Error processing data:', error);
      }
    });
    
    // Wait for the port to actually open so the renderer gets a real result
    await new Promise((resolve, reject) => {
      serialConnection.open((err) => (err ? reject(err) : resolve()));
    });

    return { success: true };
  } catch (error) {
    console.error('Connection error:', error);
    const details = isLinuxPermissionError(error) ? linuxSerialPermissionMessage(portConfig.path) : error.message;
    return { success: false, error: details };
  }
});

ipcMain.handle('disconnect-port', async () => {
  try {
    if (serialConnection && serialConnection.isOpen) {
      await new Promise(resolve => serialConnection.close(resolve));
      return { success: true };
    }
    return { success: true, message: 'Not connected' };
  } catch (error) {
    console.error('Disconnect error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('send-command', async (event, command) => {
  try {
    if (!serialConnection || !serialConnection.isOpen) {
      return { success: false, error: 'Not connected to device' };
    }
    
    await new Promise((resolve, reject) => {
      serialConnection.write(command + '\n', (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    
    // Check if this is a system reset command (case-insensitive)
    const isSystemReset = command.toUpperCase().includes('SYS_RST');
    
    return { 
      success: true, 
      isSystemReset: isSystemReset,
      devicePath: serialConnection.path // Return the current port for auto-reconnect
    };
  } catch (error) {
    console.error('Command send error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-log-file', async () => {
  try {
    const result = await dialog.showSaveDialog({
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'CSV Files', extensions: ['csv'] },
      ],
      properties: ['createDirectory']
    });
    
    if (!result.canceled && result.filePath) {
      logFilePath = result.filePath;
      return { success: true, filePath: logFilePath };
    } else {
      return { success: false, canceled: true };
    }
  } catch (error) {
    console.error('File selection error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('toggle-logging', (event, enabled) => {
  loggingEnabled = enabled;
  return { success: true, enabled: loggingEnabled };
});

ipcMain.handle('select-firmware-file', async () => {
  try {
    const result = await dialog.showOpenDialog({
      filters: [
        { name: 'UF2 Files', extensions: ['uf2'] }
      ],
      properties: ['openFile']
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
      return { success: true, filePath: result.filePaths[0] };
    } else {
      return { success: false, canceled: true };
    }
  } catch (error) {
    console.error('Firmware file selection error:', error);
    return { success: false, error: error.message };
  }
});

// Latest firmware per board, from the firmware list (see src/firmware-updates.js)
ipcMain.handle('firmware-manifest', async () => {
  try {
    return { success: true, boards: await firmwareUpdates.getManifest() };
  } catch (error) {
    console.error('Firmware list error:', error);
    return { success: false, error: error.message };
  }
});

// Download (and verify) the latest firmware for a board; returns the file to flash
ipcMain.handle('firmware-download', async (event, board) => {
  try {
    const boards = await firmwareUpdates.getManifest();
    const entry = boards[board];
    if (!entry) return { success: false, error: `No firmware is published for board ${board}.` };
    const dir = path.join(app.getPath('userData'), 'firmware');
    const file = await firmwareUpdates.downloadFirmware(entry, dir, (received, total) => {
      mainWindow.webContents.send('firmware-download-progress', { received, total });
    });
    return { success: true, path: file, version: entry.version };
  } catch (error) {
    console.error('Firmware download error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-firmware', async (event, options) => {
  try {
    let comPort = null;
    
    // Get COM port if connected
    if (serialConnection && serialConnection.isOpen) {
      comPort = serialConnection.path;
      
      // Close connection to allow reset
      await new Promise(resolve => serialConnection.close(resolve));
    }

    if (process.platform === 'linux') {
      // Linux: the app flashes the device itself (no scripts, so it also works inside a snap)
      try {
        await flashLinux({
          portPath: comPort,
          firmwarePath: options.firmwarePath,
          progress: (message) => mainWindow.webContents.send('firmware-progress', { message }),
        });
        return { success: true };
      } catch (error) {
        const message = error.code === 'permission' ? linuxSerialPermissionMessage(comPort) : error.message;
        return { success: false, error: message };
      }
    } else if (process.platform === 'darwin') {
      // macOS: Use the flash.sh script from the scripts folder, extracted to temp if in ASAR
      const scriptName = 'flash.sh';
      return new Promise((resolve, reject) => {
        const flashScriptAsar = path.join(__dirname, '..', 'scripts', scriptName);
        const os = require('os');
        const crypto = require('crypto');
        const tempDir = os.tmpdir();
        const tempScriptName = `flash_${crypto.randomBytes(6).toString('hex')}.sh`;
        const tempScriptPath = path.join(tempDir, tempScriptName);

        // Copy the script out of ASAR to a temp location
        try {
          fs.copyFileSync(flashScriptAsar, tempScriptPath);
          fs.chmodSync(tempScriptPath, '755');
        } catch (copyErr) {
          return reject(new Error(`Failed to extract ${scriptName}: ${copyErr.message}`));
        }

        // Port number
        const portNumber = comPort;

        // Run the flash script with the port number and firmware path as arguments
        const bash = spawn('bash', [tempScriptPath, portNumber || '', options.firmwarePath]);
        
        let stdout = '';
        let stderr = '';
        
        bash.stdout.on('data', (data) => {
          const output = data.toString();
          stdout += output;
          mainWindow.webContents.send('firmware-progress', { message: output });
        });
        
        bash.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        bash.on('close', (code) => {
          // Clean up temp script
          try { fs.unlinkSync(tempScriptPath); } catch (e) { /* ignore */ }
          if (code === 0) {
            resolve({ success: true, message: stdout });
          } else if (code === 11) {
            // Exit code 11: Full Disk Access permission error from flash.sh
            // Extract and show the explanatory message from stdout
            const fdaMsg = stdout.match(/=+ PERMISSION ERROR =+[\s\S]*?=+/);
            resolve({
              success: false,
              error: fdaMsg ? fdaMsg[0] : 'macOS Full Disk Access is required.\n\nTo grant access:\n1. Open System Settings > Privacy & Security > Full Disk Access.\n2. Add and enable this app (or your Terminal if running from CLI).\n3. Restart the app and try again.'
            });
          } else if (code === 12) {
            // Exit code 12: Copy timeout
            const timeoutMsg = stdout.match(/=+ COPY (TIMEOUT|FAILED) =+[\s\S]*?=+/);
            resolve({
              success: false,
              error: timeoutMsg ? timeoutMsg[0] : 'Copying the firmware file timed out. Please check the Odak connection and try again.'
            });
          } else {
            reject(new Error(stderr || stdout || `Process exited with code ${code}`));
          }
        });
        
        bash.on('error', (err) => {
          // Clean up temp script
          try { fs.unlinkSync(tempScriptPath); } catch (e) { /* ignore */ }
          reject(err);
        });
      });
    } else {
      // Windows: Use flash.ps1 script from scripts folder
      return new Promise((resolve, reject) => {
        // Get the path to the PowerShell script inside ASAR or unpacked
        const flashScriptAsar = path.join(__dirname, '..', 'scripts', 'flash.ps1');
        const os = require('os');
        const crypto = require('crypto');
        const tempDir = os.tmpdir();
        const tempScriptName = `flash_${crypto.randomBytes(6).toString('hex')}.ps1`;
        const tempScriptPath = path.join(tempDir, tempScriptName);

        // Make sure the firmware file exists
        if (!fs.existsSync(options.firmwarePath)) {
          throw new Error(`Firmware file not found at: ${options.firmwarePath}`);
        }

        // Copy the script out of ASAR to a temp location
        try {
          fs.copyFileSync(flashScriptAsar, tempScriptPath);
        } catch (copyErr) {
          return reject(new Error(`Failed to extract flash.ps1: ${copyErr.message}`));
        }

        // Run PowerShell script with parameters
        const ps = spawn('powershell', [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy', 'Bypass',
          '-File', tempScriptPath,
          '-ComPort', comPort || '',
          '-FirmwarePath', options.firmwarePath
        ]);
        
        let stdout = '';
        let stderr = '';
        
        ps.stdout.on('data', (data) => {
          const output = data.toString();
          stdout += output;
          mainWindow.webContents.send('firmware-progress', { message: output });
        });
        
        ps.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        ps.on('close', (code) => {
          // Clean up temp script
          try { fs.unlinkSync(tempScriptPath); } catch (e) { /* ignore */ }
          if (code === 0) {
            resolve({ success: true, message: stdout });
          } else {
            reject(new Error(stderr || `Process exited with code ${code}`));
          }
        });
        
        ps.on('error', (err) => {
          // Clean up temp script
          try { fs.unlinkSync(tempScriptPath); } catch (e) { /* ignore */ }
          reject(err);
        });
      });
    }
  } catch (error) {
    console.error('Firmware update error:', error);
    return { success: false, error: error.message || 'Unknown error during firmware update' };
  }
});

// Save the measurement history downloaded from the device as CSV or JSON
// history = { columns: [...], records: [{ column: value, ... }] }
ipcMain.handle('save-history', async (event, history) => {
  try {
    const result = await dialog.showSaveDialog({
      title: 'Save Device History',
      defaultPath: `ODAK_History_${new Date().toISOString().replace(/:/g, '-').substring(0, 19)}.csv`,
      filters: [
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'JSON Files', extensions: ['json'] }
      ],
      properties: ['createDirectory']
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    let content;
    if (result.filePath.toLowerCase().endsWith('.json')) {
      content = JSON.stringify(history.records, null, 2);
    } else {
      const csvValue = (value) => {
        const text = value === null || value === undefined ? '' : String(value);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      };
      const lines = [history.columns.join(',')];
      for (const record of history.records) {
        lines.push(history.columns.map(column => csvValue(record[column])).join(','));
      }
      content = lines.join('\n') + '\n';
    }

    fs.writeFileSync(result.filePath, content);
    return { success: true, filePath: result.filePath };
  } catch (error) {
    console.error('History save error:', error);
    return { success: false, error: error.message };
  }
});

// History cache: everything downloaded from the device so far, so later syncs
// only fetch new records ($DATA_DUMP,<from seq>) and older data survives the
// device overwriting its oldest records. Stored as { columns, rows, syncedAt }.
const historyCachePath = () => path.join(app.getPath('userData'), 'history-cache.json');

ipcMain.handle('history-cache-load', async () => {
  try {
    if (!fs.existsSync(historyCachePath())) return { success: true, cache: null };
    const cache = JSON.parse(await fs.promises.readFile(historyCachePath(), 'utf8'));
    return { success: true, cache };
  } catch (error) {
    console.error('History cache load error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('history-cache-save', async (event, cache) => {
  try {
    // Write to a temp file first so a crash never leaves a half-written cache
    const tempPath = `${historyCachePath()}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify(cache));
    await fs.promises.rename(tempPath, historyCachePath());
    return { success: true };
  } catch (error) {
    console.error('History cache save error:', error);
    return { success: false, error: error.message };
  }
});

// Save a backup (measurements, Air Coach log and plan) people can import later or elsewhere
ipcMain.handle('save-backup', async (event, backup) => {
  try {
    const result = await dialog.showSaveDialog({
      title: 'Export Odak Backup',
      defaultPath: `Odak_Backup_${new Date().toISOString().substring(0, 10)}.json`,
      filters: [{ name: 'Odak Backup', extensions: ['json'] }],
      properties: ['createDirectory']
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    await fs.promises.writeFile(result.filePath, JSON.stringify(backup));
    return { success: true, filePath: result.filePath };
  } catch (error) {
    console.error('Backup save error:', error);
    return { success: false, error: error.message };
  }
});

// Open a history file saved earlier (CSV or JSON) to view it in Insights
ipcMain.handle('open-history-file', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Import Odak Backup or History',
      filters: [{ name: 'Odak Backup or History', extensions: ['json', 'csv'] }],
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };
    const filePath = result.filePaths[0];
    const content = await fs.promises.readFile(filePath, 'utf8');
    return { success: true, filePath, content };
  } catch (error) {
    console.error('History file open error:', error);
    return { success: false, error: error.message };
  }
});

// Add handler for exporting console output
ipcMain.handle('export-console-output', async (event, content) => {
  try {
    const result = await dialog.showSaveDialog({
      title: 'Export Console Output',
      filters: [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'HTML Files', extensions: ['html'] }
      ],
      defaultPath: `ODAK_Console_${new Date().toISOString().replace(/:/g, '-').substring(0, 19)}.txt`,
      properties: ['createDirectory']
    });
    
    if (!result.canceled && result.filePath) {
      // Write content to file
      fs.writeFileSync(result.filePath, content);
      return { success: true, filePath: result.filePath };
    } else {
      return { success: false, canceled: true };
    }
  } catch (error) {
    console.error('Console export error:', error);
    return { success: false, error: error.message };
  }
});

// On Linux, serial ports belong to the 'dialout' group; users outside it get EACCES
function isLinuxPermissionError(err) {
  return process.platform === 'linux' && /permission denied|EACCES/i.test(err && err.message);
}

function linuxSerialPermissionMessage(port) {
  // Inside the snap, USB access is an interface the user may have to connect first
  const snapStep = process.env.SNAP
    ? 'Allow Odak to use USB devices:\n    sudo snap connect odak-gui:raw-usb\n\nThen add'
    : 'Add';
  return `No permission to access ${port || 'the serial port'}.\n\n` +
    `${snapStep} your user to the "dialout" group, then log out and back in:\n` +
    '    sudo usermod -aG dialout $USER';
}

function logData(data) {
  try {
    if (!logFilePath) return;
    
    const timestamp = new Date().toISOString();
    const entry = { timestamp, data };
    
    if (logFilePath.endsWith('.json')) {
      // JSON logging
      let existingData = [];
      
      if (fs.existsSync(logFilePath)) {
        try {
          const fileContent = fs.readFileSync(logFilePath, 'utf8');
          existingData = JSON.parse(fileContent);
        } catch (e) {
          existingData = [];
        }
      }
      
      existingData.push(entry);
      fs.writeFileSync(logFilePath, JSON.stringify(existingData, null, 2));
    } else if (logFilePath.endsWith('.csv')) {
      // CSV logging
      let csvLine = `${timestamp},"${data.replace(/"/g, '""')}"\n`;
      
      if (!fs.existsSync(logFilePath)) {
        // Create header if new file
        fs.writeFileSync(logFilePath, 'timestamp,data\n');
      }
      
      fs.appendFileSync(logFilePath, csvLine);
    }
  } catch (error) {
    console.error('Data logging error:', error);
    // Notify renderer about logging error
    if (mainWindow) {
      mainWindow.webContents.send('error', { message: 'Data logging error', details: error.message });
    }
  }
}