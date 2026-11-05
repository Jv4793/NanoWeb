const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const source = readFileSync(resolve(__dirname, '../service-worker.js'), 'utf8');

// Production worker with explicit CacheStorage and event doubles; no real browser.
function fixture({ failOpen = false, failMatch = false, offline = false, cached = false } = {}) {
  const handlers = {};
  let networkCalls = 0;
  const scope = 'https://example.test/NanoWeb/';
  const cache = { async match() {
    if (failMatch) throw new Error('cache read denied');
    return cached ? new Response('owned shell') : undefined;
  } };
  vm.runInNewContext(source, {
    URL, Response,
    caches: { async open() {
      if (failOpen) throw new Error('cache open denied');
      return cache;
    } },
    self: { registration: { scope }, addEventListener: (type, handler) => { handlers[type] = handler; } },
    fetch: async () => {
      networkCalls++;
      if (offline) throw new Error('network offline');
      return new Response('usable online response');
    },
  });
  return {
    get networkCalls() { return networkCalls; },
    fetch(path = 'index.html', mode = 'navigate') {
      let response;
      handlers.fetch({ request: { url: new URL(path, scope).href, method: 'GET', mode },
        respondWith(value) { response = value; } });
      return response;
    },
    async availability() {
      let answer;
      let pending;
      handlers.message({ data: { type: 'CHECK_OFFLINE_SHELL' },
        ports: [{ postMessage(value) { answer = value; } }], waitUntil(value) { pending = value; } });
      await pending;
      return answer;
    },
  };
}

for (const failure of ['failOpen', 'failMatch']) {
  test(`${failure}: online navigation still loads`, async () => {
    const app = fixture({ [failure]: true });
    assert.equal(await (await app.fetch()).text(), 'usable online response');
    assert.equal(app.networkCalls, 1);
  });
  test(`${failure}: online static resource still loads`, async () => {
    const app = fixture({ [failure]: true });
    assert.equal(await (await app.fetch('styles.css', 'cors')).text(), 'usable online response');
    assert.equal(app.networkCalls, 1);
  });
}

test('offline navigation without usable storage returns an explicit network-error response', async () => {
  const app = fixture({ failOpen: true, offline: true });
  const response = await app.fetch();
  assert.equal(response.type, 'error');
  assert.equal(response.status, 0);
});

test('offline resource preserves network failure and never substitutes HTML', async () => {
  const app = fixture({ failMatch: true, offline: true });
  await assert.rejects(app.fetch('styles.css', 'cors'), /network offline/);
});

test('valid cached response remains usable without a network call', async () => {
  const app = fixture({ cached: true, offline: true });
  assert.equal(await (await app.fetch()).text(), 'owned shell');
  assert.equal(app.networkCalls, 0);
});

test('unavailable storage never advertises complete offline availability', async () => {
  const app = fixture({ failOpen: true });
  assert.equal((await app.availability()).complete, false);
});
