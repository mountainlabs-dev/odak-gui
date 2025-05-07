// Error handling module for ODAK GUI

export default function initErrorHandling(elements) {
  // Display error message in the UI
  function displayError({ message, details }) {
    console.error(message, details);
    
    // Create error alert
    elements.errorMessage.innerHTML = `
      <div class="alert alert-danger alert-dismissible fade show" role="alert">
        <strong>${message}</strong>
        ${details ? `<br>${details}` : ''}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    `;

    // Auto-hide after 5 seconds
    setTimeout(() => {
      const alert = elements.errorMessage.querySelector('.alert');
      if (alert) {
        const bsAlert = new bootstrap.Alert(alert);
        bsAlert.close();
      }
    }, 5000);
  }

  return {
    displayError
  };
}