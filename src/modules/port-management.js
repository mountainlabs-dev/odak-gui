/**
 * Port Management module for ODAK GUI
 * Handles serial port selection, connection, and disconnection
 */

import * as Elements from './dom-elements.js';
import { handleError } from './error-handling.js';

// Global connection variables
let port = null;
let reader = null;
let readableStreamClosed = null;
let writer = null;
let writableStreamClosed = null;
let isConnected = false;

// Event callbacks
const dataCallbacks = [];
const connectionCallbacks = [];
const disconnectionCallbacks = [];

/**
 * Initialize port management functionality
 */
export function initPortManagement() {
  Elements.refreshPortsBtn.addEventListener('click', listPorts);
  Elements.connectBtn.addEventListener('click', connectToPort);
  Elements.disconnectBtn.addEventListener('click', disconnectFromPort);
  
  // Initial port listing
  listPorts();
  updateUIState();
}

/**
 * List available serial ports
 */
export async function listPorts() {
  try {
    Elements.portSelect.innerHTML = '<option value="" disabled selected>Select a port</option>';
    const ports = await navigator.serial.getPorts();
    
    if (ports.length === 0) {
      const option = document.createElement('option');
      option.textContent = 'No ports available';
      option.disabled = true;
      Elements.portSelect.appendChild(option);
    } else {
      ports.forEach(async (port) => {
        const portInfo = port.getInfo();
        const option = document.createElement('option');
        option.value = JSON.stringify(portInfo);
        option.textContent = portInfo.usbVendorId && portInfo.usbProductId 
          ? `VID: ${portInfo.usbVendorId.toString(16)}, PID: ${portInfo.usbProductId.toString(16)}`
          : 'Unknown device';
        Elements.portSelect.appendChild(option);
      });
    }
  } catch (error) {
    handleError('Failed to list serial ports', error);
  }
}

/**
 * Connect to the selected serial port
 */
export async function connectToPort() {
  if (Elements.portSelect.value === '') {
    handleError('No port selected', null);
    return;
  }
  
  try {
    if (!port) {
      try {
        port = await navigator.serial.requestPort();
      } catch (error) {
        handleError('User cancelled port selection', error);
        return;
      }
    }
    
    await port.open({ baudRate: 115200 });
    
    // Setup the reader
    const textDecoder = new TextDecoderStream();
    readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    reader = textDecoder.readable.getReader();
    
    // Setup the writer
    const textEncoder = new TextEncoderStream();
    writableStreamClosed = textEncoder.readable.pipeTo(port.writable);
    writer = textEncoder.writable.getWriter();
    
    isConnected = true;
    updateUIState();
    
    // Notify connection callbacks
    connectionCallbacks.forEach(callback => callback());
    
    // Start reading loop
    readLoop();
    
  } catch (error) {
    handleError('Failed to connect to port', error);
  }
}

/**
 * Read data from the serial port in a loop
 */
async function readLoop() {
  try {
    while (isConnected && port.readable) {
      const { value, done } = await reader.read();
      
      if (done) {
        reader.releaseLock();
        break;
      }
      
      if (value) {
        // Notify data callbacks
        dataCallbacks.forEach(callback => callback(value));
      }
    }
  } catch (error) {
    handleError('Error reading from port', error);
    await disconnectFromPort();
  }
}

/**
 * Disconnect from the current serial port
 */
export async function disconnectFromPort() {
  if (!isConnected) return;
  
  try {
    if (reader) {
      await reader.cancel();
      await readableStreamClosed;
      reader = null;
    }
    
    if (writer) {
      await writer.close();
      await writableStreamClosed;
      writer = null;
    }
    
    if (port) {
      await port.close();
    }
  } catch (error) {
    handleError('Error during disconnect', error);
  } finally {
    isConnected = false;
    updateUIState();
    
    // Notify disconnection callbacks
    disconnectionCallbacks.forEach(callback => callback());
  }
}

/**
 * Send data to the connected serial port
 * @param {string} data - Data to send
 * @returns {Promise<boolean>} Success state
 */
export async function sendData(data) {
  if (!isConnected || !writer) {
    handleError('Cannot send data: Not connected', null);
    return false;
  }
  
  try {
    await writer.write(data + '\r\n');
    return true;
  } catch (error) {
    handleError('Failed to send data', error);
    return false;
  }
}

/**
 * Update UI state based on connection status
 */
function updateUIState() {
  Elements.connectBtn.disabled = isConnected;
  Elements.disconnectBtn.disabled = !isConnected;
  Elements.portSelect.disabled = isConnected;
  Elements.refreshPortsBtn.disabled = isConnected;
  
  Elements.connectionStatus.textContent = isConnected ? 'Connected' : 'Disconnected';
  Elements.connectionStatus.className = isConnected ? 'text-success' : 'text-danger';
}

/**
 * Register a callback for data received from the port
 * @param {function} callback - Function to call with received data
 */
export function onDataReceived(callback) {
  dataCallbacks.push(callback);
}

/**
 * Register a callback for port connection
 * @param {function} callback - Function to call on connection
 */
export function onConnection(callback) {
  connectionCallbacks.push(callback);
}

/**
 * Register a callback for port disconnection
 * @param {function} callback - Function to call on disconnection
 */
export function onDisconnection(callback) {
  disconnectionCallbacks.push(callback);
}

/**
 * Check if currently connected to a port
 * @returns {boolean} Connection status
 */
export function isPortConnected() {
  return isConnected;
}

/**
 * Get current connection status as a string
 * @returns {string} Status message
 */
export function getConnectionStatus() {
  return isConnected ? 'Connected' : 'Disconnected';
}