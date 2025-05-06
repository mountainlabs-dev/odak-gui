// Renderer process for ODAK Air Quality Monitor GUI
document.addEventListener('DOMContentLoaded', () => {
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
  
  // Sensor reading elements
  const readingTemp = document.getElementById('reading-temp');
  const readingHum = document.getElementById('reading-hum');
  const readingCo2 = document.getElementById('reading-co2');
  const readingVoc = document.getElementById('reading-voc');
  const readingPm1 = document.getElementById('reading-pm1');
  const readingPm25 = document.getElementById('reading-pm25');
  const readingPm10 = document.getElementById('reading-pm10');
  const readingBatt = document.getElementById('reading-batt');
  
  // Additional DOM elements for enhanced UI
  const statTemp = document.getElementById('stat-temp');
  const statHumidity = document.getElementById('stat-humidity');
  const statCo2 = document.getElementById('stat-co2');
  const statPm25 = document.getElementById('stat-pm25');

  // Application state
  let isConnected = false;
  let selectedPort = null;
  let commandHistory = [];
  let commandIndex = -1;
  let selectedFirmwarePath = null;
  let charts = {};
  let chartData = {
    temperature: [],
    humidity: [],
    co2: [],
    voc: [],
    pm1: [],
    pm25: [],
    pm10: [],
    battery: []
  };
  
  // Initialize charts
  initCharts();
  
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
        option.text = `${port.path} - ${port.manufacturer || 'Unknown device'}`;
        
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
        option.text = `${port.path} - ${port.manufacturer || 'Unknown device'}`;
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
      if (text.includes('ERROR') || text.includes('failed') || text.includes('Failed')) {
        line.className = 'cli-error';
      } else if (text.includes('WARNING') || text.includes('WARN')) {
        line.className = 'cli-warning';
      } else if (text.includes('INFO') || text.includes('success') || text.includes('Success')) {
        line.className = 'cli-info';
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
    // Update current readings display
    if (data.temperature !== undefined) {
      readingTemp.textContent = `${data.temperature.toFixed(1)}`;
      statTemp.textContent = `${data.temperature.toFixed(1)} °C`;
      addDataPoint('temperature', data.temperature);
    }
    
    if (data.humidity !== undefined) {
      readingHum.textContent = `${data.humidity.toFixed(1)}`;
      statHumidity.textContent = `${data.humidity.toFixed(1)} %`;
      addDataPoint('humidity', data.humidity);
    }
    
    if (data.co2 !== undefined) {
      readingCo2.textContent = `${data.co2.toFixed(0)}`;
      statCo2.textContent = `${data.co2.toFixed(0)} ppm`;
      addDataPoint('co2', data.co2);
    }
    
    if (data.voc !== undefined) {
      readingVoc.textContent = `${data.voc.toFixed(2)}`;
      addDataPoint('voc', data.voc);
    }
    
    // Handle both PM1 formats
    if (data.pm1 !== undefined) {
      readingPm1.textContent = `${data.pm1.toFixed(1)}`;
      addDataPoint('pm1', data.pm1);
    }
    
    // Handle both PM2.5 formats (pm25 or pm2.5)
    if (data['pm2.5'] !== undefined) {
      readingPm25.textContent = `${data['pm2.5'].toFixed(1)}`;
      statPm25.textContent = `${data['pm2.5'].toFixed(1)} µg/m³`;
      addDataPoint('pm25', data['pm2.5']);
    } else if (data.pm25 !== undefined) {
      readingPm25.textContent = `${data.pm25.toFixed(1)}`;
      statPm25.textContent = `${data.pm25.toFixed(1)} µg/m³`;
      addDataPoint('pm25', data.pm25);
    }
    
    if (data.pm10 !== undefined) {
      readingPm10.textContent = `${data.pm10.toFixed(1)}`;
      addDataPoint('pm10', data.pm10);
    }
    
    // Battery could be percentage or voltage
    if (data.battery !== undefined) {
      // If battery is in percentage (0-100) display as percentage, otherwise as voltage
      if (data.battery > 0 && data.battery <= 100 && Number.isInteger(data.battery)) {
        readingBatt.textContent = `${data.battery}%`;
      } else {
        readingBatt.textContent = `${data.battery.toFixed(2)}V`;
      }
      addDataPoint('battery', data.battery);
    }
    
    // Additional fields from the example JSON
    if (data.pressure !== undefined) {
      addToCliOutput(`Pressure: ${data.pressure.toFixed(2)} hPa`, 'cli-info');
    }
    
    if (data.elevation !== undefined) {
      addToCliOutput(`Elevation: ${data.elevation} m`, 'cli-info');
    }
    
    if (data.aqi !== undefined) {
      addToCliOutput(`Air Quality Index: ${data.aqi}`, 'cli-info');
    }
    
    // Update charts
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
            borderColor: 'rgb(220, 53, 69)',
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
            borderColor: 'rgb(13, 110, 253)',
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

    // CO2 and VOC Chart with similar enhanced styling
    const co2VocCtx = document.getElementById('co2VocChart');
    charts.co2Voc = new Chart(co2VocCtx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'CO2 (ppm)',
            borderColor: 'rgb(255, 193, 7)',
            backgroundColor: 'rgba(255, 193, 7, 0.1)',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.2,
            data: [],
            yAxisID: 'y'
          },
          {
            label: 'VOC (mg/m³)',
            borderColor: 'rgb(108, 117, 125)',
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
            text: 'CO2 & VOC Levels'
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
          },
          y1: {
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
    
    // Use similar enhanced styling for Particulate Matter Chart
    const pmCtx = document.getElementById('pmChart');
    charts.pm = new Chart(pmCtx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'PM1.0 (µg/m³)',
            borderColor: 'rgb(25, 135, 84)',
            backgroundColor: 'rgba(25, 135, 84, 0.1)',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.2,
            data: []
          },
          {
            label: 'PM2.5 (µg/m³)',
            borderColor: 'rgb(255, 193, 7)',
            backgroundColor: 'rgba(255, 193, 7, 0.1)',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.2,
            data: []
          },
          {
            label: 'PM10 (µg/m³)',
            borderColor: 'rgb(220, 53, 69)',
            backgroundColor: 'rgba(220, 53, 69, 0.1)',
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
            label: 'Battery (V)',
            borderColor: 'rgb(13, 202, 240)',
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
  }
  
  function addDataPoint(type, value) {
    const now = new Date();
    
    switch (type) {
      case 'temperature':
        chartData.temperature.push({ x: now, y: value });
        if (chartData.temperature.length > 100) chartData.temperature.shift();
        break;
      case 'humidity':
        chartData.humidity.push({ x: now, y: value });
        if (chartData.humidity.length > 100) chartData.humidity.shift();
        break;
      case 'co2':
        chartData.co2.push({ x: now, y: value });
        if (chartData.co2.length > 100) chartData.co2.shift();
        break;
      case 'voc':
        chartData.voc.push({ x: now, y: value });
        if (chartData.voc.length > 100) chartData.voc.shift();
        break;
      case 'pm1':
        chartData.pm1.push({ x: now, y: value });
        if (chartData.pm1.length > 100) chartData.pm1.shift();
        break;
      case 'pm25':
        chartData.pm25.push({ x: now, y: value });
        if (chartData.pm25.length > 100) chartData.pm25.shift();
        break;
      case 'pm10':
        chartData.pm10.push({ x: now, y: value });
        if (chartData.pm10.length > 100) chartData.pm10.shift();
        break;
      case 'battery':
        chartData.battery.push({ x: now, y: value });
        if (chartData.battery.length > 100) chartData.battery.shift();
        break;
    }
  }
  
  function updateCharts() {
    // Temperature and Humidity
    charts.tempHum.data.datasets[0].data = chartData.temperature;
    charts.tempHum.data.datasets[1].data = chartData.humidity;
    charts.tempHum.update();
    
    // CO2 and VOC
    charts.co2Voc.data.datasets[0].data = chartData.co2;
    charts.co2Voc.data.datasets[1].data = chartData.voc;
    charts.co2Voc.update();
    
    // Particulate Matter
    charts.pm.data.datasets[0].data = chartData.pm1;
    charts.pm.data.datasets[1].data = chartData.pm25;
    charts.pm.data.datasets[2].data = chartData.pm10;
    charts.pm.update();
    
    // Battery
    charts.battery.data.datasets[0].data = chartData.battery;
    charts.battery.update();
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