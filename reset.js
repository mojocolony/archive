async function resetArchiveShell() {
  const status = document.getElementById('reset-status')
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map(registration => registration.unregister()))
    }

    if ('caches' in globalThis) {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter(key => key.startsWith('archive-shell-'))
          .map(key => caches.delete(key)),
      )
    }

    status.textContent = 'Old cache cleared. Loading the current Archive build…'
    location.replace(`./?cache-reset=${Date.now()}#/settings`)
  } catch (error) {
    status.textContent = `Could not clear the application cache: ${error instanceof Error ? error.message : String(error)}`
  }
}

resetArchiveShell()
