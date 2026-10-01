// Pone en marcha la nube de BOOST con un comando (después de `npx firebase login`).
//   node scripts/setup.mjs            → Firebase: proyecto, app web, Firestore, reglas
//   node scripts/setup.mjs --worker   → además: KV de Nova y deploy del Worker
// Es idempotente: si algo ya existe, lo usa y sigue.
// Lo que NO hace (lo hacés vos en la consola, el script te dice dónde):
//   activar los métodos de ingreso y bajar la clave de la cuenta de servicio.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BACK = path.resolve(import.meta.dirname, '..');
const APP = path.resolve(BACK, '..');
const WORKER = path.join(BACK, 'worker');
const PROJECT = process.env.BOOST_PROJECT || 'boost-vbt-app';
const LOCATION = 'southamerica-east1'; // São Paulo, lo más cerca de Uruguay
const withWorker = process.argv.includes('--worker');

const fb = (args, { json = true, ok = false } = {}) => {
  const r = spawnSync(process.execPath, [path.join(BACK, 'scripts', 'emu.mjs'), ...args, ...(json ? ['--json'] : [])], { cwd: BACK, encoding: 'utf8' });
  const out = (r.stdout || '').trim();
  if (json) {
    const start = out.indexOf('{');
    try { const j = JSON.parse(out.slice(start)); if (j.status === 'success') return j.result; if (ok) return null; throw new Error(j.error || out); } catch (e) { if (ok) return null; throw new Error('firebase ' + args.join(' ') + '\n' + out + '\n' + (r.stderr || '')); }
  }
  if (r.status !== 0 && !ok) throw new Error('firebase ' + args.join(' ') + '\n' + out + '\n' + r.stderr);
  return out;
};
const wr = args => {
  const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', ...args], { cwd: WORKER, encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error('wrangler ' + args.join(' ') + '\n' + r.stdout + r.stderr);
  return r.stdout;
};
const patch = (file, pairs) => { let s = readFileSync(file, 'utf8'); for (const [re, rep] of pairs) { if (!re.test(s)) throw new Error('No encontré ' + re + ' en ' + file); s = s.replace(re, rep); } writeFileSync(file, s); };
const step = t => console.log('\n→ ' + t);

step('Proyecto ' + PROJECT);
const projects = fb(['projects:list']);
if (!projects.some(p => p.projectId === PROJECT)) {
  // Si el proyecto de Google Cloud ya existe (un intento anterior), solo se le agrega Firebase.
  // Una cuenta que nunca abrió Firebase da 403 acá: primero hay que aceptar los términos en la consola.
  if (fb(['projects:addfirebase', PROJECT], { ok: true })) console.log('  Firebase agregado al proyecto existente');
  else { fb(['projects:create', PROJECT, '--display-name', 'BOOST App']); console.log('  creado'); }
} else console.log('  ya existía');

step('App web (la usa el iPhone dentro de Capacitor)');
let apps = fb(['apps:list', 'WEB', '--project', PROJECT]) || [];
if (!apps.length) { fb(['apps:create', 'WEB', 'BOOST iOS', '--project', PROJECT]); apps = fb(['apps:list', 'WEB', '--project', PROJECT]); }
const cfg = fb(['apps:sdkconfig', 'WEB', apps[0].appId, '--project', PROJECT]);
const sdk = cfg.sdkConfig || cfg.fileContents && JSON.parse(cfg.fileContents) || cfg;
patch(path.join(APP, 'src', 'velo', 'firebase.js'), [
  [/apiKey: [^,]+,(\s*\/\/[^\n]*)?/, `apiKey: '${sdk.apiKey}',`],
  [/authDomain: '[^']*'/, `authDomain: '${sdk.authDomain}'`],
  [/projectId: '[^']*'/, `projectId: '${sdk.projectId}'`],
  [/appId: [^,]+,/, `appId: '${sdk.appId}',`]
]);
console.log('  config escrita en src/velo/firebase.js');
patch(path.join(BACK, '.firebaserc'), [[/"default": "[^"]*"/, `"default": "${PROJECT}"`]]);
patch(path.join(WORKER, 'wrangler.toml'), [[/FIREBASE_PROJECT_ID = "[^"]*"/, `FIREBASE_PROJECT_ID = "${PROJECT}"`]]);

step('Firestore en ' + LOCATION);
const created = fb(['firestore:databases:create', '(default)', '--location', LOCATION, '--project', PROJECT], { json: false, ok: true });
console.log(/already exists|ALREADY_EXISTS/i.test(created) ? '  ya existía' : '  lista');

step('Reglas de Firestore');
fb(['deploy', '--only', 'firestore:rules,firestore:indexes', '--project', PROJECT], { json: false });
console.log('  publicadas');

if (withWorker) {
  step('Contador de Nova (KV)');
  const toml = path.join(WORKER, 'wrangler.toml');
  if (/^\[\[kv_namespaces\]\]/m.test(readFileSync(toml, 'utf8'))) console.log('  ya estaba');
  else {
    const out = wr(['kv', 'namespace', 'create', 'NOVA_KV']);
    const id = (out.match(/id = "([0-9a-f]+)"/) || out.match(/"id": "([0-9a-f]+)"/) || [])[1];
    if (!id) throw new Error('No pude leer el id del KV:\n' + out);
    patch(toml, [[/# \[\[kv_namespaces\]\]\n# binding = "NOVA_KV"\n# id = "PEGAR_ID"/, `[[kv_namespaces]]\nbinding = "NOVA_KV"\nid = "${id}"`]]);
    console.log('  creado: ' + id);
  }
  step('Deploy del Worker');
  console.log(wr(['deploy']).split('\n').filter(l => /https?:\/\/|Deployed|Current Version/.test(l)).join('\n'));
  patch(path.join(APP, 'src', 'velo', 'firebase.js'), [[/api: [^,]+,(\s*\/\/[^\n]*)?/, `api: 'https://api.getboost.fit',`]]);
}

console.log(`
Listo lo automático. Falta, en la consola (https://console.firebase.google.com/project/${PROJECT}):
  1. Authentication → Comenzar → Método de acceso: activar Correo/contraseña, Google y Apple.
  2. Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada.
     Después, desde backend/worker:  npx wrangler secret put FIREBASE_SERVICE_ACCOUNT  (pegás el JSON)
  3. Desde backend/worker:  npx wrangler secret put ANTHROPIC_API_KEY
`);
