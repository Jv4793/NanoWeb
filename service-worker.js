// Cambiar la versión al modificar cualquier archivo de APP_SHELL.
const CACHE_PREFIX = `alonso-career-hub:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}v6`;
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './offline.html',
  './diagnostico.html',
  './assets/icons/icon.svg'
].map((path) => new URL(path, self.registration.scope).href);

self.addEventListener('install', (event) => {
  // Una descarga incompleta debe fallar; la versión anterior sigue disponible.
  // Sin skipWaiting: las pestañas abiertas conservan su versión hasta cerrarse.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CHECK_OFFLINE_SHELL' || !event.ports?.[0]) return;
  event.waitUntil((async () => {
    let complete = false;
    try {
      const cache = await caches.open(CACHE_NAME);
      const resources = await Promise.all(APP_SHELL.map((url) => cache.match(url)));
      complete = resources.every((response) => response?.ok);
    } catch { /* Una cuota o caché inaccesible no confirma disponibilidad. */ }
    event.ports[0].postMessage({ type: 'OFFLINE_SHELL_STATUS', complete });
  })());
});

async function respond(request) {
  const cache = await caches.open(CACHE_NAME);
  const url = new URL(request.url);
  // Los marcadores con parámetros de navegación usan la misma página local.
  if (request.mode === 'navigate') url.search = '';
  const cached = await cache.match(url.href);
  if (cached) return cached;

  try {
    return await fetch(request);
  } catch (error) {
    // Nunca devolver HTML como sustituto de una imagen, CSS o JavaScript.
    if (request.mode !== 'navigate') throw error;
    const fallbackURL = new URL('./offline.html', self.registration.scope).href;
    // La URL propia del fallback mantiene correctos sus enlaces en rutas profundas.
    return await cache.match(fallbackURL) ? Response.redirect(fallbackURL) : Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  if (request.mode !== 'navigate' && !APP_SHELL.includes(request.url)) return;
  // Solo recursos del shell; sin caché dinámica de respuestas externas o errores.
  event.respondWith(respond(request));
});
