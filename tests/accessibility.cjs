// Comprobaciones acotadas de semántica, teclado y contraste en Chromium real.
// No es una auditoría completa WCAG ni sustituye axe o un lector de pantalla.
const assert = require('node:assert/strict');
const http = require('node:http');
const { readFile, mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const files = new Set(['index.html', 'app.js', 'styles.css', 'service-worker.js',
  'offline.html', 'diagnostico.html', 'manifest.webmanifest', 'assets/icons/icon.svg']);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

function rgb(value) {
  const match = value.match(/^rgba?\(([^)]+)\)$/);
  assert.ok(match, `Color RGB esperado: ${value}`);
  const values = match[1].split(',').map(Number);
  assert.ok(values.length === 3 || values[3] === 1, 'La comprobación requiere un fondo opaco');
  return values.slice(0, 3);
}
function luminance(channels) {
  const [r, g, b] = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(foreground, background) {
  const a = luminance(rgb(foreground));
  const b = luminance(rgb(background));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

async function checkActionContrast(page) {
  for (const selector of ['.filter-btn.active', '.button.primary', '.brand-number', '.skip-link', '.play-icon']) {
    const colors = await page.locator(selector).first().evaluate((element) => {
      const style = getComputedStyle(element);
      return { foreground: style.color, background: style.backgroundColor, gradient: style.backgroundImage };
    });
    // Gradientes actuales de dos paradas: se comprueban ambos extremos, no una
    // captura de todos los píxeles ni composición de fondos translúcidos.
    const backgrounds = colors.gradient === 'none' ? [colors.background]
      : [...colors.gradient.matchAll(/rgba?\([^)]+\)/g)].map((match) => match[0]);
    assert.ok(backgrounds.length > 0, `${selector}: fondo comprobable`);
    for (const background of backgrounds) {
      const ratio = contrast(colors.foreground, background);
      assert.ok(ratio >= 4.5, `${selector}: contraste ${ratio.toFixed(2)}:1, mínimo 4.5:1`);
    }
  }
}

async function checkNamesAndReferences(page) {
  assert.equal(await page.locator('html').getAttribute('lang'), 'es');
  assert.equal(await page.getByRole('main').count(), 1);
  assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
  const missing = await page.evaluate(() => [...document.querySelectorAll('[aria-controls], [aria-labelledby], [aria-describedby]')]
    .flatMap((element) => ['aria-controls', 'aria-labelledby', 'aria-describedby'].flatMap((name) =>
      (element.getAttribute(name) || '').split(/\s+/).filter(Boolean).filter((id) => !document.getElementById(id)))));
  assert.deepEqual(missing, [], 'referencias ARIA existentes');
  for (const role of ['button', 'link']) {
    for (const control of await page.getByRole(role).all()) {
      const snapshot = await control.ariaSnapshot();
      assert.match(snapshot, /^- (?:button|link) ".+"/, `${role} con nombre accesible`);
    }
  }
  assert.equal(await page.locator('.gallery-card img:not([alt]), .gallery-card img[alt=""]').count(), 0);
}

async function scenario(browser, route, viewport, theme) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript((savedTheme) => localStorage.setItem('theme', savedTheme), theme);
  const errors = [];
  const networkFailures = [];
  const page = await context.newPage();
  page.on('requestfailed', (request) => networkFailures.push({ url: request.url(), reason: request.failure()?.errorText }));
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) errors.push({ text: message.text(), location: message.location() });
  });
  try {
    await page.goto(`${route}index.html`);
    assert.equal(await page.title(), 'Fernando Alonso Career Hub');
    await page.waitForFunction(() => document.querySelector('#offlineStatus').dataset.state === 'ready');
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
    await checkNamesAndReferences(page);
    assert.equal(await page.locator('[data-filter="Todos"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#navToggle').getAttribute('aria-controls'), 'navLinks');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.SCREENSHOT_DIR) {
      await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR,
        `a11y-home-${new URL(route).pathname === '/' ? 'root' : 'subpath'}-${theme}-${viewport.width}.png`) });
    }

    // Primer tabulador: el enlace de salto evita recorrer toda la cabecera.
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('skip-link')), true);
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'contenido');
    if (viewport.width < 720) {
      await page.locator('#navToggle').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#navToggle').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('#navToggle').getAttribute('aria-label'), 'Cerrar menú');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Biografía');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#navToggle').getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('#navToggle').getAttribute('aria-label'), 'Abrir menú');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'navToggle');
      assert.equal(await page.locator('#navLinks').isVisible(), false);
      await page.keyboard.press('Enter');
    }
    await page.locator('#themeToggle').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme === 'dark' ? 'light' : 'dark');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
    if (viewport.width < 720) await page.keyboard.press('Escape');

    const wec = page.getByRole('button', { name: 'WEC', exact: true });
    await wec.focus();
    await page.keyboard.press('Space');
    assert.equal(await page.getByRole('button', { pressed: true }).count(), 1);
    assert.equal(await wec.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-filter="Todos"]').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('.timeline-item').count(), 2);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.filter), 'WEC');
    assert.equal(await page.locator('#timelineList').getAttribute('aria-live'), 'polite');
    const focus = await wec.evaluate((element) => {
      const style = getComputedStyle(element);
      return { visible: element.matches(':focus-visible'), width: parseFloat(style.outlineWidth), style: style.outlineStyle };
    });
    assert.equal(focus.visible, true);
    assert.ok(focus.width >= 2 && focus.style !== 'none', 'foco de teclado visible');
    await checkActionContrast(page);
    if (process.env.SCREENSHOT_DIR) {
      const label = `a11y-filter-${new URL(route).pathname === '/' ? 'root' : 'subpath'}-${theme}-${viewport.width}`;
      await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `${label}.png`) });
      await writeFile(path.join(process.env.SCREENSHOT_DIR, `${label}.txt`), await page.locator('#trayectoria').ariaSnapshot());
    }
    await context.setOffline(true);
    await page.goto(`${route}deep/missing.html`);
    assert.equal(await page.title(), 'Sin conexión · Alonso Hub');
    assert.equal(await page.locator('html').getAttribute('lang'), 'es');
    assert.equal(await page.getByRole('main').count(), 1);
    assert.equal(await page.getByRole('heading', { level: 1, name: 'Sin conexión' }).count(), 1);
    await page.getByRole('link', { name: 'Volver al inicio' }).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#offlineStatus').dataset.state === 'offline');
    assert.equal(await page.locator('.stat-card').count(), 6);
    assert.deepEqual(errors, [], JSON.stringify(networkFailures));
    console.log(`PASS accessibility ${new URL(route).pathname} ${viewport.width} ${theme}: names/ARIA, keyboard, focus, motion, action contrast, offline fallback`);
  } finally { await context.close(); }
}

async function main() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = url.pathname.replace(/^\/(?:NanoWeb\/)?/, '');
    if (!file) file = 'index.html';
    if (!files.has(file)) { res.writeHead(404).end('Not found'); return; }
    try {
      const body = await readFile(path.join(root, file));
      res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store',
        'Clear-Site-Data': '"cache"', 'X-Content-Type-Options': 'nosniff' });
      res.end(body);
    } catch { res.writeHead(500).end('Read failed'); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true,
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    for (const pathname of ['/', '/NanoWeb/']) {
      const route = `http://127.0.0.1:${server.address().port}${pathname}`;
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        for (const theme of ['dark', 'light']) await scenario(browser, route, viewport, theme);
      }
    }
    console.log(`Chromium ${browser.version()}; 8 targeted accessibility scenarios; no axe installed; no WCAG conformance claim`);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
