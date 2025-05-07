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
  
  // Application state
  let isConnected = false;
  let selectedPort = null;
  let commandHistory = [];
  let commandIndex = -1;
  let selectedFirmwarePath = null;
  
  // Setup event listeners
  setupEventListeners();
  
  // Handle API communications
  setupApiCommunication();
  
  function setupEventListeners() {
    // Port selection and connection
    connectBtn.addEventListener('click', connectToPort);
    disconnectBtn.addEventListener('click', disconnectPort);
    refreshPortsBtn.addEventListener('click', refreshPorts);
    
    // CLI Interface
    cliSendBtn.addEventListener('click', sendCommand);
    cliInput.addEventListener('keydown', handleCliInputKeydown);
    cmdBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        const immediate = btn.dataset.immediate === 'true';
        
        cliInput.value = cmd;
        
        if (immediate) {
          // Send immediately for commands that don't require values
          sendCommand();
        }
      });
    });
    
    // Data logging
    loggingToggle.addEventListener('change', toggleLogging);
    selectLogFileBtn.addEventListener('click', selectLogFile);
    
    // Firmware update
    selectFirmwareBtn.addEventListener('click', selectFirmwareFile);
    updateFirmwareBtn.addEventListener('click', updateFirmware);
    
    // Charts
    clearChartsBtn.addEventListener('click', clearCharts);
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
  function updatePortList(portsData) {
    // Extract the ports list and connection info
    const ports = Array.isArray(portsData) ? portsData : (portsData.ports || []);
    const connectionInfo = !Array.isArray(portsData) ? {
      isConnected: portsData.isConnected,
      currentPort: portsData.currentPort
    } : { isConnected: false, currentPort: null };
    
    // Don't modify button states if we're already connected
    if (connectionInfo.isConnected && isConnected) {
      // Still update the port list, but preserve connection state
      portSelect.innerHTML = '';
      
      ports.forEach(port => {
        const option = document.createElement('option');
        option.value = port.path;
        option.text = `${port.path}`;
        
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
      ports.forEach(port => {
        const option = document.createElement('option');
        option.value = port.path;
        option.text = `${port.path}`;
        portSelect.add(option);
      });
      
      // Only enable connect button if we're definitely not connected
      connectBtn.disabled = isConnected;
    }
  }
  
  function refreshPorts() {
    // This will trigger the 'ports-list' event which is handled by the onPortsList listener
    connectBtn.disabled = true;
    disconnectBtn.disabled = true;
    connectionStatus.innerHTML = '<span class="badge bg-secondary">Refreshing...</span>';
  }
  
  async function connectToPort() {
    if (!portSelect.value) return;
    
    try {
      // Disable both buttons during the connection attempt
      connectBtn.disabled = true;
      disconnectBtn.disabled = true;
      
      const result = await window.api.connectToPort({ path: portSelect.value });
      
      if (result.success) {
        selectedPort = portSelect.value;
        // Immediately update UI state for successful connection
        isConnected = true;
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        connectionStatus.innerHTML = `<span class="badge connected"><i class="bi bi-link me-1"></i> Connected to ${selectedPort}</span>`;
        updateFirmwareBtn.disabled = !selectedFirmwarePath;
        addToCliOutput(`Connected to ${selectedPort}`, 'cli-command');
      } else {
        // Reset buttons if connection failed
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        displayError({ message: 'Failed to connect', details: result.error });
      }
    } catch (error) {
      // Reset buttons on error
      connectBtn.disabled = false;
      disconnectBtn.disabled = true;
      displayError({ message: 'Connection error', details: error.message });
    }
  }
  
  async function disconnectPort() {
    try {
      // Disable both buttons during the disconnection attempt
      connectBtn.disabled = true;
      disconnectBtn.disabled = true;
      
      const result = await window.api.disconnectPort();
      
      if (result.success) {
        // Immediately update UI state for successful disconnection
        isConnected = false;
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        connectionStatus.innerHTML = '<span class="badge disconnected"><i class="bi bi-broadcast me-1"></i> Disconnected</span>';
        updateFirmwareBtn.disabled = true;
        addToCliOutput('Disconnected from device', 'cli-command');
      } else {
        // Reset buttons if disconnection failed
        connectBtn.disabled = isConnected;
        disconnectBtn.disabled = !isConnected;
        displayError({ message: 'Failed to disconnect', details: result.error });
      }
    } catch (error) {
      // Reset buttons on error
      connectBtn.disabled = isConnected;
      disconnectBtn.disabled = !isConnected;
      displayError({ message: 'Disconnect error', details: error.message });
    }
  }
  
  function updateConnectionStatus(status) {
    if (status.connected) {
      isConnected = true;
      connectionStatus.innerHTML = `<span class="badge connected"><i class="bi bi-link me-1"></i> Connected to ${status.port}</span>`;
      connectBtn.disabled = true;
      disconnectBtn.disabled = false;
      updateFirmwareBtn.disabled = !selectedFirmwarePath;
    } else {
      isConnected = false;
      connectionStatus.innerHTML = '<span class="badge disconnected"><i class="bi bi-broadcast me-1"></i> Disconnected</span>';
      connectBtn.disabled = false;
      disconnectBtn.disabled = true;
      updateFirmwareBtn.disabled = true;
    }
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
      addToCliOutput(`$ ${command}`, 'cli-command');
      
      // Send command
      const formattedCommand = command.startsWith('$') ? command : `$${command}`;
      const result = await window.api.sendCommand(formattedCommand);
      
      if (!result.success) {
        addToCliOutput(`Error: ${result.error}`, 'cli-error');
      }
      
      // Clear input
      cliInput.value = '';
    } catch (error) {
      displayError({ message: 'Command error', details: error.message });
    }
  }
  
  // Enhance CLI with colored output
  function addToCliOutput(text, className = 'cli-output') {
    const line = document.createElement('div');
    line.className = className;
    
    // Enhanced colored output based on content
    if (className === 'cli-output') {
      if (text.includes('ERROR ')) {
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
    
    line.textContent = text;
    cliOutput.appendChild(line);
    cliOutput.scrollTop = cliOutput.scrollHeight;
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
    console.log('Sensor Data:', data);
    // Update current readings display
    if (data.temperature !== undefined) {
      statTemp.textContent = `${data.temperature.toFixed(1)} °C`;
      addDataPoint('temperature', data.temperature);
    }
    
    if (data.humidity !== undefined) {
      statHumidity.textContent = `${data.humidity.toFixed(1)} %`;
      addDataPoint('humidity', data.humidity);
    }
    
    if (data.co2 !== undefined) {
      statCo2.textContent = `${data.co2.toFixed(0)} ppm`;
      addDataPoint('co2', data.co2);
    }
    
    if (data.voc !== undefined) {
      statVoc.textContent = `${data.voc.toFixed(2)} ppm`;
      addDataPoint('voc', data.voc);
    }
    
    // Handle PM1 format
    if (data.pm1 !== undefined) {
      statPm1.textContent = `${data.pm1.toFixed(1)} µg/m³`;
      addDataPoint('pm1', data.pm1);
    }
    
    // Handle PM2.5 format
    if (data['pm2.5'] !== undefined) {
      statPm25.textContent = `${data['pm2.5'].toFixed(1)} µg/m³`;
      addDataPoint('pm25', data['pm2.5']);
    }
    
    // Handle PM10 format
    if (data.pm10 !== undefined) {
      statPm10.textContent = `${data.pm10.toFixed(1)} µg/m³`;
      addDataPoint('pm10', data.pm10);
    }
    
    // Handle AQI if available
    if (data.aqi !== undefined) {
      statAqi.textContent = `${data.aqi.toFixed(0)}`;
      addDataPoint('aqi', data.aqi);
    }
    
    // Handle pressure if available
    if (data.pressure !== undefined) {
      statPressure.textContent = `${data.pressure.toFixed(1)} hPa`;
      addDataPoint('pressure', data.pressure);
    }
    
    // Handle elevation if available
    if (data.elevation !== undefined) {
      statElevation.textContent = `${data.elevation.toFixed(1)} m`;
      addDataPoint('elevation', data.elevation);
    }

    // Handle battery if available
    if (data.battery !== undefined) {
      statBattery.textContent = `${data.battery.toFixed(1)} %`;
      addDataPoint('battery', data.battery);
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
  
  // Firmware Update Functions
  async function selectFirmwareFile() {
    try {
      const result = await window.api.selectFirmwareFile();
      
      if (result.success) {
        selectedFirmwarePath = result.filePath;
        firmwareFileInput.value = selectedFirmwarePath;
        updateFirmwareBtn.disabled = !isConnected;
      }
    } catch (error) {
      displayError({ message: 'File selection error', details: error.message });
    }
  }
  
  async function updateFirmware() {
    if (!selectedFirmwarePath) return;
    
    try {
      updateFirmwareBtn.disabled = true;
      updateProgressContainer.classList.remove('d-none');
      updateProgress.style.width = '0%';
      updateStatus.textContent = 'Preparing firmware update...';
      
      // Simulate progress to provide visual feedback
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += 5;
        if (progress > 95) {
          clearInterval(progressInterval);
        } else {
          updateProgress.style.width = `${progress}%`;
        }
      }, 500);
      
      const result = await window.api.updateFirmware({
        firmwarePath: selectedFirmwarePath
      });
      
      clearInterval(progressInterval);
      
      if (result.success) {
        updateProgress.style.width = '100%';
        updateStatus.innerHTML = `<div class="alert alert-success">Firmware update completed successfully. Please reconnect the device.</div>`;
      } else {
        updateProgress.style.width = '100%';
        updateProgress.classList.remove('progress-bar-animated');
        updateProgress.classList.add('bg-danger');
        updateStatus.innerHTML = `<div class="alert alert-danger">Firmware update failed: ${result.error}</div>`;
      }
    } catch (error) {
      updateProgress.style.width = '100%';
      updateProgress.classList.remove('progress-bar-animated');
      updateProgress.classList.add('bg-danger');
      updateStatus.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
      displayError({ message: 'Firmware update error', details: error.message });
    } finally {
      updateFirmwareBtn.disabled = false;
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
          } else if (line.includes('Flashing successful')) {
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
            label: 'VOC (mg/m³)',
            borderColor: 'rgb(108, 117, 125)', // Gray - matching stat card
            backgroundColor: 'rgba(108, 117, 125, 0.1)',
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
              text: 'VOC (mg/m³)'
            },
            position: 'right',
            grid: {
              drawOnChartArea: false
            }
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
});