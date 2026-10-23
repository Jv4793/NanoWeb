// Motores alternativos opcionales: solo ejecutables de Playwright ya instalados.
const { accessSync, constants, statSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const requested = process.env.BROWSER_ENGINE;
if (requested !== undefined && !['chromium', 'firefox', 'webkit'].includes(requested)) {
  console.error(`Unsupported BROWSER_ENGINE: ${requested}`);
  process.exitCode = 1;
} else if (process.env.BROWSER_EXECUTABLE_PATH !== undefined && requested === undefined) {
  console.error('BROWSER_EXECUTABLE_PATH requires an explicit BROWSER_ENGINE in this runner.');
  process.exitCode = 1;
} else {
  const engines = requested === undefined ? ['firefox', 'webkit'] : [requested];
  const passed = [];
  const skipped = [];
  const failed = [];
  for (const engine of engines) {
    const explicitPath = process.env.BROWSER_EXECUTABLE_PATH
      ?? (engine === 'chromium' ? process.env.CHROMIUM_PATH : undefined);
    const executablePath = explicitPath ?? playwright[engine].executablePath();
    let unavailable;
    try {
      if (!executablePath || !statSync(executablePath).isFile()) throw new Error('not a regular file');
      accessSync(executablePath, constants.X_OK);
    } catch (error) { unavailable = error.message; }
    if (unavailable) {
      // Una selección explícita debe fallar; nunca sustituirla por Chromium.
      if (requested !== undefined || explicitPath !== undefined) {
        console.error(`FAIL ${engine}: executable unavailable at ${executablePath}: ${unavailable}`);
        failed.push(engine);
      } else {
        console.log(`SKIP ${engine}: Playwright executable not installed or executable at ${executablePath}: ${unavailable}`);
        skipped.push(engine);
      }
      continue;
    }
    console.log(`RUN ${engine}: ${executablePath}`);
    const result = spawnSync(process.execPath, [path.join(__dirname, 'browser-offline.cjs')], {
      env: { ...process.env, BROWSER_ENGINE: engine, BROWSER_EXECUTABLE_PATH: executablePath },
      stdio: 'inherit',
    });
    if (result.error || result.status !== 0) {
      console.error(`FAIL ${engine}: ${result.error?.message || `test exited ${result.status}, signal ${result.signal || 'none'}`}`);
      failed.push(engine);
    } else {
      passed.push(engine);
    }
  }
  console.log(`Offline engines: tested=${passed.join(', ') || 'none'}; skipped=${skipped.join(', ') || 'none'}; failed=${failed.join(', ') || 'none'}`);
  if (!passed.length && !failed.length) console.log('SKIP: no alternative browser engine is installed; no alternative engine was tested.');
  if (failed.length) process.exitCode = 1;
}
