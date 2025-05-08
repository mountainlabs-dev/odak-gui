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
  
  // Refresh every 3 seconds
  portRefreshInterval = setInterval(listSerialPorts, 3000);
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
    
    // Use PowerShell directly via child_process
    return new Promise((resolve, reject) => {
      const psScript = `
        # Use COM port if provided (for direct reset)
        $comPort = "${comPort}"
        
        if ($comPort) {
          # Reset Pico over serial by changing baud rate
          Write-Host "Resetting device on $comPort..."
          mode $comPort baud=12 parity=n data=8 stop=1
        } else {
          Write-Host "No serial connection active. Please manually reset the device into bootloader mode."
        }
        
        # Wait for the device to enter BOOTSEL mode
        Write-Host "Waiting for device to mount as a USB drive..."
        $i = 0
        $drive = $(Get-WmiObject Win32_LogicalDisk | Where-Object { $_.VolumeName -match "RPI" -or $_.VolumeName -match "BOOTLOADER" }).DeviceID.ToString()
        while ($drive -eq $null) {
            Write-Host "." -NoNewline
            Start-Sleep -Milliseconds 500
            $i += 1

            # Exit if the device is not detected after 60 attempts (30 seconds)
            if ($i -ge 60) {
                throw "No bootloader device found after 30 seconds. Check connections and try again."
            }
            
            $drive = $(Get-WmiObject Win32_LogicalDisk | Where-Object { $_.VolumeName -match "RPI" -or $_.VolumeName -match "BOOTLOADER" }).DeviceID.ToString()
        }

        # Check firmware file
        $uf2File = "${options.firmwarePath}"
        if (-not (Test-Path -Path $uf2File)) {
            throw "Firmware file not found at: $uf2File"
        }

        # Copy firmware to the device
        Write-Host "Copying firmware to device ($drive)..."
        Copy-Item -Path $uf2File -Destination "$drive\\\"

        # Give some time for the device to reboot
        Start-Sleep -Seconds 3

        # Check if flashing was successful
        if (Test-Path -Path $drive) {
            throw "Device was reset but flashing may have failed. The device is still in bootloader mode."
        } else {
            Write-Host "Flashing successful! The device has rebooted with the new firmware."
        }
        
        Write-Output "Firmware update completed successfully"
      `;
      
      // Create a temporary file for the PowerShell script
      const tmpFile = path.join(app.getPath('temp'), 'odak-firmware-update.ps1');
      fs.writeFileSync(tmpFile, psScript);
      
      // Run PowerShell script
      const ps = spawn('powershell', [
        '-ExecutionPolicy', 'Bypass',
        '-File', tmpFile
      ]);
      
      let stdout = '';
      let stderr = '';
      
      ps.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        
        // Send progress updates to the renderer
        mainWindow.webContents.send('firmware-progress', { message: output });
      });
      
      ps.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      ps.on('close', (code) => {
        // Delete the temporary file
        try {
          fs.unlinkSync(tmpFile);
        } catch (err) {
          console.error('Failed to delete temporary file:', err);
        }
        
        if (code === 0) {
          resolve({ success: true, message: stdout });
        } else {
          reject(new Error(stderr || `Process exited with code ${code}`));
        }
      });
      
      ps.on('error', (err) => {
        try {
          fs.unlinkSync(tmpFile);
        } catch (error) {
          console.error('Failed to delete temporary file:', error);
        }
        reject(err);
      });
    });
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