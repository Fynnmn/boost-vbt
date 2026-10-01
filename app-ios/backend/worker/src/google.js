// Firebase desde el Worker, sin el SDK de administración (no corre en Workers):
// verificar el token del usuario, y leer/borrar con la cuenta de servicio por REST.
import { createRemoteJWKSet, jwtVerify, decodeJwt, SignJWT, importPKCS8 } from 'jose';

const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const emu = env => env.FIREBASE_EMULATOR === '1';

// Devuelve { uid, verified } del token de Firebase, o lanza.
// verified = el email está confirmado. Apple y Google ya lo confirman ellos;
// con email y contraseña, hasta que toque el link del mail es false.
const who = p => {
  if (!p.sub) throw new Error('sin sub');
  const prov = (p.firebase && p.firebase.sign_in_provider) || '';
  return { uid: p.sub, verified: p.email_verified === true || prov === 'apple.com' || prov === 'google.com' };
};
export async function verifyUser(env, authHeader) {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Falta el token');
  // El emulador firma sin clave: solo se acepta con FIREBASE_EMULATOR=1 (npm run dev local).
  if (emu(env)) { try { return who(decodeJwt(token)); } catch { throw new HttpError(401, 'Token inválido'); } }
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: 'https://securetoken.google.com/' + env.FIREBASE_PROJECT_ID,
      audience: env.FIREBASE_PROJECT_ID
    });
    return who(payload);
  } catch { throw new HttpError(401, 'Token inválido'); }
}

// App Check: prueba de que el pedido sale de la app oficial (App Attest en el
// iPhone, reCAPTCHA v3 en la web) y no de un script. Devuelve true/false; el
// que decide si se exige es index.js (APPCHECK_ENFORCE).
const APPCHECK_JWKS = createRemoteJWKSet(new URL('https://firebaseappcheck.googleapis.com/v1/jwks'));
export async function verifyAppCheck(env, token) {
  if (!token || !env.FIREBASE_PROJECT_NUMBER) return false;
  try {
    await jwtVerify(token, APPCHECK_JWKS, {
      issuer: 'https://firebaseappcheck.googleapis.com/' + env.FIREBASE_PROJECT_NUMBER,
      audience: 'projects/' + env.FIREBASE_PROJECT_NUMBER,
      algorithms: ['RS256']
    });
    return true;
  } catch { return false; }
}

export class HttpError extends Error { constructor(status, msg, code) { super(msg); this.status = status; this.code = code; } }

// Token de acceso de la cuenta de servicio (1 h). Se cachea en memoria del isolate.
let cached = null;
async function serviceToken(env) {
  if (emu(env)) return 'owner';
  if (cached && cached.exp > Date.now() + 60e3) return cached.token;
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email).setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now).setExpirationTime(now + 3600)
    .sign(await importPKCS8(sa.private_key, 'RS256'));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  if (!r.ok) throw new Error('Google token ' + r.status);
  const j = await r.json();
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

const fsBase = env => (emu(env) ? 'http://127.0.0.1:8080/v1' : 'https://firestore.googleapis.com/v1')
  + `/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;

async function gfetch(env, url, init = {}) {
  const r = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: 'Bearer ' + await serviceToken(env), 'Content-Type': 'application/json' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${init.method || 'GET'} ${url.split('/documents')[1] || url} → ${r.status} ${await r.text()}`);
  return r.status === 204 ? {} : r.json();
}

// Valores de Firestore REST → JS.
function val(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
  if ('mapValue' in v) return fields(v.mapValue.fields || {});
  return null;
}
const fields = f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, val(v)]));

export async function getProfile(env, uid) {
  const d = await gfetch(env, `${fsBase(env)}/users/${uid}`);
  return d ? fields(d.fields || {}) : null;
}

