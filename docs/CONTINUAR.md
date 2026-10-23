# Primer incremento: copia local fiable

## Inventario y procedencia (2026-10-23)

- Repositorio: `Jv4793/NanoWeb`, web educativa Fernando Alonso Career Hub.
- HTML/CSS/JavaScript sin framework, proceso de compilación ni backend. Datos y fotos Base64 en `app.js` (~1,9 MB); vídeos/fuentes mediante enlaces externos.
- Manifest y service worker; `netlify.toml` publica la raíz y configura cabeceras. También existen diagnóstico multimedia, robots y sitemap.
- No se encontraron AGENTS.md ni skills en `.agents/skills` en el repositorio o sus directorios superiores accesibles. Se consultó la skill disponible `frontend-testing-debugging`.
- Estado inicial limpio, rama `work`; HEAD y remoto `main`: `a25fe2f9e27d2307110809adfceedcc7b793a562`. `git fetch origin main` y `git ls-remote --heads origin` confirmaron que no había avances remotos al comenzar. Solo se anuncia `main`.
- Único remoto: `origin`, `https://github.com/Jv4793/NanoWeb.git`. GitHub devuelve `fork: false`; no hay remoto upstream. Esto no demuestra la procedencia de todo el contenido.
- No hay LICENSE del código ni licencia declarada en GitHub. Se conservan los créditos/licencias de imagen existentes, sin ampliarlos ni asignar una licencia nueva. Revisar procedencia y permisos antes de redistribuir.
- La cuenta del conector coincide con el propietario y tiene permiso de escritura, pero GitHub declara el repositorio **público**. No satisface la instrucción de trabajo privado: esta entrega se conserva en la rama local `feat/reliable-offline-shell`, sin push, PR ni despliegue.
- GitHub indica Pages habilitado; no hay workflows versionados. No se ha verificado la conexión externa con Netlify ni sus despliegues de ramas. El conector rechazó la lectura de `/deployments` como endpoint no permitido; no hubo escritura remota ni resultado incierto que conciliar.

## Cambio y contrato offline

Antes, `app.js` desregistraba todos los workers del origen y borraba sus cachés en cada visita. El worker además intentaba red antes de caché, ignoraba fallos de instalación, eliminaba cachés ajenas y podía responder HTML a un recurso de otro tipo.

Ahora el registro es estable. El worker descarga ocho recursos locales en instalación, incluido diagnóstico; si falla alguno, no activa esa versión. La clave de caché contiene el scope completo para aislar aplicaciones y subcarpetas. Las lecturas del shell usan primero esa caché; no se almacenan respuestas arbitrarias ni recursos externos. Los parámetros de navegación no impiden abrir páginas locales guardadas.

Una navegación no guardada intenta red; sin red redirige a la página offline dentro del scope, conservando sus enlaces y estilos incluso al partir de una ruta profunda. Un recurso ausente falla como recurso, sin recibir HTML en su lugar. Se mantienen las cabeceras existentes, incluida la configuración de seguridad.

Para preparar el uso sin conexión, abrir una vez mediante HTTPS o localhost con conexión y esperar a que el service worker termine de instalarse (`navigator.serviceWorker.ready` en herramientas de desarrollo). No basta con descargar solo el HTML. Después funcionan contenido, fotos, filtros y tema; YouTube y fuentes externas necesitan conexión. No se requiere una cuenta ni un backend para consultar la copia local. No se garantiza almacenamiento permanente: borrar datos, navegación privada, cuotas o expulsión del navegador pueden exigir descargar de nuevo.

Actualizar cualquier recurso del shell requiere incrementar `v4` en `service-worker.js`. Las actualizaciones esperan al cierre de todas las pestañas controladas; después se activa la copia completa. No se fuerza `skipWaiting`. Las cachés heredadas sin scope se dejan intactas para no borrar datos ambiguos de otras rutas; las futuras versiones solo retiran cachés antiguas de su propio scope. La migración desde un navegador con la versión v3 instalada no se probó en dispositivo real.

## Validación reproducible

No había pruebas configuradas. La comprobación inicial de sintaxis de ambos JavaScript pasó. En Chromium, la primera recarga offline eliminó las cachés y la segunda falló con `net::ERR_FAILED`. Las primeras nueve pruebas de regresión sobre la versión original dieron ocho fallos y un pase.

Requisitos para pruebas unitarias: Node.js 22 o posterior; sin `npm install`, sin dependencias del proyecto:

```sh
npm run check
npm test
```

Resultado: **11/11 pasan**, cubriendo descarga incompleta, rutas raíz/subcarpeta, parámetros, cachés ajenas, fallos de recursos, aislamiento de scope y registro repetido/no disponible.

La prueba real requiere Playwright y un navegador ya instalados, provistos por el entorno de pruebas. No se añaden dependencias de ejecución ni un lockfile vacío. Si no están disponibles, la prueba falla y debe registrarse como no ejecutada; las pruebas unitarias siguen siendo utilizables.

```sh
# En este entorno: Playwright 1.62.1, Chromium del sistema.
CHROMIUM_PATH=/usr/bin/chromium SCREENSHOT_DIR=/tmp/alonso-qa npm run test:browser
```

Sin `CHROMIUM_PATH`, Playwright utiliza su Chromium instalado. `PLAYWRIGHT_MODULE` permite señalar un módulo Playwright disponible fuera del proyecto. Las variables son opcionales; en PowerShell se configuran con `$env:NOMBRE = 'valor'` antes de `npm run test:browser`.

El test arranca y cierra su propio servidor estático en `127.0.0.1` y puerto efímero. Reproduce Cache-Control, Clear-Site-Data y nosniff de la configuración actual; no publica ni conecta un servicio externo. Browser plugin no está disponible: se usó Playwright directamente, sin instalar navegadores.

