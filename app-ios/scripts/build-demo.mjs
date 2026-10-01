// Arma demo/: el prototipo navegable para mostrar por link (Cloudflare Pages).
// Es www/ con dos agregados, sin tocar el diseño:
//   · en el celular se ve a pantalla completa, igual que la app instalada
//     (mismo recurso que usa el iPhone: native.css + escala al ancho);
//   · en la compu, el teléfono centrado sobre fondo neutro.
// Todo simulado: no se conecta a Firebase ni al Worker.
// Deploy: npm run demo:deploy
import { cp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { TERMS, PRIVACY, CONTACT } from '../src/velo/legal.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BETA = process.argv.includes('--beta');
const WWW = path.join(ROOT, 'www'), OUT = path.join(ROOT, BETA ? 'beta' : 'demo');

await rm(OUT, { recursive: true, force: true });
await cp(WWW, OUT, { recursive: true });

// Ícono y manifiesto: al "Agregar a pantalla de inicio" aparece el logo de BOOST y
// abre a pantalla completa, como una app (íconos: python scripts/make-icons.py).
await cp(path.join(ROOT, 'web-icons'), path.join(OUT, 'icons'), { recursive: true });
// El iPhone también busca el ícono en la raíz (/apple-touch-icon.png y -precomposed) y
// ahí Pages devolvía el index.html: el ícono quedaba vacío. Se copia a esas rutas también.
for (const n of ['apple-touch-icon.png', 'apple-touch-icon-precomposed.png']) await cp(path.join(ROOT, 'web-icons', 'apple-touch-icon.png'), path.join(OUT, n));
await cp(path.join(ROOT, 'web-icons', 'favicon.ico'), path.join(OUT, 'favicon.ico'));
// Versión en la URL de los íconos: iOS guarda el ícono viejo en caché y no lo vuelve a pedir.
const IV = Date.now().toString(36);
await writeFile(path.join(OUT, 'manifest.webmanifest'), JSON.stringify({
  name: 'BOOST', short_name: 'BOOST', description: 'Cada rep, medida.',
  start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait',
  background_color: '#F1EFEC', theme_color: '#F1EFEC', lang: 'es',
  icons: [
    { src: '/icons/icon-192.png?v=' + IV, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png?v=' + IV, sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-maskable-512.png?v=' + IV, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
}, null, 2));

const head = `<title>BOOST</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png?v=${IV}">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=${IV}">
<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png?v=${IV}">
<link rel="apple-touch-icon" sizes="167x167" href="/icons/apple-touch-icon-167.png?v=${IV}">
<link rel="apple-touch-icon" sizes="152x152" href="/icons/apple-touch-icon-152.png?v=${IV}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="BOOST">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="description" content="BOOST: cada rep, medida. ${BETA ? 'Beta' : 'Demo'} de la app.">
<meta property="og:title" content="BOOST">
<meta property="og:description" content="Cada rep, medida. Probá la app.">
<meta name="theme-color" content="#F1EFEC">
<meta name="robots" content="noindex">
<style>
html:not(.velo-native) body { margin: 0; min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 32px 0; box-sizing: border-box; background: #EEE9E1; }
</style>
<script>
${BETA ? '// Beta: cuentas, datos y Nova de verdad.' : `// Demo: datos de ejemplo del diseño, sin Firebase ni sensor (src/velo/firebase.js y real.js lo respetan).
window.VELO_DEMO = true;`}
(function () {
  if (!matchMedia('(max-width: 500px)').matches) return;
  var r = document.documentElement;
  r.classList.add('velo-native');
  function fit() {
    var s = window.innerWidth / 390;
    r.style.setProperty('--velo-s', String(s));
    r.style.setProperty('--velo-h', window.innerHeight / s + 'px');
  }
  fit();
  addEventListener('resize', fit);
})();
// ?debug: muestra en pantalla qué pasa con cada toque (para diagnosticar desde el iPhone).
if (/[?&]debug\\b/.test(location.search)) addEventListener('DOMContentLoaded', function () {
  var box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:6px;right:6px;top:6px;z-index:99999;margin:0;padding:8px;font:11px/1.35 ui-monospace,monospace;background:rgba(0,0,0,.82);color:#7CFC9A;border-radius:10px;pointer-events:none;white-space:pre-wrap;max-height:45vh;overflow:hidden';
  document.body.appendChild(box);
  var st = { moves: 0, prevented: 0, scrolls: {}, target: '' };
  function chain(el) { var c = []; for (var p = el; p && c.length < 8; p = p.parentElement) { var s = getComputedStyle(p); c.push((p.dataset && p.dataset.velo ? p.dataset.velo : p.tagName.toLowerCase()) + '[' + s.overflowY + ',' + s.touchAction + ',' + s.pointerEvents + (p.scrollHeight > p.clientHeight + 2 ? ',' + p.scrollHeight + '>' + p.clientHeight : '') + ']'); } return c.join(' < '); }
  function show() { box.textContent = 'toque en: ' + st.target + '\\nmovimientos: ' + st.moves + '  bloqueados: ' + st.prevented + '\\nscroll: ' + JSON.stringify(st.scrolls) + '\\n' + navigator.userAgent.slice(0, 120) + '\\nancho ' + innerWidth + ' alto ' + innerHeight; }
  addEventListener('touchstart', function (e) { st.moves = 0; st.prevented = 0; st.scrolls = {}; st.target = chain(e.target); show(); }, { passive: true, capture: true });
  addEventListener('touchmove', function (e) { st.moves++; if (e.defaultPrevented) st.prevented++; show(); }, { passive: true });
  addEventListener('scroll', function (e) { var t = e.target; var k = t === document ? 'document' : (t.tagName || '?').toLowerCase() + (t.clientHeight ? t.clientHeight : ''); st.scrolls[k] = Math.round(t.scrollTop || 0); show(); }, { passive: true, capture: true });
  show();
});
</script>
`;
const p = path.join(OUT, 'index.html');
let html = await readFile(p, 'utf8');
const css = html.match(/<link rel="stylesheet" href="velo\/native\.css[^"]*">/);
if (!css) throw new Error('www/index.html cambió de formato');
html = html.replace(css[0], head + css[0]);
await writeFile(p, html);
// app.getboost.fit tenía la PWA vieja (app/) con un service worker en /sw.js que la
// guarda en el teléfono. Este sw.js ocupa su lugar: borra esa caché, se desinstala
// y recarga, así quien la tenía abierta pasa a la app nueva.
if (BETA) await writeFile(path.join(OUT, 'sw.js'), `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
})()));
`);
// Cabeceras de seguridad (Cloudflare Pages lee _headers): nadie puede meter la app
// en un iframe de otro sitio para engañar clics, HTTPS siempre, y sin cámara/micrófono
// ni ubicación para páginas incrustadas. SAMEORIGIN y no DENY: el login de Google usa
// un iframe propio (/__/auth/iframe).
await writeFile(path.join(OUT, '_headers'), `/*
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(self), geolocation=(), payment=()
`);
// La ventana de Google (/__/auth/handler, reenviada por functions/__/auth) pide su
// config a /__/firebase/init.json, que Firebase Hosting serviría; acá lo servimos nosotros.
if (BETA) {
  const fb = await readFile(path.join(ROOT, 'src', 'velo', 'firebase.js'), 'utf8');
  const get = k => (fb.match(new RegExp(k + ": '([^']+)'")) || [])[1];
  const cfg = { apiKey: get('apiKey'), authDomain: get('authDomain'), projectId: get('projectId'), appId: get('appId') };
  if (!cfg.apiKey || !cfg.appId) throw new Error('No encontré la config de Firebase en src/velo/firebase.js');
  const dir = path.join(OUT, '__', 'firebase');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'init.json'), JSON.stringify(cfg));
}
// Términos y privacidad como páginas propias: son los links que pide la App Store
// (ficha de la app y pantalla de suscripción). Mismo texto que la app (src/velo/legal.js).
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const page = (title, secs) => `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · BOOST</title>
<link rel="icon" type="image/png" href="/icons/favicon-32.png"><meta name="robots" content="index">
<style>body{margin:0;background:#F1EFEC;color:#111;font:16px/1.6 -apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif}
main{max-width:720px;margin:0 auto;padding:40px 20px 64px}h1{font-size:34px;letter-spacing:-.03em;margin:0 0 4px}
.sub{color:#6E6A64;margin:0 0 28px}h2{font-size:18px;margin:28px 0 6px}p{margin:0}a{color:#C73A1D}
nav{display:flex;gap:16px;margin-bottom:28px;font-weight:600}</style></head><body><main>
<nav><a href="/terminos">Términos</a><a href="/privacidad">Privacidad</a></nav>
<h1>${title}</h1><p class="sub">BOOST · contacto: <a href="mailto:${CONTACT}">${CONTACT}</a></p>
${secs.map(s => `<h2>${esc(s.t)}</h2><p>${esc(s.b)}</p>`).join('\n')}
</main></body></html>`;
await writeFile(path.join(OUT, 'terminos.html'), page('Términos y condiciones', TERMS));
await writeFile(path.join(OUT, 'privacidad.html'), page('Política de privacidad', PRIVACY));
console.log((BETA ? 'beta' : 'demo') + '/ listo');
