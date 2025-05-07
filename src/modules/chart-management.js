// chart-management.js
// Module for handling charts and visualization in ODAK GUI

// Chart objects
let charts = {};

// Chart data storage
let chartData = {
  temperature: [],
  humidity: [],
  co2: [],
  voc: [],
  pm1: [],
  pm25: [],
  pm10: [],
  battery: [],
  aqi: [],
  pressure: [],
  elevation: []
};

/**
 * Initialize all charts used in the application
 */
function initCharts() {
console.log('DEBUG: initCharts called');
  
  // Check if Chart.js is available
  if (typeof Chart === 'undefined') {
    console.error('ERROR: Chart.js not loaded! Cannot initialize charts.');
    return;
  }

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
  if (tempHumCtx) {
    try {
console.log('DEBUG: Creating temperature/humidity chart');
      charts.tempHum = new Chart(tempHumCtx, {
        type: 'line',
        data: {
          datasets: [
            {
              label: 'Temperature (°C)',
              borderColor: 'rgb(255, 127, 0)',  // Updated to orange to match stat card
              backgroundColor: 'rgba(255, 127, 0, 0.1)',
              borderWidth: 2,
              pointRadius: 3,
              pointHoverRadius: 5,
              tension: 0.2,
              data: chartData.temperature,
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
console.log('DEBUG: Temperature/humidity chart created successfully');
    } catch (err) {
      console.error('Failed to create temperature/humidity chart:', err);
    }
  } else {
    console.warn('Temperature/humidity chart canvas not found');
  }

  // CO2 Chart
  const co2Ctx = document.getElementById('co2Chart');
  if (co2Ctx) {
    try {
      charts.co2 = new Chart(co2Ctx, {
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
              text: 'CO2 Levels'
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
              position: 'left',
              suggestedMin: 400,
              suggestedMax: 2000
            }
          }
        }
      });
    } catch (err) {
      console.error('Failed to create CO2 chart:', err);
    }
  } else {
    console.warn('CO2 chart canvas not found');
  }
  
  // VOC Chart
  const vocCtx = document.getElementById('vocChart');
  if (vocCtx) {
    try {
      charts.voc = new Chart(vocCtx, {
        type: 'line',
        data: {
          datasets: [
            {
              label: 'VOC (mg/m³)',
              borderColor: 'rgb(108, 117, 125)',
              backgroundColor: 'rgba(108, 117, 125, 0.1)',
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
              text: 'VOC Levels'
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
              position: 'left'
            }
          }
        }
      });
    } catch (err) {
      console.error('Failed to create VOC chart:', err);
    }
  } else {
    console.warn('VOC chart canvas not found');
  }
  
  // Particulate Matter Chart
  const pmCtx = document.getElementById('pmChart');
  if (pmCtx) {
    try {
      charts.pm = new Chart(pmCtx, {
        type: 'line',
        data: {
          datasets: [
            {
              label: 'PM1.0 (µg/m³)',
              borderColor: 'rgb(20, 184, 166)',
              backgroundColor: 'rgba(20, 184, 166, 0.1)',
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
              borderColor: 'rgb(220, 38, 38)',
              backgroundColor: 'rgba(220, 38, 38, 0.1)',
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
    } catch (err) {
      console.error('Failed to create PM chart:', err);
    }
  } else {
    console.warn('PM chart canvas not found');
  }
  
  // AQI Chart
  const aqiCtx = document.getElementById('aqiChart');
  if (aqiCtx) {
    try {
      charts.aqi = new Chart(aqiCtx, {
        type: 'line',
        data: {
          datasets: [
            {
              label: 'Air Quality Index',
              borderColor: 'rgb(111, 66, 193)',
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
    } catch (err) {
      console.error('Failed to create AQI chart:', err);
    }
  } else {
    console.warn('AQI chart canvas not found');
  }
  
  // Battery Chart
  const batteryCtx = document.getElementById('batteryChart');
  if (batteryCtx) {
    try {
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
    } catch (err) {
      console.error('Failed to create battery chart:', err);
    }
  } else {
    console.warn('Battery chart canvas not found');
  }
  
  // Pressure Chart
  const pressureCtx = document.getElementById('pressureChart');
  if (pressureCtx) {
    try {
      charts.pressure = new Chart(pressureCtx, {
        type: 'line',
        data: {
          datasets: [
            {
              label: 'Pressure (hPa)',
              borderColor: 'rgb(102, 16, 242)',
              backgroundColor: 'rgba(102, 16, 242, 0.1)',
              borderWidth: 2,
              pointRadius: 3,
              pointHoverRadius: 5,
              tension: 0.2,
              data: chartData.pressure
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
              text: 'Atmospheric Pressure'
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
    } catch (err) {
      console.error('Failed to create pressure chart:', err);
    }
  } else {
    console.warn('Pressure chart canvas not found');
  }
  
  // Elevation Chart
  const elevationCtx = document.getElementById('elevationChart');
  if (elevationCtx) {
    try {
      charts.elevation = new Chart(elevationCtx, {
        type: 'line',
        data: {
          datasets: [
            {
              label: 'Elevation (m)',
              borderColor: 'rgb(20, 120, 60)',
              backgroundColor: 'rgba(20, 120, 60, 0.1)',
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
    } catch (err) {
      console.error('Failed to create elevation chart:', err);
    }
  } else {
    console.warn('Elevation chart canvas not found');
  }
}

/**
 * Add a data point to the specified chart data
 * @param {string} type - Type of data (temperature, humidity, etc.)
 * @param {number} value - Value to add
 */
function addDataPoint(type, value) {
  // Validate input
  if (value === undefined || value === null || isNaN(value)) {
    console.warn(`Invalid data point for ${type}: ${value}`);
    return;
  }

  const now = new Date();
  
  // Add data point with validation and logging
  try {
    switch (type) {
      case 'temperature':
        chartData.temperature.push({ x: now, y: parseFloat(value) });
        if (chartData.temperature.length > 100) chartData.temperature.shift();
        console.log(`Added temperature data: ${value} °C`);
        break;
      case 'humidity':
        chartData.humidity.push({ x: now, y: parseFloat(value) });
        if (chartData.humidity.length > 100) chartData.humidity.shift();
        console.log(`Added humidity data: ${value} %`);
        break;
      case 'co2':
        chartData.co2.push({ x: now, y: parseFloat(value) });
        if (chartData.co2.length > 100) chartData.co2.shift();
        console.log(`Added CO2 data: ${value} ppm`);
        break;
      case 'voc':
        chartData.voc.push({ x: now, y: parseFloat(value) });
        if (chartData.voc.length > 100) chartData.voc.shift();
        console.log(`Added VOC data: ${value} mg/m³`);
        break;
      case 'pm1':
        chartData.pm1.push({ x: now, y: parseFloat(value) });
        if (chartData.pm1.length > 100) chartData.pm1.shift();
        console.log(`Added PM1 data: ${value} µg/m³`);
        break;
      case 'pm25':
        chartData.pm25.push({ x: now, y: parseFloat(value) });
        if (chartData.pm25.length > 100) chartData.pm25.shift();
        console.log(`Added PM2.5 data: ${value} µg/m³`);
        break;
      case 'pm10':
        chartData.pm10.push({ x: now, y: parseFloat(value) });
        if (chartData.pm10.length > 100) chartData.pm10.shift();
        console.log(`Added PM10 data: ${value} µg/m³`);
        break;
      case 'battery':
        chartData.battery.push({ x: now, y: parseFloat(value) });
        if (chartData.battery.length > 100) chartData.battery.shift();
        console.log(`Added battery data: ${value} V`);
        break;
      case 'aqi':
        chartData.aqi.push({ x: now, y: parseFloat(value) });
        if (chartData.aqi.length > 100) chartData.aqi.shift();
        console.log(`Added AQI data: ${value}`);
        break;
      case 'pressure':
        chartData.pressure.push({ x: now, y: parseFloat(value) });
        if (chartData.pressure.length > 100) chartData.pressure.shift();
        console.log(`Added pressure data: ${value} hPa`);
        break;
      case 'elevation':
        chartData.elevation.push({ x: now, y: parseFloat(value) });
        if (chartData.elevation.length > 100) chartData.elevation.shift();
        console.log(`Added elevation data: ${value} m`);
        break;
    }
    
    // Call updateCharts after adding new data point
    updateCharts();
    
  } catch (error) {
    console.error(`Error adding data point for ${type}:`, error);
  }
}

/**
 * Update all charts with current data
 */
function updateCharts() {
    // Temperature and Humidity
    if (charts.tempHum) {
        charts.tempHum.data.datasets[0].data = chartData.temperature;
        charts.tempHum.data.datasets[1].data = chartData.humidity;
        charts.tempHum.update();
    }

    // CO2
    if (charts.co2) {
        charts.co2.data.datasets[0].data = chartData.co2;
        charts.co2.update();
    }

    // VOC
    if (charts.voc) {
        charts.voc.data.datasets[0].data = chartData.voc;
        charts.voc.update();
    }
        // Particulte Matter
    if (charts.pm) {
        charts.pm.data.datasets[0].data = chartData.pm1;
        charts.pm.data.datasets[1].data = chartData.pm25;
        charts.pm.data.datasets[2].data = chartData.pm10;
        charts.pm.update();
    }

    // AQI
    if (charts.aqi) {
        charts.aqi.data.datasets[0].data = chartData.aqi;
        charts.aqi.update();
    }

    // Battery
    if (charts.battery) {
        charts.battery.data.datasets[0].data = [chartData.battery];
        charts.battery.update('none');
    }

    // Pressure
    if (charts.pressure) {
        charts.pressure.data.datasets[0].data = [...chartData.pressure];
        charts.pressure.update('none');
    }

    // Elevation
    if (charts.elevation) {
        charts.elevation.data.datasets[0].data = [chartData.elevation];
        charts.elevation.update('none');
    }
}

/**
 * Clear all chart data
 */
function clearCharts() {
  // Reset all chart data
  chartData = {
    temperature: [],
    humidity: [],
    co2: [],
    voc: [],
    pm1: [],
    pm25: [],
    pm10: [],
    battery: [],
    aqi: [],
    pressure: [],
    elevation: []
  };
  
  console.log("All chart data cleared");
  
  // Update charts to clear display
  updateCharts();
}

// Export functions
export {
  initCharts,
  addDataPoint,
  updateCharts,
  clearCharts
};