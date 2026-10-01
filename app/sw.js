/* ============================================================
   sw.js — service worker.

   POR QUÉ: en un gimnasio de sótano no hay señal. La app tiene que
   abrir igual, porque no necesita internet para nada: el sensor habla
   por Bluetooth y el historial vive en el teléfono.

   Estrategia: red primero, caché como red de contención. Al revés
   (caché primero) la app quedaría congelada en una versión vieja y
   cada cambio tardaría dos recargas en aparecer — un dolor mientras
   el proyecto se está construyendo.

   Al subir una versión nueva, cambiar VERSION. El caché viejo se borra
   solo en el activate.
   ============================================================ */

const VERSION = 'boost-v7';
const SHELL = [
  './',
  'index.html',
  /* `legal.html` NO va acá. Cloudflare Pages sirve URLs limpias y responde
     308 hacia `/legal`; `cache.addAll` rechaza una respuesta redirigida y
     eso haría fallar la instalación ENTERA del service worker, dejando la
     app sin nada offline por una página que casi nadie abre. El fetch la
     cachea sola la primera vez que alguien la visita. */
  'css/app.css',
  'css/legal.css',
  'js/main.js',
  'js/protocol.js',
  'js/sensor.js',
  'js/ble.js',
  'js/sim.js',
  'js/store.js',
  'js/lv.js',
  'js/sfx.js',
  'js/icons.js',
  /* La pantalla de grabar dataset. Se usa justo donde no hay señal, así que
     tiene que estar offline como el resto. */
  'css/grabar.css',
  'js/grabar.js',
  'js/imu.js',
  /* La pantalla de ajustes: se usa en el gimnasio, donde tampoco hay señal. */
  'css/ajustes.css',
  'js/ajustes.js',
  'js/config.js',
  'js/params.js',
  /* La descarga del log: se hace en el gimnasio, al lado del sensor. */
  'css/log.css',
  'js/log.js',
  'manifest.webmanifest',
  'assets/favicon.png',
  'assets/apple-touch-icon.png',
  'assets/icon-192.png',
  'assets/dispositivo.webp',
  'assets/simbolo.png',
  /* La foto de montaje no va acá: pesa 100 KB y sólo aparece cuando el
     sensor sospecha que está torcido. El fetch la cachea la primera vez
     que se muestra, que es cuando de verdad hace falta tenerla. */
];

/* Páginas que Cloudflare Pages sirve con URL limpia: pedir `grabar.html`
   devuelve un 308 hacia `/grabar`, y `cache.addAll` rechaza una respuesta
   redirigida. Si fueran en SHELL, tumbarían la instalación entera y la app
   quedaría sin nada offline. Se guardan aparte, tolerando la falla, y bajo
   las DOS claves para que después el fetch las encuentre pida la que pida. */
const PAGINAS = ['grabar', 'ajustes', 'log', 'legal'];

async function guardarPaginas(c) {
  await Promise.all(PAGINAS.map(async (nombre) => {
    try {
      const r = await fetch(`${nombre}.html`, { redirect: 'follow' });
      if (!r.ok) return;
      await c.put(nombre, r.clone());
      await c.put(`${nombre}.html`, r);
    } catch { /* sin red al instalar: el fetch la cachea en la primera visita */ }
  }));
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL).then(() => guardarPaginas(c)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        /* Sólo se cachea lo nuestro. Las fuentes de Google vienen con
           CORS opaco y guardarlas llena el caché con respuestas que no
           se pueden inspeccionar. */
        if (res.ok && new URL(req.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
  );
});
