// Data Logging module for ODAK GUI

export default function initDataLogging(elements, state, callbacks) {
  const { displayError } = callbacks;
  
  // Configure logging settings
  async function configureLogging(enabled) {
    state.loggingEnabled = enabled;
    
    if (enabled && !state.logFilePath) {
      try {
        // Ask user to choose log file location
        const result = await window.api.saveFileDialog({
          title: 'Select Log File Location',
          defaultPath: `ODAK_Log_${new Date().toISOString().replace(/:/g, '-').substring(0, 19)}.txt`,
          filters: [{ name: 'Text Files', extensions: ['txt'] }]
        });
        
        if (result.canceled || !result.filePath) {
          state.loggingEnabled = false;
          elements.loggingSwitch.checked = false;
          return false;
        }
        
        state.logFilePath = result.filePath;
        return true;
      } catch (error) {
        displayError({ message: 'Error setting up logging', details: error.message });
        state.loggingEnabled = false;
        elements.loggingSwitch.checked = false;
        return false;
      }
    }
    
    return state.loggingEnabled;
  }
  
  // Setup logging event listeners
  function setupEventListeners() {
    if (elements.loggingSwitch) {
      elements.loggingSwitch.addEventListener('change', async (e) => {
        if (e.target.checked) {
          const success = await configureLogging(true);
          if (!success) {
            e.target.checked = false;
          }
        } else {
          configureLogging(false);
        }
      });
    }
  }
  
  // Return public API
  return {
    configureLogging,
    setupEventListeners
  };
}