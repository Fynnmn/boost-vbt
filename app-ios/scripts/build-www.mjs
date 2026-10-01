// Arma www/ a partir de design/ SIN modificar el diseño.
// Solo agrega: viewport para iPhone, la capa nativa (velo/) y React local (sin internet).
import { cp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...a) => path.join(ROOT, ...a);
const exists = p => access(p).then(() => true, () => false);

await rm(P('www'), { recursive: true, force: true });
await mkdir(P('www', 'vendor'), { recursive: true });
await mkdir(P('www', 'velo'), { recursive: true });

await cp(P('design', 'support.js'), P('www', 'support.js'));
await cp(P('design', 'NovaBot.dc.html'), P('www', 'NovaBot.dc.html')); // personaje de Nova (lo importa VELOPhone)
await cp(P('design', 'assets'), P('www', 'assets'), { recursive: true });

// React: support.js lo pide a unpkg; lo bajamos una vez y lo servimos local.
const support = await readFile(P('design', 'support.js'), 'utf8');
const urls = [...support.matchAll(/var (REACT_URL|REACT_DOM_URL) = "([^"]+)"/g)].map(m => m[2]);
if (urls.length !== 2) throw new Error('No encontré las URLs de React en support.js');
const resources = {};
await mkdir(P('.cache'), { recursive: true });
for (const url of urls) {
  const name = path.basename(new URL(url).pathname);
  const cached = P('.cache', name);
  if (!(await exists(cached))) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('No pude bajar ' + url);
    await writeFile(cached, Buffer.from(await r.arrayBuffer()));
  }
  await cp(cached, P('www', 'vendor', name));
  resources[url] = 'vendor/' + name;
}

await build({
  entryPoints: [P('src', 'velo', 'index.js')],
  bundle: true, format: 'iife', target: 'safari16', minify: true,
  outfile: P('www', 'velo', 'velo.js')
});
await cp(P('src', 'velo', 'native.css'), P('www', 'velo', 'native.css'));

let html = await readFile(P('design', 'VELOPhone.dc.html'), 'utf8');
html = html.replace(
  /<meta name="viewport"[^>]*>/,
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">'
);
// Versión real al pie de Perfil (el diseño trae "BOOST 1.0.0 (1)" fijo).
const pkg = JSON.parse(await readFile(P('package.json'), 'utf8'));
// Con el commit: una captura dice qué código la produjo (también en window.VELO_BUILD y
// en la consola). '+' = había cambios sin commitear al armarlo.
let commit = 'sin-git';
try {
  const { execSync } = await import('node:child_process');
  const git = c => execSync('git ' + c, { cwd: ROOT }).toString().trim();
  commit = git('rev-parse --short HEAD') + (git('status --porcelain -- src design scripts backend/worker/src') ? '+' : '');
} catch {}
const BUILD = { version: pkg.version, commit, at: new Date().toISOString().slice(0, 16).replace('T', ' ') };
html = html.replace(/BOOST \d+\.\d+\.\d+ \(\d+\)/, 'BOOST ' + pkg.version + ' · ' + commit);
// En iPhone la tipografía es Helvetica Neue (primera de la lista); Inter nunca se usa.
html = html.replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, '');
// ?v= cambia en cada build: la web cachea css/js 4 h y el teléfono se quedaba con la versión vieja.
const V = Date.now().toString(36);
const inject =
  '<link rel="stylesheet" href="velo/native.css?v=' + V + '">\n' +
  '<script>window.__resources=' + JSON.stringify(resources) + ';window.VELO_BUILD=' + JSON.stringify(BUILD) + ';console.info("BOOST", window.VELO_BUILD);</script>\n' +
  '<script src="velo/velo.js?v=' + V + '"></script>\n';
if (!html.includes('<script src="./support.js"></script>')) throw new Error('design/VELOPhone.dc.html cambió de formato');
html = html.replace('<script src="./support.js"></script>', inject + '<script src="./support.js"></script>');
await writeFile(P('www', 'index.html'), html);
console.log('www/ listo');