Resultado: **4/4 escenarios pasan**, rutas `/` y `/NanoWeb/` a 1440×900 y 390×844, Node v24.19.0, Playwright 1.62.1, Chromium 154.0.8037.57 en Linux. Cada escenario verifica identidad, contenido no vacío, ausencia de errores JavaScript y avisos/errores de consola en el flujo principal, tres recargas offline, filtro WEC con dos entradas, fotos decodificadas, cambio de tema, ancho sin desbordamiento, marcador con parámetros, diagnóstico, fallback de ruta profunda y retorno al inicio. También verifica registro único y preservación de caché ajena. Se revisaron capturas; no se observó pantalla de error ni contenido en blanco.

Capturas de esta sesión fuera de Git: `/tmp/alonso-qa/offline-{root,subpath}-{1440,390}.png`. El test comprobó inicialmente el error de enlace en fallback profundo; tras corregirlo volvieron a pasar todos los escenarios.

No ejecutado: Safari/WebKit, Firefox, instalación PWA real, dispositivos móviles físicos, Windows/macOS nativos, actualización desde v3 ya instalada, cuota agotada y Netlify real. La simulación móvil de Chromium es una prueba de viewport, no de iOS/Android. La conservación de caché con las cabeceras actuales solo está verificada en este Chromium.

## Plataformas: evaluar por separado

| Plataforma | Camino coherente con esta entrega | Validación y límites pendientes |
| --- | --- | --- |
| Windows 11 | Navegador con service workers; comprobar instalación según navegador. Para desarrollo, servidor estático limitado a localhost. | Sin equipo Windows en esta sesión. Validar Edge/Chrome, teclado, instalación, modo avión y reapertura; no hay binario ni servicio Windows. |
| Linux | Web en navegador; copia local del shell. | Chromium Linux probado en dos tamaños y dos rutas. Distribuciones, Firefox, instalabilidad y entorno gráfico nativo pendientes; no hay paquete de escritorio. |
| macOS | Web en Safari/Chromium; evaluar web app según versión del navegador y sistema. | Sin macOS/Safari real. Validar almacenamiento, instalación y VoiceOver; no hay app macOS ni daemon. |
| iOS | Web/Safari y evaluar añadir a inicio; copia local tras descargar el shell. | Sin iPhone/iPad. Revisar iconos (manifest solo SVG), instalación, VoiceOver, expulsión de caché y modo avión. **No puede tratarse como servidor permanente**: sistema/navegador pueden suspender la ejecución. |
| Android | Web y evaluar instalación en navegador compatible; shell disponible sin red tras instalación del worker. | Sin dispositivo Android. Validar TalkBack, instalación, almacenamiento, reinicio y restricciones de segundo plano; no hay APK ni servicio persistente. |

Service workers requieren contexto seguro; `file://` no sustituye una instalación PWA. El servidor localhost de desarrollo no es una dependencia de backend del producto. La distribución inicial puede hacerse desde un alojamiento estático; la copia descargada funciona sin mantener ese alojamiento conectado. No se promete paridad de instalación, almacenamiento ni segundo plano.

Fuentes técnicas consultadas: [ciclo y caché de service workers (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers), [cuotas y expulsión de almacenamiento en WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/).

## P2P: evaluación, sin implementación arbitraria

El producto actual no tiene datos de usuario ni una función de intercambio o sincronización que justifique P2P. La consulta offline no necesita pares conectados; no se añaden puertos públicos, descubrimiento de dispositivos, STUN/TURN, servidor central ni cambio de backend.

Si se define una función concreta de intercambio en otro hito, exigir emparejamiento explícito mediante QR/código de un solo uso con caducidad y comprobación de identidad, consentimiento sobre cada transferencia, transporte cifrado y autenticado, límites de tamaño/tipo, validación del contenido recibido, cancelación y revocación. No iniciar escucha ni descubrimiento automáticamente; permitir solo sesiones iniciadas por el usuario. Una copia local debe seguir funcionando sin pares ni Internet.

Windows/Linux/macOS podrían alojar un proceso local opcional, pero habría que desarrollar empaquetado, permisos y alcance de red. En iOS no se promete servidor continuo; Android también restringe el segundo plano. WebRTC entre redes puede necesitar señalización y un relé TURN por NAT/firewalls; un relé sería opcional y explícito, con análisis de privacidad y coste. Si no hay ruta directa y no se autoriza relé, el intercambio debe fallar de forma comprensible, manteniendo la lectura offline. Ver [explicación de TURN de WebRTC](https://webrtc.org/getting-started/turn-server).

## Siguiente hito y guardado remoto

1. Resolver el destino GitHub **propio y privado**, la licencia/procedencia y comprobar que publicar una rama no inicia despliegues. No cambiar visibilidad, seguridad o credenciales como parte de esta entrega. No ejecutar push hacia el origin público.
2. Probar la copia offline y la migración desde v3 en Safari/iOS y Android reales; ofrecer un indicador accesible de «contenido listo sin conexión» solo después de confirmar la descarga, con estados de error y actualización.
3. Mejorar accesibilidad de filtros (`aria-pressed`), teclado y movimiento reducido, con verificación manual mediante lector de pantalla. Definir una función de intercambio antes de considerar P2P.

No se añadieron datos personales de usuarios ni se reutilizó la identidad personal configurada en Git para el nuevo commit. El entorno no expone metadatos verificables del modelo o nivel de razonamiento: la petición es GPT-6.1 Sol/high, sin afirmar una comprobación del backend ni haber solicitado un cambio de modelo. No se usaron subagentes.
