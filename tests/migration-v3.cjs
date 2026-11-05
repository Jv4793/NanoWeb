// Migración real en Chromium. Fixture histórica inmutable + doble HTTP local:
// no sustituye APIs de service workers, CacheStorage, registro o conectividad.
const assert = require('node:assert/strict');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { readFile, mkdir } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const legacyRevision = 'a25fe2f';
const legacyCache = 'alonso-career-hub-final-v3';
const legacyFiles = ['index.html', 'app.js', 'styles.css', 'service-worker.js',
  'offline.html', 'manifest.webmanifest', 'assets/icons/icon.svg'];
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

function shellPaths(source) {
  const declaration = source.match(/const APP_SHELL\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(declaration, 'APP_SHELL debe declarar la lista de recursos');
  return [...declaration[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

async function poll(check, label) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timeout: ${label}`);
}

async function runScenario(browser, route, failDownload, legacy, current, currentShell) {
  // Este doble solo controla las respuestas HTTP. La migración y los fallos de
  // instalación/activación se ejecutan en el navegador, con los scripts reales.
  let generation = 'legacy';
  let broken = false;
  const requests = [];
  const failureFile = 'diagnostico.html'; // Ausente del shell v3: no hay fallback cacheado.
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith(route)) { res.writeHead(404).end(); return; }
    const relative = url.pathname.slice(route.length) || 'index.html';
    const body = (generation === 'legacy' ? legacy : current).get(relative);
    const status = broken && relative === failureFile ? 503 : body ? 200 : 404;
    requests.push({ generation, path: relative, query: url.search, status });
    res.writeHead(status, {
      'Content-Type': types[path.extname(relative)] || 'text/plain',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Clear-Site-Data': '"cache"',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(status === 200 ? body : `HTTP fixture ${status}`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const base = `http://127.0.0.1:${server.address().port}${route}`;
  const legacyURL = `${base}service-worker.js?version=final-v3`;
  const currentURL = `${base}service-worker.js`;
  const label = `${route} ${failDownload ? 'fallo y recuperación' : 'migración directa'}`;
  const pageErrors = [];
  const consoleProblems = [];
  context.on('page', (page) => {
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (['warning', 'error'].includes(message.type())) consoleProblems.push(message.text());
    });
  });
  let page;
  try {
    page = await context.newPage();
    await page.goto(`${base}index.html`);
    assert.equal(await page.title(), 'Fernando Alonso Career Hub');
    assert.equal(await page.locator('.stat-card').count(), 6);
    await page.waitForFunction((url) => navigator.serviceWorker.controller?.scriptURL === url, legacyURL);
    const seeded = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const cache = await caches.open('alonso-career-hub-final-v3');
      return { active: registration.active.state, url: registration.active.scriptURL,
        names: await caches.keys(), entries: (await cache.keys()).map((request) => request.url) };
    });
    assert.equal(seeded.active, 'activated');
    assert.equal(seeded.url, legacyURL);
    assert.ok(seeded.names.includes(legacyCache));
    for (const resource of shellPaths(legacy.get('service-worker.js').toString())) {
      assert.ok(seeded.entries.includes(new URL(resource, base).href), `v3 precargó ${resource}`);
    }
    assert.ok(requests.some((request) => request.path === 'service-worker.js'
      && request.query === '?version=final-v3' && request.generation === 'legacy'));
    await page.locator('#themeToggle').click();
    const savedTheme = await page.locator('html').getAttribute('data-theme');
    assert.equal(await page.evaluate(() => localStorage.getItem('theme')), savedTheme);

    generation = 'current';
    broken = failDownload;
    await page.reload({ waitUntil: 'load' });

    if (failDownload) {
      // Esperar el 503 y el fin del worker installing prueba el rechazo real.
      await poll(async () => requests.some((request) => request.generation === 'current'
        && request.path === failureFile && request.status === 503), 'descarga 503 del nuevo shell');
      await page.waitForFunction(async (url) => {
        const registration = await navigator.serviceWorker.getRegistration();
        return registration.active?.scriptURL === url && !registration.installing && !registration.waiting;
      }, legacyURL);
      await page.waitForFunction(() => ['error', 'unavailable'].includes(
        document.querySelector('#offlineStatus').dataset.state));
      const failed = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return { active: registration.active.scriptURL, state: registration.active.state,
          cache: await caches.has('alonso-career-hub-final-v3'),
          html: Boolean(await (await caches.open('alonso-career-hub-final-v3')).match('./index.html')) };
      });
      assert.deepEqual(failed, { active: legacyURL, state: 'activated', cache: true, html: true });
      // Red realmente desconectada: la última copia v3 todavía abre contenido.
      await context.setOffline(true);
      await page.reload({ waitUntil: 'load' });
      assert.equal(await page.locator('.stat-card').count(), 6);
      await page.locator('[data-filter="WEC"]').click();
      assert.equal(await page.locator('.timeline-item').count(), 2);
      assert.equal(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL), legacyURL);
      await context.setOffline(false);
      broken = false;
      // Recuperación por el control real de la aplicación, sin mensajes de
      // skipWaiting ni sustitución de registro, caché o comprobación del shell.
      await page.locator('#offlineRetry').focus();
      assert.equal(await page.locator('#offlineRetry').evaluate((button) =>
        button === document.activeElement), true);
      await page.keyboard.press('Enter');
    }

    await page.waitForFunction((url) => navigator.serviceWorker.getRegistration().then((registration) =>
      registration.waiting?.scriptURL === url && registration.waiting.state === 'installed'), currentURL);
    await page.waitForFunction(() => document.querySelector('#offlineStatus').dataset.state === 'update-ready');
    assert.equal(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL), legacyURL);
    assert.equal(await page.locator('html').getAttribute('data-theme'), savedTheme);
    const secondPage = await context.newPage();
    await secondPage.goto(`${base}index.html`);
    assert.equal(await secondPage.evaluate(() => navigator.serviceWorker.controller.scriptURL), legacyURL);
    await page.close();
    assert.equal(await secondPage.evaluate(() => navigator.serviceWorker.controller.scriptURL), legacyURL,
      'cerrar una pestaña no activa el reemplazo mientras queda otra controlada');
    await secondPage.close();
    assert.equal(context.pages().length, 0);

    // Sin clientes controlados, Chromium activa el worker pendiente por sí mismo.
    await poll(async () => {
      const worker = context.serviceWorkers().find((candidate) => candidate.url() === currentURL);
      if (!worker) return false;
      return worker.evaluate(() => self.registration.active?.scriptURL === self.location.href
        && self.registration.active.state === 'activated').catch(() => false);
    }, 'activación natural tras cerrar todas las pestañas');

    page = await context.newPage();
    await page.goto(`${base}index.html`);
    await page.waitForFunction((url) => navigator.serviceWorker.controller?.scriptURL === url, currentURL);
    await page.waitForFunction(() => document.querySelector('#offlineStatus').dataset.state === 'ready');
    const installed = await page.evaluate(async (prefix) => {
      const names = (await caches.keys()).filter((name) => name.startsWith(prefix));
      const entries = [];
      for (const name of names) {
        entries.push(...(await (await caches.open(name)).keys()).map((request) => request.url));
      }
      return { names, entries, scope: (await navigator.serviceWorker.getRegistration()).scope,
        registrations: (await navigator.serviceWorker.getRegistrations()).length };
    }, `alonso-career-hub:${base}:`);
    assert.equal(installed.scope, base);
    assert.equal(installed.registrations, 1);
    assert.equal(installed.names.length, 1, 'una caché actual para este scope');
    assert.deepEqual(installed.entries.sort(), currentShell.map((resource) => new URL(resource, base).href).sort(),
      'todos los recursos del shell actual descargados');
    assert.equal(await page.locator('html').getAttribute('data-theme'), savedTheme);
    await context.setOffline(true);
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => document.querySelector('#offlineStatus').dataset.state === 'offline');
      assert.equal(await page.title(), 'Fernando Alonso Career Hub');
      assert.equal(await page.locator('.stat-card').count(), 6);
      assert.ok((await page.locator('main').innerText()).includes('Resumen de palmarés'));
      await page.locator('[data-filter="WEC"]').click();
      assert.equal(await page.locator('.timeline-item').count(), 2);
      assert.ok((await page.locator('#timelineList').innerText()).includes('Le Mans'));
      assert.equal(await page.locator('html').getAttribute('data-theme'), savedTheme);
      assert.equal(await page.evaluate(() => localStorage.getItem('theme')), savedTheme);
    }
    await page.goto(`${base}diagnostico.html`);
    assert.equal(await page.title(), 'Diagnóstico multimedia');
    assert.deepEqual(pageErrors, [], 'sin errores JavaScript en el flujo');
    // Chromium puede informar de su comprobación de actualización durante el
    // modo avión. El escenario 503 provoca además el rechazo de instalación.
    const expectedOfflineFailure = /^Failed to load resource: net::ERR_INTERNET_DISCONNECTED$|^An unknown error occurred when fetching the script\.$/;
    const expectedDownloadFailure = /503|No se pudo registrar el Service Worker:/;
    assert.deepEqual(consoleProblems.filter((message) => !expectedOfflineFailure.test(message)
      && !(failDownload && expectedDownloadFailure.test(message))), [], 'consola sin errores inesperados');
    if (process.env.SCREENSHOT_DIR) {
      await page.goto(`${base}index.html`);
      await page.locator('[data-filter="WEC"]').click();
      await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR,
        `migration-v3-${route === '/' ? 'root' : 'subpath'}-${failDownload ? 'recovery' : 'direct'}.png`) });
    }
    console.log(`PASS ${label}: v3 real activo, actualización en espera, cierre de dos pestañas, shell completo, tema conservado, 3 recargas y filtros offline`);
  } catch (error) {
    error.message = `${label}: ${error.message}`;
    throw error;
  } finally {
    await context.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  const legacy = new Map(legacyFiles.map((file) => [file,
    execFileSync('git', ['show', `${legacyRevision}:${file}`], { cwd: root, maxBuffer: 8 * 1024 * 1024 })]));
  assert.ok(legacy.get('service-worker.js').toString().includes(`'${legacyCache}'`));
  assert.ok(legacy.get('app.js').toString().includes("'./service-worker.js?version=final-v3'"));
  const workerSource = await readFile(path.join(root, 'service-worker.js'), 'utf8');
  const currentShell = shellPaths(workerSource);
  const currentFiles = new Set(['service-worker.js', ...currentShell.map((resource) =>
    resource.replace(/^\.\//, '') || 'index.html')]);
  const current = new Map(await Promise.all([...currentFiles].map(async (file) =>
    [file, await readFile(path.join(root, file))])));
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    for (const route of ['/', '/NanoWeb/']) {
      for (const failDownload of [false, true]) {
        await runScenario(browser, route, failDownload, legacy, current, currentShell);
      }
    }
    console.log(`Chromium ${browser.version()}; Browser plugin not available; Playwright fallback; fixture git ${legacyRevision}; doble HTTP solo loopback; sin APIs simuladas`);
  } finally { await browser.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
