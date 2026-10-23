# Copia local fiable, indicador accesible y migración v3

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
- Al retomar desde el commit local `68aee45fc00180cbd6d20e39d1fbd60438c416bd`, se confirmó de nuevo el remoto público sin avances y la ausencia de PRs mediante el conector. No se encontraron archivos de trabajo en `shared`, `scratch` o `library-files`; se preservaron esos directorios y el commit anterior.

## Cambio y contrato offline

Antes, `app.js` desregistraba todos los workers del origen y borraba sus cachés en cada visita. El worker además intentaba red antes de caché, ignoraba fallos de instalación, eliminaba cachés ajenas y podía responder HTML a un recurso de otro tipo.

Ahora el registro es estable. El worker descarga ocho recursos locales en instalación, incluido diagnóstico; si falla alguno, no activa esa versión. La clave de caché contiene el scope completo para aislar aplicaciones y subcarpetas. Las lecturas del shell usan primero esa caché; no se almacenan respuestas arbitrarias ni recursos externos. Los parámetros de navegación no impiden abrir páginas locales guardadas.

Una navegación no guardada intenta red; sin red redirige a la página offline dentro del scope, conservando sus enlaces y estilos incluso al partir de una ruta profunda. Un recurso ausente falla como recurso, sin recibir HTML en su lugar. Se mantienen las cabeceras existentes, incluida la configuración de seguridad.

Para preparar el uso sin conexión, abrir una vez mediante HTTPS o localhost con conexión y esperar al aviso **«Disponible sin conexión»**. No basta con descargar solo el HTML ni con tener un worker activo: el aviso se confirma mediante MessageChannel, comprobando en la caché propia una respuesta correcta para cada uno de los ocho recursos del shell. Después funcionan contenido, fotos, filtros y tema; YouTube y fuentes externas necesitan conexión. No se requiere una cuenta ni un backend para consultar la copia local. No se garantiza almacenamiento permanente: borrar datos, navegación privada, cuotas o expulsión del navegador pueden exigir descargar de nuevo.

El aviso es una región `role="status"`, `aria-live="polite"`, `aria-atomic="true"`, con texto visible sin depender del color. Distingue preparación, copia comprobada, uso offline, descarga fallida, navegador no compatible y actualización descargada pendiente de activación. Se vuelve a comprobar al cambiar el controlador o la conectividad y al regresar a la página. Las respuestas tardías de una comprobación anterior no pueden sobrescribir un resultado más reciente. Una v3 sin protocolo de comprobación no recibe un falso aviso de disponibilidad: la consulta caduca en cuatro segundos.

Una instalación fallida ofrece **«Reintentar descarga»**; el botón vuelve a registrar/comprobar la actualización sin borrar la copia previa. Una caché parcial de un worker ya activo ofrece **«Comprobar actualización»**: si el script remoto es idéntico no se ejecuta otra instalación, por lo que no se promete reparar esa pérdida. Haría falta una versión nueva del shell. No se repuebla la caché activa desde la red porque podría mezclar versiones. La comprobación valida presencia y estado HTTP de las respuestas; no es una comprobación criptográfica ni una garantía contra expulsiones posteriores.

Actualizar cualquier recurso del shell requiere incrementar `v5` en `service-worker.js`. Las actualizaciones esperan al cierre de todas las pestañas controladas; después se activa la copia completa. No se fuerza `skipWaiting`. Las cachés heredadas sin scope se dejan intactas para no borrar datos ambiguos de otras rutas; las futuras versiones solo retiran cachés antiguas de su propio scope. La migración v3 se probó con su código original en Chromium; falta validarla en dispositivos físicos y otros motores.

## Validación reproducible

No había pruebas configuradas. La comprobación inicial de sintaxis de ambos JavaScript pasó. En Chromium, la primera recarga offline eliminó las cachés y la segunda falló con `net::ERR_FAILED`. Las primeras nueve pruebas de regresión sobre la versión original dieron ocho fallos y un pase.

Requisitos para pruebas unitarias: Node.js 22 o posterior; sin `npm install`, sin dependencias del proyecto:

```sh
npm run check
npm test
```

Resultado actual: **21/21 pasan**, cubriendo descarga incompleta, rutas raíz/subcarpeta, parámetros, cachés ajenas, fallos de recursos, aislamiento de scope, registro repetido/no disponible, confirmación de los ocho recursos, error de registro, tiempo de espera del protocolo v3, actualización pendiente y respuestas tardías. Los tests de estado de interfaz utilizan dobles explícitos de DOM/worker/MessageChannel; se complementan con el navegador real.

La prueba real requiere Playwright y un navegador ya instalados, provistos por el entorno de pruebas. No se añaden dependencias de ejecución ni un lockfile vacío. Si no están disponibles, la prueba falla y debe registrarse como no ejecutada; las pruebas unitarias siguen siendo utilizables.

