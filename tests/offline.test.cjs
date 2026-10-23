const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

const root = resolve(__dirname, '..');
const workerSource = readFileSync(resolve(root, 'service-worker.js'), 'utf8');

function worker({ scope = 'https://example.test/NanoWeb/', installFails = false } = {}) {
  const handlers = {};
  const stores = new Map();
  const deleted = [];
  const networkRequests = [];
  let online = true;
  const cacheFor = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      addAll: async (paths) => {
        if (installFails) throw new Error('Incomplete download');
        for (const path of paths) store.set(new URL(path, scope).href, new Response(path));
      },
      match: async (request) => store.get(new URL(request.url || request, scope).href),
      put: async (request, response) => store.set(new URL(request.url || request, scope).href, response),
    };
  };
  const caches = {
    open: async (name) => cacheFor(name),
    keys: async () => [...stores.keys()],
    delete: async (name) => { deleted.push(name); return stores.delete(name); },
    match: async (request) => {
      for (const name of stores.keys()) {
        const result = await cacheFor(name).match(request);
        if (result) return result;
      }
    },
  };
  vm.runInNewContext(workerSource, {
    URL, Response, caches,
    self: {
      location: new URL('service-worker.js', scope),
      registration: { scope },
      clients: { claim: async () => {} },
      skipWaiting: () => {},
      addEventListener: (name, handler) => { handlers[name] = handler; },
    },
    fetch: async (request) => {
      networkRequests.push(request.url || request);
      if (!online) throw new Error('Offline');
      return new Response('network');
    },
  });
  async function lifecycle(name) {
    const pending = [];
    handlers[name]({ waitUntil: (promise) => pending.push(promise) });
    await Promise.all(pending);
  }
  function request(path, mode = 'cors', method = 'GET') {
    let response;
    handlers.fetch({
      request: { url: new URL(path, scope).href, mode, method },
      respondWith: (promise) => { response = promise; },
    });
    return response;
  }
  async function message(type) {
    let answer;
    const pending = [];
    handlers.message({ data: { type }, ports: [{ postMessage: (value) => { answer = value; } }],
      waitUntil: (promise) => pending.push(promise) });
    await Promise.all(pending);
    return answer;
  }
  return { lifecycle, request, message, stores, caches, deleted, networkRequests, offline: () => { online = false; } };
}

test('precache covers real local files including diagnostics', async () => {
  const app = worker();
  await app.lifecycle('install');
  const urls = [...[...app.stores.values()][0].keys()];
  assert.ok(urls.includes('https://example.test/NanoWeb/diagnostico.html'));
  for (const url of urls) {
    const relative = new URL(url).pathname.replace('/NanoWeb/', '') || 'index.html';
    assert.ok(existsSync(resolve(root, relative)), relative);
  }
});

test('failed precache rejects installation instead of activating an incomplete version', async () => {
  await assert.rejects(worker({ installFails: true }).lifecycle('install'), /Incomplete download/);
});

test('activation only deletes older caches for the exact application scope', async () => {
  const app = worker();
  await app.lifecycle('install');
  const current = [...app.stores.keys()][0];
  const prefix = current.slice(0, current.lastIndexOf(':') + 1);
  const old = `${prefix}old`;
  app.stores.set(old, new Map());
  app.stores.set('another-application', new Map());
  app.stores.set('alonso-career-hub:https://example.test/other/:v1', new Map());
  await app.lifecycle('activate');
  assert.deepEqual(app.deleted, [old]);
  assert.equal(app.stores.has(current), true);
});

test('shell is read from its own cache with no network request', async () => {
  const app = worker();
  await app.lifecycle('install');
  assert.ok(await app.request('./app.js'));
  assert.equal(app.networkRequests.length, 0);
});

test('root and subdirectory navigation with query strings work offline', async () => {
  for (const scope of ['https://example.test/', 'https://example.test/NanoWeb/']) {
    const app = worker({ scope });
    await app.lifecycle('install');
    app.offline();
    const response = await app.request('./index.html?from=bookmark', 'navigate');
    assert.ok((await response.text()).includes('index.html'));
  }
});

test('unknown navigation gets offline page only when network fails', async () => {
  const app = worker();
  await app.lifecycle('install');
  assert.equal(await (await app.request('./missing', 'navigate')).text(), 'network');
  app.offline();
  const response = await app.request('./missing', 'navigate');
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://example.test/NanoWeb/offline.html');
  assert.ok((await (await app.request('./offline.html', 'navigate')).text()).includes('offline.html'));
});

test('missing cached CSS fails as a resource instead of returning fallback HTML', async () => {
  const app = worker();
  await app.lifecycle('install');
  [...app.stores.values()][0].delete('https://example.test/NanoWeb/styles.css');
  app.offline();
  await assert.rejects(app.request('./styles.css'), /Offline/);
});

test('missing shell is not replaced with data from a foreign cache', async () => {
  const app = worker();
  await app.lifecycle('install');
  [...app.stores.values()][0].delete('https://example.test/NanoWeb/app.js');
  app.stores.set('foreign', new Map([
    ['https://example.test/NanoWeb/app.js', new Response('wrong application')],
  ]));
  app.offline();
  await assert.rejects(app.request('./app.js'), /Offline/);
});

test('POST, external requests, out-of-scope paths and unknown assets are not intercepted', () => {
  const app = worker();
  assert.equal(app.request('./index.html', 'cors', 'POST'), undefined);
  assert.equal(app.request('https://external.test/image.jpg'), undefined);
  assert.equal(app.request('../other/index.html', 'navigate'), undefined);
  assert.equal(app.request('./missing.js'), undefined);
});

test('availability is confirmed only when every shell resource has a successful cached response', async () => {
  const app = worker();
  await app.lifecycle('install');
  assert.equal((await app.message('CHECK_OFFLINE_SHELL')).complete, true);
  const store = [...app.stores.values()][0];
  store.delete('https://example.test/NanoWeb/app.js');
  assert.equal((await app.message('CHECK_OFFLINE_SHELL')).complete, false);
  store.set('https://example.test/NanoWeb/app.js', new Response('bad', { status: 500 }));
  assert.equal((await app.message('CHECK_OFFLINE_SHELL')).complete, false);
});

test('availability protocol ignores unknown commands', async () => {
  assert.equal(await worker().message('UNKNOWN_COMMAND'), undefined);
});
