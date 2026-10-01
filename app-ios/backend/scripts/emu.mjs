// Arranca los emuladores de Firebase (auth + firestore).
// El emulador de Firestore necesita Java 11+; en esta PC el primero del PATH es
// Java 8, así que se antepone el JRE de Adoptium si está instalado.
import { spawn } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const env = { ...process.env };
const base = 'C:/Program Files/Eclipse Adoptium';
if (process.platform === 'win32' && existsSync(base)) {
  const jre = readdirSync(base).filter(d => /^(jre|jdk)-(1[1-9]|[2-9]\d)/.test(d)).sort().pop();
  // En Windows la variable se llama "Path", no "PATH".
  const key = Object.keys(env).find(k => k.toUpperCase() === 'PATH') || 'PATH';
  if (jre) { env.JAVA_HOME = path.join(base, jre); env[key] = path.join(env.JAVA_HOME, 'bin') + path.delimiter + env[key]; }
}
const args = process.argv.slice(2);
const root = path.resolve(import.meta.dirname, '..');
const cli = path.join(root, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
const p = spawn(process.execPath, [cli, ...(args.length ? args : ['emulators:start', '--only', 'auth,firestore', '--project', 'demo-boost'])],
  { stdio: 'inherit', env, cwd: root });
p.on('exit', c => process.exit(c ?? 1));
