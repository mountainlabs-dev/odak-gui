// Main process entry point for ODAK Air Quality Monitor GUI
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { spawn } = require('child_process');

// Handle creating/removing shortcuts on Windows when installing/uninstalling
if (require('electron-squirrel-startup')) {
  app.quit();
}

// Keep a global reference of objects
let mainWindow;
let serialConnection = null;
let parser = null;
let dataLogger = null;
let loggingEnabled = false;
let logFilePath = null;
let portRefreshInterval;

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
    icon: '../assets/icons/odak.png'
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Open DevTools in development mode
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  // Start port list refresh interval
  startPortRefresh();
};

// Start application when ready
app.on('ready', createWindow);

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
      autoOpen: true
    });
    
    parser = serialConnection.pipe(new ReadlineParser({ delimiter: '\r\n' }));
    
    // Set up event listeners
    serialConnection.on('open', () => {
      mainWindow.webContents.send('connection-status', { connected: true, port: portConfig.path });
    });
    
    serialConnection.on('close', () => {
      mainWindow.webContents.send('connection-status', { connected: false });
    });
    
    serialConnection.on('error', (err) => {
      console.error('Serial port error:', err);
      mainWindow.webContents.send('error', { message: 'Serial port error', details: err.message });
    });
    
    parser.on('data', (data) => {
      try {
        // Process incoming data
        mainWindow.webContents.send('serial-data', data);
        
        // Log data if enabled
        if (loggingEnabled && logFilePath) {
          logData(data);
        }
      } catch (error) {
        console.error('Error processing data:', error);
      }
    });
    
    return { success: true };
  } catch (error) {
    console.error('Connection error:', error);
    return { success: false, error: error.message };
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

ipcMain.handle('update-firmware', async (event, options) => {
  try {
    let comPort = null;
    
    // Get COM port if connected
    if (serialConnection && serialConnection.isOpen) {
      comPort = serialConnection.path;
      
      // Close connection to allow reset
      await new Promise(resolve => serialConnection.close(resolve));
    }

    if (process.platform === 'darwin') {
      // macOS: Use flash.sh script from scripts folder, extract to temp if in ASAR
      return new Promise((resolve, reject) => {
        const flashScriptAsar = path.join(__dirname, '..', 'scripts', 'flash.sh');
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
          return reject(new Error(`Failed to extract flash.sh: ${copyErr.message}`));
        }

        // Port number
        const portNumber = comPort;

        // Run the flash script with the port number and firmware path as arguments
        const bash = spawn('bash', [tempScriptPath, portNumber, options.firmwarePath]);
        
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
            const timeoutMsg = stdout.match(/=+ COPY TIMEOUT =+[\s\S]*?=+/);
            resolve({
              success: false,
              error: timeoutMsg ? timeoutMsg[0] : 'Copying the firmware file timed out. Please check the Pico connection and try again.'
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