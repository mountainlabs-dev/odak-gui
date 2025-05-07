/**
 * CLI Interface module for ODAK GUI
 * Handles command line interface functions including sending commands and processing responses
 */

import * as elements from './dom-elements.js';
import { isPortConnected } from './port-management.js';

// Command history state
let commandHistory = [];
let commandIndex = -1;

/**
 * Initialize CLI interface functionality
 */
export function initCliInterface() {
  // Setup event listeners
  elements.cliSendBtn.addEventListener('click', sendCommand);
  elements.cliInput.addEventListener('keydown', handleCliInputKeydown);
  elements.clearConsoleBtn.addEventListener('click', clearOutput);
  
  // Setup command button listeners
  elements.cmdBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd;
      const immediate = btn.dataset.immediate === 'true';
      
      elements.cliInput.value = cmd;
      
      if (immediate) {
        // Send immediately for commands that don't require values
        sendCommand();
      }
    });
  });
}

/**
 * Send the command from the CLI input
 */
export function sendCommand() {
  const command = elements.cliInput.value.trim();
  
  if (!command) return;
  
  if (!isPortConnected()) {
    // Emit error event if not connected
    const event = new CustomEvent('errorOccurred', { 
      detail: { message: 'Not connected to device', details: 'Please connect to a device first' } 
    });
    document.dispatchEvent(event);
    return;
  }
  
  // Add command to history and reset index
  if (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== command) {
    commandHistory.push(command);
    // Limit history size
    if (commandHistory.length > 50) {
      commandHistory.shift();
    }
  }
  commandIndex = commandHistory.length;
  
  // Add command to output with user prompt
  appendToOutput(`<span class="user-input">$ ${command}</span>`);
  
  // Send the command via the API
  window.api.sendCommand(command);
  
  // Clear the input for next command
  elements.cliInput.value = '';
}

/**
 * Handle keydown events in the CLI input
 * @param {KeyboardEvent} event - The keyboard event
 */
export function handleCliInputKeydown(event) {
  if (event.key === 'Enter') {
    sendCommand();
    event.preventDefault();
  } else if (event.key === 'ArrowUp') {
    // Navigate backwards in command history
    if (commandHistory.length > 0 && commandIndex > 0) {
      commandIndex--;
      elements.cliInput.value = commandHistory[commandIndex];
      
      // Move cursor to end of input
      setTimeout(() => {
        elements.cliInput.selectionStart = elements.cliInput.selectionEnd = elements.cliInput.value.length;
      }, 0);
    }
    event.preventDefault();
  } else if (event.key === 'ArrowDown') {
    // Navigate forwards in command history
    if (commandIndex < commandHistory.length - 1) {
      commandIndex++;
      elements.cliInput.value = commandHistory[commandIndex];
    } else if (commandIndex === commandHistory.length - 1) {
      commandIndex = commandHistory.length;
      elements.cliInput.value = '';
    }
    event.preventDefault();
  }
}

/**
 * Process incoming data from the serial port
 * @param {string} data - The received data
 */
export function processCliData(data) {
  // Format the response and add to output
  const formattedData = formatCliResponse(data);
  appendToOutput(formattedData);
  
  // Emit an event with the processed data
  const event = new CustomEvent('cliDataReceived', { 
    detail: { rawData: data, formattedData } 
  });
  document.dispatchEvent(event);
}

/**
 * Format CLI response for display
 * @param {string} data - The raw data to format
 * @returns {string} - The formatted HTML string
 */
function formatCliResponse(data) {
  // Sanitize the input to prevent XSS
  const sanitized = data
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  
  // Replace newlines with <br> for HTML display
  const withLineBreaks = sanitized.replace(/\n/g, '<br>');
  
  // Apply styling to certain patterns (e.g. error messages, warnings)
  let formatted = withLineBreaks
    .replace(/error|fail|invalid/gi, match => `<span class="cli-error">${match}</span>`)
    .replace(/warning/gi, match => `<span class="cli-warning">${match}</span>`)
    .replace(/success|ok/gi, match => `<span class="cli-success">${match}</span>`);
  
  return `<div class="cli-response">${formatted}</div>`;
}

/**
 * Append content to the CLI output
 * @param {string} content - HTML content to append
 */
export function appendToOutput(content) {
  // Append the content to the output area
  elements.cliOutput.innerHTML += content;
  
  // Auto-scroll to the bottom
  elements.cliOutput.scrollTop = elements.cliOutput.scrollHeight;
}

/**
 * Clear the CLI output
 */
export function clearOutput() {
  elements.cliOutput.innerHTML = '';
}

/**
 * Get the current command history
 * @returns {string[]} - Array of command history
 */
export function getCommandHistory() {
  return [...commandHistory];
}