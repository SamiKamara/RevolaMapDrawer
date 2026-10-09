// The desktop HTML is never altered. This module enters the generated web HTML
// only, and the first visit remains usable when browser caching is unavailable.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(error => {
      console.warn('Offline browser cache is unavailable:', error.message);
    });
  }, { once: true });
}
