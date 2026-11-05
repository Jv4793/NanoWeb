// Dobles explícitos de DOM, workers y MessageChannel; no sustituyen las pruebas Chromium.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const source = readFileSync(resolve(__dirname, '../app.js'), 'utf8').replace(/init\(\);\s*$/, '');

function worker(complete = true) {
  const handlers = {};
  return {
    state: 'activated', handlers,
    addEventListener: (event, callback) => { handlers[event] = callback; },
    postMessage: (request, ports) => {
      assert.equal(request.type, 'CHECK_OFFLINE_SHELL');
      ports[0].postMessage({ type: 'OFFLINE_SHELL_STATUS', complete });
    },
  };
}

function ui({ supported = true, controller = worker(), failure = false, waiting = null } = {}) {
  const status = { dataset: {}, textContent: '' };
  const retry = { hidden: true };
  const calls = [];
  const warnings = [];
  const timers = new Map();
  let timerID = 0;
  const registration = {
    active: controller, installing: null, waiting,
    handlers: {},
    addEventListener(event, callback) { this.handlers[event] = callback; },
    update: async () => {},
  };
  const navigator = { onLine: true };
  if (supported) navigator.serviceWorker = {
    controller,
    register: async (...args) => {
      calls.push(args);
      if (failure) throw new Error('registration failed');
      return registration;
    },
  };
  class MessageChannel {
    constructor() {
      this.port1 = { onmessage: null, close() {} };
      this.port2 = {
        close() {},
        postMessage: (data) => queueMicrotask(() => this.port1.onmessage?.({ data })),
      };
    }
  }
  const context = vm.createContext({
    document: {
      querySelector: (selector) => selector === '#offlineStatus' ? status : selector === '#offlineRetry' ? retry : {},
      querySelectorAll: () => [],
    },
    navigator, MessageChannel,
    setTimeout: (callback) => { timers.set(++timerID, callback); return timerID; },
    clearTimeout: (id) => timers.delete(id),
    console: { warn: (...args) => warnings.push(args) },
  });
  vm.runInContext(source, context);
  return { status, retry, calls, warnings, registration, navigator, timers,
    run: (code) => vm.runInContext(code, context) };
}

test('ready is announced after cache confirmation, including repeated visits without deletion', async () => {
  const page = ui();
  await page.run('registerServiceWorker()');
  await page.run('registerServiceWorker()');
  assert.equal(page.status.dataset.state, 'ready');
  assert.match(page.status.textContent, /Disponible sin conexión/);
  assert.equal(page.retry.hidden, true);
  assert.equal(page.calls.length, 2);
  assert.equal(page.calls[0][0], './service-worker.js');
  assert.equal(page.warnings.length, 0);
  assert.equal(page.timers.size, 0);
});

test('first installation stays checking while there is no controlling worker', async () => {
  const page = ui({ controller: null });
  await page.run('registerServiceWorker()');
  assert.equal(page.status.dataset.state, 'checking');
  assert.doesNotMatch(page.status.textContent, /Disponible sin conexión/);
});

test('missing or unsuccessful cache responses never announce offline readiness', async () => {
  const page = ui({ controller: worker(false) });
  await page.run('registerServiceWorker()');
  assert.equal(page.status.dataset.state, 'unavailable');
  assert.match(page.status.textContent, /incompleta/);
  assert.equal(page.retry.hidden, false);
  assert.equal(page.retry.textContent, 'Comprobar actualización');
});

test('unsupported browser provides an accessible explanation without registering', async () => {
  const page = ui({ supported: false });
  await page.run('registerServiceWorker()');
  assert.equal(page.status.dataset.state, 'unsupported');
  assert.equal(page.calls.length, 0);
  assert.match(page.status.textContent, /consultar la web con conexión/);
});

test('registration failure provides recovery action', async () => {
  const page = ui({ failure: true });
  await page.run('registerServiceWorker()');
  assert.equal(page.status.dataset.state, 'error');
  assert.equal(page.retry.hidden, false);
  assert.equal(page.retry.textContent, 'Reintentar descarga');
  assert.equal(page.warnings.length, 1);
});

test('a legacy worker without the protocol times out without claiming readiness', async () => {
  const legacy = worker();
  legacy.postMessage = () => {};
  const page = ui({ controller: legacy });
  const pending = page.run('registerServiceWorker()');
  await new Promise(setImmediate);
  for (const callback of [...page.timers.values()]) callback();
  await pending;
  assert.equal(page.status.dataset.state, 'unavailable');
  assert.match(page.status.textContent, /verificar/);
  assert.equal(page.timers.size, 0);
});

test('downloaded update is announced separately from the active offline copy', async () => {
  const page = ui({ waiting: worker() });
  await page.run('registerServiceWorker()');
  assert.equal(page.status.dataset.state, 'update-ready');
  assert.match(page.status.textContent, /Cierra todas las pestañas/);
});

test('connectivity changes recheck storage before reporting offline use', async () => {
  const page = ui();
  await page.run('registerServiceWorker()');
  page.navigator.onLine = false;
  await page.run('refreshOfflineStatus()');
  assert.equal(page.status.dataset.state, 'offline');
  assert.match(page.status.textContent, /Sin conexión:/);
});

test('failed installing worker reports a failed download', async () => {
  const page = ui({ controller: null });
  const download = worker();
  download.state = 'installing';
  page.registration.installing = download;
  await page.run('registerServiceWorker()');
  download.state = 'redundant';
  download.handlers.statechange();
  assert.equal(page.status.dataset.state, 'error');
  assert.equal(page.retry.hidden, false);
});

test('a stale confirmation cannot overwrite a more recent cache failure', async () => {
  const pendingReplies = [];
  const active = worker();
  active.postMessage = (request, ports) => pendingReplies.push(ports[0]);
  const page = ui({ controller: active });
  const first = page.run('refreshOfflineStatus()');
  const second = page.run('refreshOfflineStatus()');
  pendingReplies[1].postMessage({ type: 'OFFLINE_SHELL_STATUS', complete: false });
  await second;
  pendingReplies[0].postMessage({ type: 'OFFLINE_SHELL_STATUS', complete: true });
  await first;
  assert.equal(page.status.dataset.state, 'unavailable');
});
