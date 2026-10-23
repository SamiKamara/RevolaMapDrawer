// The desktop HTML is never altered. This module enters the generated web HTML
// only, and the first visit remains usable when browser caching is unavailable.
const version = document.querySelector('meta[name="revola-app-version"]')?.content;
const build = document.querySelector('meta[name="revola-build-id"]')?.content;
let buildStatus;
if (version || build) {
  const footer = document.querySelector('footer.statusbar');
  if (footer) {
    buildStatus = document.createElement('span');
    buildStatus.id = 'web-build-status';
    buildStatus.setAttribute('role', 'status');
    buildStatus.setAttribute('aria-live', 'polite');
    buildStatus.setAttribute('aria-atomic', 'true');
    const running = document.createElement('span');
    running.id = 'web-running-version';
    running.textContent = [version && `Version ${version}`, build && `build ${build.slice(0, 8)}`].filter(Boolean).join(' · ');
    running.title = [version && `Version ${version}`, build && `build ${build}`].filter(Boolean).join(' · ');
    buildStatus.append(running);
    const update = document.createElement('span');
    update.id = 'web-update-status';
    update.hidden = true;
    update.textContent = 'Update available. Save your map, close all Drawer tabs, then reopen to update.';
    buildStatus.append(update);
    footer.insertBefore(buildStatus, footer.querySelector('.status-right'));
  }
}

function updateReady() {
  if (!buildStatus || !navigator.serviceWorker.controller) return;
  buildStatus.setAttribute('data-update-available', 'true');
  buildStatus.querySelector('#web-update-status').hidden = false;
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(registration => {
      if (registration.waiting) updateReady();
      function observeInstaller() {
        const installer = registration.installing;
        if (!installer) return;
        const installed = () => { if (installer.state === 'installed') updateReady(); };
        installer.addEventListener('statechange', installed);
        installed();
      }
      registration.addEventListener('updatefound', observeInstaller);
      observeInstaller();
    }).catch(error => {
      console.warn('Offline browser cache is unavailable:', error.message);
    });
  }, { once: true });
}
