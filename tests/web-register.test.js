import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../web/register.js', import.meta.url), 'utf8');

class Events {
  listeners = new Map();
  addEventListener(type, listener, options) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push({ listener, once: options?.once }); this.listeners.set(type, listeners);
  }
  emit(type) {
    for (const item of [...this.listeners.get(type) ?? []]) {
      if (item.once) this.listeners.set(type, this.listeners.get(type).filter(value => value !== item));
      item.listener();
    }
  }
}

class Element {
  children = []; attributes = new Map(); hidden = false; textContent = '';
  constructor(id) { this.id = id; }
  append(child) { this.children.push(child); }
  insertBefore(child, before) {
    const index = this.children.indexOf(before);
    if (index < 0) this.append(child); else this.children.splice(index, 0, child);
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  querySelector(selector) {
    const matches = node => selector === `#${node.id}` || selector === '.status-right' && node.className === 'status-right';
    for (const child of this.children) { if (matches(child)) return child; const nested = child.querySelector(selector); if (nested) return nested; }
    return null;
  }
}

function fixture({ supported = true, controller = {}, waiting = null, installing = null, reject = false, protocol = 'https:', metadata = true } = {}) {
  const footer = new Element('footer'), status = new Element('status-message'), right = new Element('right');
  status.textContent = 'Unsaved map edit'; right.className = 'status-right'; footer.append(status); footer.append(right);
  const window = new Events(), registration = new Events(), calls = [], warnings = [], forbidden = [];
  registration.waiting = waiting; registration.installing = installing;
  const worker = {
    controller,
    register: async (...args) => { calls.push(args); if (reject) throw new Error('Unavailable'); return registration; },
  };
  const navigator = supported ? { serviceWorker: worker } : {};
  const location = { protocol, hostname: 'example.test', reload: () => forbidden.push('reload') };
  window.close = () => forbidden.push('close');
  const document = {
    querySelector: selector => selector === 'footer.statusbar' ? footer : !metadata ? null
      : selector === 'meta[name="revola-app-version"]' ? { content: '0.16.1' }
        : selector === 'meta[name="revola-build-id"]' ? { content: 'abcdef1234567890' } : null,
    createElement: () => new Element(),
  };
  vm.runInNewContext(source, { navigator, document, window, location, console: { warn: (...args) => warnings.push(args) } });
  const flush = async () => { window.emit('load'); await new Promise(resolve => setImmediate(resolve)); };
  return { footer, status, registration, calls, warnings, forbidden, flush, buildStatus: () => footer.querySelector('#web-build-status'), update: () => footer.querySelector('#web-update-status') };
}

test('running version and build are visible without service-worker support', async () => {
  const page = fixture({ supported: false }); await page.flush();
  assert.equal(page.footer.querySelector('#web-running-version').textContent, 'Version 0.16.1 · build abcdef12');
  assert.equal(page.footer.querySelector('#web-running-version').title, 'Version 0.16.1 · build abcdef1234567890');
  assert.equal(page.buildStatus().attributes.get('role'), 'status');
  assert.equal(page.buildStatus().attributes.get('aria-live'), 'polite');
  assert.equal(page.update().hidden, true); assert.deepEqual(page.calls, []);
  assert.equal(page.status.textContent, 'Unsaved map edit');
});

test('already-waiting update offers safe instructions without activating or reloading', async () => {
  const forbidden = [];
  const page = fixture({ waiting: { postMessage: () => forbidden.push('postMessage') } }); await page.flush();
  assert.equal(page.calls.length, 1); assert.equal(page.calls[0][0], '/sw.js'); assert.equal(page.calls[0][1].updateViaCache, 'none');
  assert.equal(page.update().hidden, false);
  assert.equal(page.update().textContent, 'Update available. Save your map, close all Drawer tabs, then reopen to update.');
  assert.equal(page.buildStatus().attributes.get('data-update-available'), 'true');
  assert.equal(page.status.textContent, 'Unsaved map edit'); assert.deepEqual([...page.forbidden, ...forbidden], []);
});

test('an installing update announces only when installed and an existing controller is active', async () => {
  const page = fixture(); await page.flush();
  const installer = new Events(); installer.state = 'installing';
  page.registration.installing = installer; page.registration.emit('updatefound');
  installer.emit('statechange'); assert.equal(page.update().hidden, true);
  installer.state = 'installed'; installer.emit('statechange'); assert.equal(page.update().hidden, false);
  assert.deepEqual(page.forbidden, []);
  const firstInstall = new Events(); firstInstall.state = 'installed';
  const first = fixture({ controller: null, installing: firstInstall, waiting: {} }); await first.flush();
  assert.equal(first.update().hidden, true, 'The first offline-cache installation is not an application update.');
});

test('installer found before registration resolves is also observed', async () => {
  const installer = new Events(); installer.state = 'installing';
  const page = fixture({ installing: installer }); await page.flush();
  installer.state = 'installed'; installer.emit('statechange'); assert.equal(page.update().hidden, false);
});

test('cache rejection preserves version information and the existing map status', async () => {
  const page = fixture({ reject: true }); await page.flush();
  assert.equal(page.warnings.length, 1); assert.equal(page.warnings[0][0], 'Offline browser cache is unavailable:');
  assert.equal(page.update().hidden, true); assert.equal(page.status.textContent, 'Unsaved map edit'); assert.deepEqual(page.forbidden, []);
});

test('nonsecure remote origins do not register and missing metadata does not add empty UI', async () => {
  const insecure = fixture({ protocol: 'http:' }); await insecure.flush(); assert.deepEqual(insecure.calls, []);
  const noMetadata = fixture({ metadata: false, waiting: {} }); await noMetadata.flush();
  assert.equal(noMetadata.buildStatus(), null); assert.equal(noMetadata.status.textContent, 'Unsaved map edit');
});