// Series con at > since, de la más nueva a la más vieja. Firestore cobra una lectura por
// documento devuelto: sin el filtro de fecha cada mensaje a Nova leía hasta 300.
export async function recentSets(env, uid, since = 0, limit = 300) {
  const base = fsBase(env);
  const rows = await gfetch(env, `${base}/users/${uid}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'sets' }],
      where: { fieldFilter: { field: { fieldPath: 'at' }, op: 'GREATER_THAN', value: { integerValue: String(Math.floor(since)) } } },
      orderBy: [{ field: { fieldPath: 'at' }, direction: 'DESCENDING' }], limit
    } })
  });
  return (rows || []).filter(r => r.document).map(r => fields(r.document.fields || {}));
}

// Borra el perfil, todas las series y la cuenta de Auth.
export async function deleteEverything(env, uid) {
  const base = fsBase(env);
  const commit = names => gfetch(env, base.replace(/\/documents$/, '/documents:commit'), {
    method: 'POST', body: JSON.stringify({ writes: names.map(name => ({ delete: name })) })
  });
  // Series, de a 300 por vuelta (:commit acepta hasta 500 escrituras).
  for (;;) {
    const page = await gfetch(env, `${base}/users/${uid}/sets?pageSize=300&mask.fieldPaths=at`);
    const docs = (page && page.documents) || [];
    if (!docs.length) break;
    await commit(docs.map(d => d.name));
  }
  // Mensajes de soporte: tienen su email.
  const sup = await gfetch(env, `${base}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'support' }], where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } }, limit: 500 } })
  });
  const supNames = (sup || []).filter(r => r.document).map(r => r.document.name);
  if (supNames.length) await commit(supNames);
  await gfetch(env, `${base}/users/${uid}`, { method: 'DELETE' });
  // Contadores diarios de Nova (nova/{uid}/days/{día}).
  for (;;) {
    const page = await gfetch(env, `${base}/nova/${uid}/days?pageSize=300&mask.fieldPaths=n`);
    const docs = (page && page.documents) || [];
    if (!docs.length) break;
    await commit(docs.map(d => d.name));
  }
  await gfetch(env, `${base}/nova/${uid}`, { method: 'DELETE' });
  const idt = emu(env) ? 'http://127.0.0.1:9099/identitytoolkit.googleapis.com' : 'https://identitytoolkit.googleapis.com';
  await gfetch(env, `${idt}/v1/projects/${env.FIREBASE_PROJECT_ID}/accounts:delete`, { method: 'POST', body: JSON.stringify({ localId: uid }) });
}

// ─── Estado de Nova por usuario: nova/{uid} = { chat, sets, setsSync, setsFull } ─────
// Solo lo toca el servidor (las reglas cierran la colección). Ahí viven la
// conversación (el historial NO se toma del teléfono, porque cualquiera podría
// inventarle respuestas a Nova) y una copia de las series que ya leyó Nova, para no
// volver a leer cientos de documentos en cada mensaje (ver syncSets en index.js).
// El contador de mensajes vive aparte, un documento por día: nova/{uid}/days/{día}.
export async function getNovaState(env, uid) {
  const d = await gfetch(env, `${fsBase(env)}/nova/${uid}`);
  const f = d ? fields(d.fields || {}) : {};
  let sets = [];
  try { sets = JSON.parse(f.sets || '[]'); } catch {}
  return {
    chat: Array.isArray(f.chat) ? f.chat : [],
    sets: Array.isArray(sets) ? sets : [], setsSync: Number(f.setsSync) || 0, setsFull: Number(f.setsFull) || 0
  };
}

// Suma 1 al contador del día del usuario y al global, y devuelve los valores NUEVOS
// (Firestore los devuelve en transformResults). Se decide con eso y no con una lectura
// anterior: antes 20 pedidos a la vez leían "35 de 40" y pasaban los 20.
// El global se reparte en SHARDS documentos (Firestore aguanta ~1 escritura por segundo
// sostenida por documento); el total se estima como el valor del pedazo × SHARDS.
export const SHARDS = 20;
export async function bumpUsage(env, uid, day) {
  const base = fsBase(env), name = base.replace(/^.*?\/projects/, 'projects');
  const shard = Math.floor(Math.random() * SHARDS);
  const inc = path => ({ update: { name: path, fields: {} }, updateMask: { fieldPaths: [] }, updateTransforms: [{ fieldPath: 'n', increment: { integerValue: '1' } }] });
  const r = await gfetch(env, base.replace(/\/documents$/, '/documents:commit'), {
    method: 'POST', body: JSON.stringify({ writes: [inc(`${name}/nova/${uid}/days/${day}`), inc(`${name}/novaGlobal/${day}_${shard}`)] })
  });
  const n = i => Number(((((r && r.writeResults) || [])[i] || {}).transformResults || [{}])[0].integerValue) || 0;
  return { user: n(0), global: n(1) * SHARDS };
}

// Guarda el chat y, si cambió, la copia de las series (como texto JSON: un solo campo,
// sin miles de entradas de índice). Una sola escritura.
export async function saveChat(env, uid, chat, snap) {
  const msg = m => ({ mapValue: { fields: { me: { booleanValue: !!m.me }, t: { stringValue: String(m.t) }, at: { integerValue: String(m.at) } } } });
  const f = { chat: { arrayValue: { values: chat.map(msg) } } };
  if (snap) {
    f.sets = { stringValue: JSON.stringify(snap.sets) };
    f.setsSync = { integerValue: String(snap.setsSync) };
    f.setsFull = { integerValue: String(snap.setsFull) };
  }
  const mask = Object.keys(f).map(k => 'updateMask.fieldPaths=' + k).join('&');
  await gfetch(env, `${fsBase(env)}/nova/${uid}?${mask}`, { method: 'PATCH', body: JSON.stringify({ fields: f }) });
}
