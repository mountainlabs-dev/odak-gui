// Preload script - Secure bridge between renderer and main processes
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected APIs to renderer process
contextBridge.exposeInMainWorld('api', {
  // Serial communication
  getPorts: () => ipcRenderer.on('ports-list', (event, ports) => ports),
  connectToPort: (portConfig) => ipcRenderer.invoke('connect-port', portConfig),
  disconnectPort: () => ipcRenderer.invoke('disconnect-port'),
  sendCommand: (command) => ipcRenderer.invoke('send-command', command),
  refreshPorts: () => ipcRenderer.invoke('refresh-ports'),
  
  // Data logging
  selectLogFile: () => ipcRenderer.invoke('select-log-file'),
  toggleLogging: (enabled) => ipcRenderer.invoke('toggle-logging', enabled),
  
  // CLI export
  exportConsoleOutput: (content) => ipcRenderer.invoke('export-console-output', content),
  
  // Device history (measurements stored in the device's flash)
  saveHistory: (history) => ipcRenderer.invoke('save-history', history),
  loadHistoryCache: () => ipcRenderer.invoke('history-cache-load'),
  saveHistoryCache: (cache) => ipcRenderer.invoke('history-cache-save', cache),
  openHistoryFile: () => ipcRenderer.invoke('open-history-file'),
  saveBackup: (backup) => ipcRenderer.invoke('save-backup', backup),
  
  // Firmware update
  selectFirmwareFile: () => ipcRenderer.invoke('select-firmware-file'),
  updateFirmware: (options) => ipcRenderer.invoke('update-firmware', options),
  getFirmwareManifest: () => ipcRenderer.invoke('firmware-manifest'),
  downloadFirmware: (board) => ipcRenderer.invoke('firmware-download', board),
  onFirmwareDownloadProgress: (callback) => {
    ipcRenderer.on('firmware-download-progress', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('firmware-download-progress');
  },
  
  // Event listeners
  onPortsList: (callback) => {
    ipcRenderer.on('ports-list', (event, ports) => callback(ports));
    return () => {
      ipcRenderer.removeAllListeners('ports-list');
    };
  },
  
  onConnectionStatus: (callback) => {
    ipcRenderer.on('connection-status', (event, status) => callback(status));
    return () => {
      ipcRenderer.removeAllListeners('connection-status');
    };
  },
  
  onSerialData: (callback) => {
    ipcRenderer.on('serial-data', (event, data) => callback(data));
    return () => {
      ipcRenderer.removeAllListeners('serial-data');
    };
  },
  
  onError: (callback) => {
    ipcRenderer.on('error', (event, error) => callback(error));
    return () => {
      ipcRenderer.removeAllListeners('error');
    };
  },
  
  onFirmwareProgress: (callback) => {
    ipcRenderer.on('firmware-progress', (event, data) => callback(data));
    return () => {
      ipcRenderer.removeAllListeners('firmware-progress');
    };
  },
});

contextBridge.exposeInMainWorld('odakPlatform', {
  platform: process.platform
});