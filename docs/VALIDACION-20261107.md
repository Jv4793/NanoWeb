# Validación de almacenamiento denegado — 2026-11-07

Base: `main@3888b08`. La lectura o escritura de `localStorage` podía lanzar una
excepción de seguridad antes de terminar la inicialización o al cambiar el tema.
La aplicación ahora usa el tema oscuro como valor seguro, acepta únicamente los
valores persistidos conocidos y mantiene el cambio visible en memoria cuando el
navegador deniega la persistencia. El shell cambia a caché `v7` para distribuir
el JavaScript corregido sin mezclar versiones.

Entorno: Linux, Node 24.18.0, npm 11.16.0, Playwright 1.64.1 y Chromium
154.0.8037.57.

| Comprobación | Resultado |
| --- | --- |
| Sintaxis y pruebas Node | 29/29 |
| Navegador offline | 4/4; dos recorridos móviles deniegan `localStorage` realmente |
| Migración desde v3 | 4/4; actualización directa y recuperación tras fallo |
| Accesibilidad dirigida | 8/8; dos rutas, dos tamaños y dos temas |
| Firefox/WebKit | Omitidos: ejecutables no instalados |

Los recorridos conservan tres recargas offline, filtros, fotos incrustadas,
subruta, parámetros, fallback, diagnóstico, caché ajena y detección de shell
incompleto. La denegación usa una excepción `SecurityError` antes de cargar la
página y comprueba que no haya errores de página o consola y que el selector de
tema siga respondiendo.

No se ejecutaron instalación PWA física, presión de cuota real, Firefox,
WebKit, Windows, macOS, Android ni iOS. Tampoco se publicó una versión externa.
