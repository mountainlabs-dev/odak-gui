// Firmware Update module for ODAK GUI

export default function initFirmwareUpdate(elements, callbacks) {
  const { displayError, sendCommand } = callbacks;
  
  // Handle firmware update process
  async function handleFirmwareUpdate() {
    try {
      // Ask user to select firmware file
      const result = await window.api.openFileDialog({
        title: 'Select Firmware File',
        filters: [
          { name: 'Firmware Files', extensions: ['bin'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });
      
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return;
      }
      
      const firmwarePath = result.filePaths[0];
      
      // Show updating UI
      if (elements.updateFirmwareBtn) elements.updateFirmwareBtn.disabled = true;
      if (elements.updateProgress) {
        elements.updateProgress.style.display = 'block';
        elements.updateProgress.value = 0;
      }
      
      // Start firmware update process
      await sendCommand('update_firmware', { path: firmwarePath });
      
      // Update progresses in response to events from main process
      
    } catch (error) {
      displayError({ message: 'Firmware update error', details: error.message });
      
      // Reset UI
      if (elements.updateFirmwareBtn) elements.updateFirmwareBtn.disabled = false;
      if (elements.updateProgress) elements.updateProgress.style.display = 'none';
    }
  }
  
  // Update progress bar
  function updateProgress(percentage) {
    if (elements.updateProgress) {
      elements.updateProgress.value = percentage;
    }
  }
  
  // Handle firmware update completion
  function handleUpdateComplete(success) {
    // Reset UI
    if (elements.updateFirmwareBtn) elements.updateFirmwareBtn.disabled = false;
    if (elements.updateProgress) elements.updateProgress.style.display = 'none';
    
    // Show success/failure message
    if (success) {
      alert('Firmware update completed successfully!');
    } else {
      displayError({ message: 'Firmware update failed', details: 'Unable to complete firmware update process.' });
    }
  }
  
  // Setup event listeners
  function setupEventListeners() {
    if (elements.updateFirmwareBtn) {
      elements.updateFirmwareBtn.addEventListener('click', handleFirmwareUpdate);
    }
  }
  
  // Return public API
  return {
    handleFirmwareUpdate,
    updateProgress,
    handleUpdateComplete,
    setupEventListeners
  };
}