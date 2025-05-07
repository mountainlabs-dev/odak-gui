/**
 * DOM Elements module for ODAK GUI
 * Centralizes all DOM element references to avoid duplicate queries
 */

// Port management elements
export const portSelect = document.getElementById('port-select');
export const connectBtn = document.getElementById('connect-btn');
export const disconnectBtn = document.getElementById('disconnect-btn');
export const refreshPortsBtn = document.getElementById('refresh-ports-btn');
export const connectionStatus = document.getElementById('connection-status');

// CLI interface elements
export const cliInput = document.getElementById('cli-input');
export const cliSendBtn = document.getElementById('cli-send-btn');
export const cliOutput = document.getElementById('cli-output');
export const cmdBtns = document.querySelectorAll('.cmd-btn');

// Data visualization elements
export const dataContainer = document.getElementById('data-container');
export const chartCanvas = document.getElementById('chart-canvas');
export const startDataBtn = document.getElementById('start-data-btn');
export const stopDataBtn = document.getElementById('stop-data-btn');
export const exportDataBtn = document.getElementById('export-data-btn');

// Firmware update elements
export const selectFirmwareBtn = document.getElementById('select-firmware-btn');
export const updateFirmwareBtn = document.getElementById('update-firmware-btn');
export const firmwarePathDisplay = document.getElementById('firmware-path');
export const updateProgressBar = document.getElementById('update-progress');
export const updateProgressText = document.getElementById('update-progress-text');

// Status and notification elements
export const statusMessages = document.getElementById('status-messages');
export const notificationArea = document.getElementById('notification-area');

/**
 * Get all tab buttons in the UI
 * @returns {NodeList} All tab button elements
 */
export function getTabButtons() {
  return document.querySelectorAll('[data-bs-toggle="tab"]');
}

/**
 * Get a specific tab content element by ID
 * @param {string} tabId The tab content ID
 * @returns {HTMLElement} The tab content element
 */
export function getTabContent(tabId) {
  return document.getElementById(tabId);
}

/**
 * Create a notification element
 * @param {string} type The notification type: 'success', 'warning', 'error', 'info'
 * @param {string} message The notification message
 * @param {boolean} dismissible Whether the notification is dismissible
 * @returns {HTMLElement} The notification element
 */
export function createNotification(type, message, dismissible = true) {
  const alert = document.createElement('div');
  alert.className = `alert alert-${type} ${dismissible ? 'alert-dismissible' : ''} fade show`;
  alert.setAttribute('role', 'alert');
  
  alert.innerHTML = message;
  
  if (dismissible) {
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'btn-close';
    closeButton.setAttribute('data-bs-dismiss', 'alert');
    closeButton.setAttribute('aria-label', 'Close');
    alert.appendChild(closeButton);
  }
  
  return alert;
}