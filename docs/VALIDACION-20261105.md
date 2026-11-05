# Revalidación PWA — 2026-11-05

Base: `a4dc28ea58ad5b74211c29d12a14a1e873a4d7af`, cabeza de la PR #1.
Se conserva su base `feat/reliable-offline-shell`; no se integra automáticamente.

Linux, Node 24.19.0, Playwright 1.64.1 y Chromium 154.0.8037.57. Comandos:

```sh
npm run check
npm test
PLAYWRIGHT_MODULE=/ruta/a/playwright CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
PLAYWRIGHT_MODULE=/ruta/a/playwright CHROMIUM_PATH=/usr/bin/chromium npm run test:migration
PLAYWRIGHT_MODULE=/ruta/a/playwright CHROMIUM_PATH=/usr/bin/chromium npm run test:accessibility
PLAYWRIGHT_MODULE=/ruta/a/playwright npm run test:engines
```

Resultado: sintaxis y **29 pruebas Node** aprobadas; **4 recorridos offline**,
**4 migraciones desde v3** y **8 escenarios de accesibilidad** aprobados en
Chromium. Se comprueban raíz/subruta, dos tamaños, actualización en espera,
recuperación tras descarga fallida, tema, filtros, imágenes y conservación de
cachés ajenas. Los fallos de almacenamiento de las pruebas unitarias son dobles
explícitos y no acreditan cuota agotada en un dispositivo.

Firefox y WebKit se omitieron porque no están instalados; no cuentan como
aprobados. La selección explícita de esos motores sigue fallando si faltan.
No hay afirmación de conformidad WCAG completa, instalación PWA física ni
validación Windows/macOS/Android/iOS. La base funciona localmente sin servicios
de pago; vídeos y referencias externas requieren red.

Pendientes: revisión/integración, motores adicionales, equipos reales y
publicación. Diff revisado por el mismo agente que ejecutó las pruebas, sin
subagentes. Las evidencias históricas de `CONTINUAR.md` conservan su fecha.
