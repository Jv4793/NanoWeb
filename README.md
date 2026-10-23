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
4. Si venías de una versión anterior, abre la web con `Ctrl + F5` o limpia los datos del sitio.

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

En Windows se puede usar `py -m http.server 8000 --bind 127.0.0.1`. Abrir `http://localhost:8000/`; `file://` no permite probar el service worker. Tras una primera carga completa y la instalación del worker, el contenido y las fotos quedan disponibles sin conexión. Vídeos y fuentes externas requieren Internet. Cerrar todas las pestañas de la web permite activar una actualización descargada; no es necesario borrar los datos en cada versión.

Con Node.js 22+ y sin instalar paquetes:

```sh
npm run check
npm test
```

La prueba opcional `npm run test:browser` requiere Playwright/Chromium ya disponibles. Consultar [el inventario, resultados, plataformas, límites de P2P y próximos pasos](docs/CONTINUAR.md).

No hay licencia general del código declarada. Los créditos de imagen existentes deben revisarse antes de redistribuir. El remoto actual es público; esta entrega queda local hasta disponer de un destino propio privado y comprobar sus automatismos de despliegue. `private: true` en `package.json` evita publicar un paquete npm; no modifica la visibilidad de GitHub.
