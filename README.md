# Fernando Alonso Career Hub

Proyecto web educativo preparado para la prueba práctica de desarrollo web.

## Qué incluye

- HTML semántico.
- CSS responsive para móvil, tablet y escritorio.
- JavaScript para construir estadísticas, línea temporal, galería, vídeos y fuentes.
- Accesibilidad básica: `alt`, estructura por secciones, botón de salto al contenido y navegación clara.
- Modo claro/oscuro.
- PWA: `manifest.webmanifest`, `service-worker.js` y página offline.
- Multimedia sin rutas rotas: las fotos están incrustadas como Base64 dentro de `app.js`.
- Vídeos como enlaces externos para evitar bloqueos de iframe.
- Cabeceras básicas para Netlify.

## Cómo subir a Netlify

1. Descomprime el ZIP.
2. Comprueba que `index.html` está en la raíz de la carpeta.
3. Arrastra la carpeta completa a Netlify Drop.
4. Si había una versión anterior, cierra todas las pestañas de la web para activar la actualización descargada y comprueba el aviso de disponibilidad sin conexión.

## Fuentes usadas

- Formula1.com — Perfil de Fernando Alonso.
- Aston Martin Aramco F1 Team — Perfil oficial de Fernando Alonso.
- FIA WEC — entrada de Alonso en la Supertemporada 2018-2019.
- Toyota Gazoo Racing — Le Mans 2019.
- IMSA — Rolex 24 at Daytona 2019.
- Indianapolis Motor Speedway — estadísticas de Alonso en la Indy 500.
- Wikimedia Commons — imágenes con crédito/licencia indicada en cada tarjeta.

## Desarrollo local y pruebas

La web sigue siendo estática, sin backend ni dependencias de ejecución. Para abrirla localmente desde esta carpeta (Python 3):

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

En Windows se puede usar `py -m http.server 8000 --bind 127.0.0.1`. Abrir `http://localhost:8000/`; `file://` no permite probar el service worker. Esperar al aviso **«Disponible sin conexión»**, que comprueba los ocho recursos locales guardados. Después se pueden consultar el contenido y las fotos sin Internet; vídeos y fuentes externas requieren conexión. El aviso también distingue descarga incompleta y actualización descargada. Cerrar todas las pestañas de la web permite activar una actualización; no es necesario borrar los datos en cada versión.

Con Node.js 22+ y sin instalar paquetes:

```sh
npm run check
npm test
```

Las pruebas opcionales `npm run test:browser`, `npm run test:migration` y `npm run test:accessibility` requieren Playwright/Chromium ya disponibles. La segunda utiliza la versión v3 real conservada en el historial Git y verifica migración, fallo de descarga y recuperación por teclado. La tercera comprueba semántica, filtros, teclado, foco, movimiento reducido, contraste de controles y fallback offline en ambos temas; no constituye una auditoría completa de accesibilidad.

`npm run test:engines` intenta el smoke offline en Firefox y WebKit **solo si ya están instalados**; comunica `SKIP` si faltan. Seleccionar expresamente un motor mediante `BROWSER_ENGINE=firefox` o `webkit` hace que su ausencia sea un error, sin sustituirlo por Chromium. No se instala software. Consultar [el inventario, resultados, plataformas, límites de P2P y próximos pasos](docs/CONTINUAR.md).

No hay licencia general del código declarada. Los créditos de imagen existentes deben revisarse antes de redistribuir. El remoto actual es público; esta entrega queda local hasta disponer de un destino propio privado y comprobar sus automatismos de despliegue. `private: true` en `package.json` evita publicar un paquete npm; no modifica la visibilidad de GitHub.
