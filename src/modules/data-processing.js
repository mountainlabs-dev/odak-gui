// Data Processing module for ODAK GUI

export default function initDataProcessing(elements, state) {
  // Process sensor data and update UI
  function processSensorData(data) {
    if (!data || typeof data !== 'object') return;

    // Update sensor readings
    if (data.temperature !== undefined && elements.readingTemp) {
      elements.readingTemp.textContent = `${data.temperature.toFixed(1)}°C`;
      if (elements.statTemp) elements.statTemp.textContent = `${data.temperature.toFixed(1)}°C`;
    }
    
    if (data.humidity !== undefined && elements.readingHum) {
      elements.readingHum.textContent = `${data.humidity.toFixed(1)}%`;
      if (elements.statHumidity) elements.statHumidity.textContent = `${data.humidity.toFixed(1)}%`;
    }
    
    if (data.co2 !== undefined && elements.readingCo2) {
      elements.readingCo2.textContent = `${data.co2} ppm`;
      if (elements.statCo2) elements.statCo2.textContent = `${data.co2} ppm`;
    }
    
    if (data.voc !== undefined && elements.readingVoc) {
      elements.readingVoc.textContent = `${data.voc} ppb`;
    }
    
    if (data.pm1 !== undefined && elements.readingPm1) {
      elements.readingPm1.textContent = `${data.pm1.toFixed(1)} µg/m³`;
    }
    
    if (data.pm25 !== undefined && elements.readingPm25) {
      elements.readingPm25.textContent = `${data.pm25.toFixed(1)} µg/m³`;
      if (elements.statPm25) elements.statPm25.textContent = `${data.pm25.toFixed(1)} µg/m³`;
    }
    
    if (data.pm10 !== undefined && elements.readingPm10) {
      elements.readingPm10.textContent = `${data.pm10.toFixed(1)} µg/m³`;
    }
    
    if (data.battery !== undefined && elements.readingBatt) {
      elements.readingBatt.textContent = `${data.battery.toFixed(1)}%`;
    }
    
    // Add data to historical arrays for charting
    const timestamp = new Date();
    
    if (data.temperature !== undefined) {
      state.tempData.push({ x: timestamp, y: data.temperature });
      if (state.tempData.length > state.maxDataPoints) state.tempData.shift();
    }
    
    if (data.humidity !== undefined) {
      state.humidityData.push({ x: timestamp, y: data.humidity });
      if (state.humidityData.length > state.maxDataPoints) state.humidityData.shift();
    }
    
    if (data.co2 !== undefined) {
      state.co2Data.push({ x: timestamp, y: data.co2 });
      if (state.co2Data.length > state.maxDataPoints) state.co2Data.shift();
    }
    
    if (data.pm25 !== undefined) {
      state.pm25Data.push({ x: timestamp, y: data.pm25 });
      if (state.pm25Data.length > state.maxDataPoints) state.pm25Data.shift();
    }
  }

  // Return public API
  return {
    processSensorData
  };
}