```sh
# En este entorno: Playwright 1.62.1, Chromium del sistema.
CHROMIUM_PATH=/usr/bin/chromium SCREENSHOT_DIR=/tmp/alonso-indicator-qa npm run test:browser
CHROMIUM_PATH=/usr/bin/chromium SCREENSHOT_DIR=/tmp/alonso-migration-qa npm run test:migration
```

Sin `CHROMIUM_PATH`, Playwright utiliza su Chromium instalado. `PLAYWRIGHT_MODULE` permite señalar un módulo Playwright disponible fuera del proyecto. Las variables son opcionales; en PowerShell se configuran con `$env:NOMBRE = 'valor'` antes de `npm run test:browser`.

El test arranca y cierra su propio servidor estático en `127.0.0.1` y puerto efímero. Reproduce Cache-Control, Clear-Site-Data y nosniff de la configuración actual; no publica ni conecta un servicio externo. Browser plugin no está disponible: se usó Playwright directamente, sin instalar navegadores.

Smoke: **4/4 escenarios pasan**, rutas `/` y `/NanoWeb/` a 1440×900 y 390×844, Node v24.19.0, Playwright 1.62.1, Chromium 154.0.8037.57 en Linux. Cada escenario verifica identidad, contenido no vacío, ausencia de errores JavaScript y avisos/errores de consola en el flujo principal, tres recargas offline, filtro WEC con dos entradas, fotos decodificadas, cambio de tema, ancho sin desbordamiento, marcador con parámetros, diagnóstico, fallback de ruta profunda y retorno al inicio. También verifica registro único, preservación de caché ajena, estados ready/offline, atributos de la región accesible y detección de un recurso eliminado de CacheStorage. La comprobación por teclado de un worker sin cambios conserva el estado incompleto. Se revisaron capturas; no se observó pantalla de error ni contenido en blanco.

Migración: **4/4 escenarios pasan**, actualización directa y respuesta HTTP 503 durante la descarga, en ambas rutas. `tests/migration-v3.cjs` extrae archivos originales mediante `git show a25fe2f` (requiere ese objeto del historial), carga la aplicación original completa y confirma el registro `?version=final-v3` activo y los recursos precargados. Después sirve la versión nueva mediante un doble HTTP local; no simula las APIs de registro, CacheStorage o conectividad del navegador. Verifica el aviso de actualización descargada, la espera mientras quedan dos pestañas, activación natural tras cerrarlas, ocho recursos completos, un único registro, tema conservado en localStorage, tres recargas offline, filtros y diagnóstico. Un 503 deja la v3 activa y utilizable offline; la recuperación se hace con foco real y Enter sobre el botón de reintento. No hay errores JavaScript ni consola inesperada; solo se permiten los fallos de red deliberados descritos en el test.

Capturas actuales fuera de Git: `/tmp/alonso-indicator-qa/offline-{root,subpath}-{1440,390}.png` y `/tmp/alonso-migration-qa/migration-v3-{root,subpath}-{direct,recovery}.png`. En el primer incremento se corrigió el enlace del fallback profundo. En este incremento, la revisión independiente detectó una promesa de redescarga que un worker idéntico no puede cumplir; se corrigieron el aviso y la acción, y se verificó que no se repuebla una caché activa mezclando versiones.

No ejecutado: Safari/WebKit, Firefox, lector de pantalla real, instalación PWA como aplicación, dispositivos móviles físicos, Windows/macOS nativos, cuota agotada y Netlify real. La simulación móvil de Chromium es una prueba de viewport, no de iOS/Android. La conservación de caché con las cabeceras actuales solo está verificada en este Chromium. No hay scripts de lint/build configurados; se comprueba la sintaxis de producción y se ejecutan las suites anteriores.

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
2. Probar el indicador y la migración desde v3 en Safari/iOS y Android reales, incluyendo VoiceOver/TalkBack y condiciones de almacenamiento restringido. El indicador y la migración ya tienen cobertura Chromium.
3. Mejorar accesibilidad de filtros (`aria-pressed`), teclado y movimiento reducido, con verificación manual mediante lector de pantalla. Definir una función de intercambio antes de considerar P2P.

No se añadieron datos personales de usuarios ni se reutilizó la identidad personal configurada en Git para los commits nuevos. El entorno no expone metadatos verificables del modelo principal o nivel de razonamiento: la petición es GPT-6.1 Sol/high, sin afirmar una comprobación del backend ni haber solicitado un cambio de modelo principal. Para el segundo incremento se lanzó un subagente independiente con los parámetros observables `model: gpt-6.1-sol` y `reasoning_effort: high`, que preparó las pruebas de migración y revisó el indicador. Esos parámetros no verifican el backend ejecutado.
