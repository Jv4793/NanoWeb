// Smoke real opcional: usa Playwright ya disponible; no instala dependencias.
const assert = require('node:assert/strict');
const http = require('node:http');
const { readFile, mkdir } = require('node:fs/promises');
const { accessSync, constants, statSync } = require('node:fs');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const files = new Set(['index.html', 'app.js', 'styles.css', 'service-worker.js',
  'offline.html', 'diagnostico.html', 'manifest.webmanifest', 'assets/icons/icon.svg']);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

async function main() {
  const engine = process.env.BROWSER_ENGINE ?? 'chromium';
  assert.ok(['chromium', 'firefox', 'webkit'].includes(engine), `Unsupported BROWSER_ENGINE: ${engine}`);
  const executablePath = process.env.BROWSER_EXECUTABLE_PATH
    ?? (engine === 'chromium' ? process.env.CHROMIUM_PATH : undefined);
  if (executablePath !== undefined) {
    assert.ok(executablePath && statSync(executablePath).isFile(), `Browser executable is not a file: ${executablePath}`);
    accessSync(executablePath, constants.X_OK);
  }
  // Reproduce las cabeceras comunes existentes en Netlify sin publicar la web.
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = url.pathname.replace(/^\/(?:NanoWeb\/)?/, '');
    if (!file) file = 'index.html';
    if (!files.has(file)) { res.writeHead(404); res.end('Not found'); return; }
    try {
      const body = await readFile(path.join(root, file));
      res.writeHead(200, {
        'Content-Type': types[path.extname(file)],
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Clear-Site-Data': '"cache"',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(body);
    } catch { res.writeHead(500); res.end('Read failed'); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await playwright[engine].launch({
      ...(executablePath !== undefined ? { executablePath } : {}),
      headless: true,
    });
    console.log(`${engine} ${browser.version()}; Browser plugin not available; Playwright fallback; loopback-only test server`);
    for (const route of ['/', '/NanoWeb/']) {
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        const context = await browser.newContext({ viewport });
        try {
          const errors = [];
          const page = await context.newPage();
          page.on('pageerror', (error) => errors.push(error.message));
          page.on('console', (message) => {
            if (['error', 'warning'].includes(message.type())) errors.push(message.text());
          });
          const base = `http://127.0.0.1:${server.address().port}${route}`;
          await page.goto(`${base}index.html`);
          assert.equal(await page.title(), 'Fernando Alonso Career Hub');
          assert.equal(await page.locator('.stat-card').count(), 6);
          assert.ok((await page.locator('main').innerText()).includes('Resumen de palmarés'));
          await page.evaluate(async () => { await navigator.serviceWorker.ready; });
          await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
          await page.waitForFunction(() => document.querySelector('#offlineStatus').dataset.state === 'ready');
          assert.equal(await page.locator('#offlineStatus').getAttribute('role'), 'status');
          assert.equal(await page.locator('#offlineStatus').getAttribute('aria-live'), 'polite');
          assert.equal(await page.locator('#offlineStatus').getAttribute('aria-atomic'), 'true');
          await page.evaluate(async () => {
            const foreign = await caches.open('unrelated-app');
            await foreign.put('./unrelated.txt', new Response('keep'));
          });
          await context.setOffline(true);
          for (let attempt = 0; attempt < 3; attempt++) {
            await page.reload({ waitUntil: 'load' });
            await page.waitForFunction(() => document.querySelector('#offlineStatus').dataset.state === 'offline');
            assert.equal(await page.locator('.stat-card').count(), 6);
            await page.locator('[data-filter="WEC"]').click();
            assert.equal(await page.locator('.timeline-item').count(), 2);
            assert.ok((await page.locator('#timelineList').innerText()).includes('Le Mans'));
          }
          await page.goto(`${base}index.html?from=bookmark`);
          assert.equal(await page.locator('.stat-card').count(), 6);
          await page.locator('#multimedia').scrollIntoViewIfNeeded();
          await page.waitForFunction(() => [...document.querySelectorAll('.gallery-card img')]
            .every((image) => image.complete && image.naturalWidth > 0));
          if (viewport.width < 720) await page.locator('#navToggle').click();
          const before = await page.locator('html').getAttribute('data-theme');
          await page.locator('#themeToggle').click();
          assert.notEqual(await page.locator('html').getAttribute('data-theme'), before);
          if (viewport.width < 720) await page.locator('#navToggle').click();
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          if (process.env.SCREENSHOT_DIR) {
            await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
            await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR,
              `offline-${route === '/' ? 'root' : 'subpath'}-${viewport.width}.png`) });
          }
          assert.deepEqual(errors, []);
          await page.goto(`${base}diagnostico.html`);
          assert.equal(await page.title(), 'Diagnóstico multimedia');
          await page.goto(`${base}deep/missing.html`);
          assert.equal(await page.locator('h1').innerText(), 'Sin conexión');
          assert.equal(new URL(await page.locator('a').getAttribute('href'), page.url()).href, `${base}index.html`);
          await page.getByRole('link', { name: 'Volver al inicio' }).click();
          assert.equal(await page.locator('.stat-card').count(), 6);
          assert.ok(await page.evaluate(async () => (await caches.keys()).includes('unrelated-app')));
          assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 1);
          // Expulsión parcial de caché real: no anunciar una copia completa por tener solo un worker activo.
          await page.evaluate(async () => {
            const scope = (await navigator.serviceWorker.getRegistration()).scope;
            const name = (await caches.keys()).find((entry) => entry.startsWith(`alonso-career-hub:${scope}:`));
            await (await caches.open(name)).delete(new URL('./app.js', scope));
          });
          await context.setOffline(false);
          await page.waitForFunction(() => document.querySelector('#offlineStatus').dataset.state === 'unavailable');
          assert.equal(await page.locator('#offlineRetry').isVisible(), true);
          assert.equal(await page.locator('#offlineRetry').innerText(), 'Comprobar actualización');
          await page.locator('#offlineRetry').focus();
          await page.keyboard.press('Enter');
          await page.waitForFunction(() => document.querySelector('#offlineStatus').dataset.state === 'unavailable');
          assert.match(await page.locator('#offlineStatus').innerText(), /incompleta/);
          console.log(`PASS ${route} ${viewport.width}x${viewport.height}: accessible readiness, 3 offline reloads, filters, photos, theme, query, diagnostics, fallback, cache preservation, incomplete-copy detection`);
        } finally { await context.close(); }
      }
    }
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
