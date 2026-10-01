// api.getboost.fit — el servidor de la app BOOST (Cloudflare Worker).
//   POST   /nova/ask   Nova (Pro y Élite)            { question, history } → { text, chip }
//   DELETE /account    borra cuenta y datos          → 204
//   GET    /health
// Todo lo demás (perfil, series, soporte) va directo de la app a Firestore,
// protegido por backend/firestore.rules.
import { verifyUser, verifyAppCheck, getProfile, recentSets, deleteEverything, getNovaState, bumpUsage, saveChat, HttpError } from './google.js';
import { planOf, deleteSubscriber } from './revenuecat.js';
import { askNova, explainRoutine, MAX_Q } from './nova.js';

// Mensajes por día. Alcanza de sobra para entrenar y pone techo a la cuenta de la IA.
const DAILY = { pro: 40, elite: 120 };

// La app de iOS (Capacitor) pide desde capacitor://localhost; en el navegador, desde localhost.
// La app web (npm run beta:deploy) vive en app.getboost.fit; boost-beta-01x.pages.dev queda de prueba.
const ORIGINS = ['capacitor://localhost', 'ionic://localhost', 'http://localhost', 'https://localhost', 'https://boost-beta-01x.pages.dev', 'https://app.getboost.fit'];
const cors = req => {
  const o = req.headers.get('Origin') || '';
  const ok = ORIGINS.some(a => o === a || o.startsWith(a + ':'));
  return {
    'Access-Control-Allow-Origin': ok ? o : ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, DELETE, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Firebase-AppCheck',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
};
const json = (req, body, status = 200) => new Response(body == null ? null : JSON.stringify(body), {
  status, headers: { ...cors(req), ...(body == null ? {} : { 'Content-Type': 'application/json; charset=utf-8' }) }
});

// Conversación que ve Nova: la guardada en el servidor, de las últimas 12 h.
const CHAT_KEEP = 12, CHAT_HOURS = 12;

const LIMIT = { text: 'Por hoy llegamos al límite de mensajes. Mañana seguimos.', chip: '' };
// Cuentas que ya pasaron el tope hoy (memoria del isolate): sus pedidos siguientes no
// escriben ni leen nada en Firestore. Si el isolate se recicla, vuelve a contar y cortar.
const overToday = new Map();

// Series que ve Nova. Antes cada mensaje leía hasta 300 documentos de Firestore (una
// lectura paga por documento). Ahora se guarda una copia en nova/{uid} y en cada mensaje
// se leen solo las series nuevas; una vez por semana se relee todo (por si subió tarde una
// serie hecha sin señal, con fecha vieja). Ventana de 70 días: lo que mira la fatiga.
const DAY = 864e5, WINDOW = 70 * DAY, FULL_EVERY = 7 * DAY, SKEW = 10 * 60e3, MAX_SETS = 300;
const slim = s => ({ id: s.id, at: s.at, exercise: s.exercise, load: s.load, setNo: s.setNo, reps: s.reps });
async function syncSets(env, uid, st, now = Date.now()) {
  const full = !st.setsFull || now - st.setsFull > FULL_EVERY;
  const fresh = await recentSets(env, uid, full ? now - WINDOW : st.setsSync - SKEW, MAX_SETS);
  const byKey = new Map((full ? [] : st.sets).map(s => [s.id || s.at + '|' + s.exercise, s]));
  for (const s of fresh) byKey.set(s.id || s.at + '|' + s.exercise, slim(s));
  const sets = [...byKey.values()].filter(s => s.at > now - WINDOW).sort((a, b) => b.at - a.at).slice(0, MAX_SETS);
  return { sets, snap: { sets, setsSync: now, setsFull: full ? now : st.setsFull } };
}

// Anti bots, sin gastar nada: los límites de velocidad de Cloudflare (wrangler.toml
// [[ratelimits]]) cortan ráfagas por IP y por cuenta antes de tocar Firestore o la IA.
async function throttle(limiter, key) {
  if (!limiter) return;
  const { success } = await limiter.limit({ key });
  if (!success) throw new HttpError(429, 'Demasiados pedidos. Esperá un minuto.', 'rate');
}

// App Check: con APPCHECK_ENFORCE=1 solo entra la app oficial. Mientras tanto
// se mide cuántos pedidos llegan sin la prueba (se ve en wrangler tail).
async function appCheck(env, req) {
  const ok = await verifyAppCheck(env, req.headers.get('X-Firebase-AppCheck'));
  if (ok) return;
  if (env.APPCHECK_ENFORCE === '1') throw new HttpError(401, 'App no verificada', 'appcheck');
  console.log('appcheck: sin prueba válida');
}

// Quién pide y si puede usar Nova: App Check, token, ráfagas y email confirmado.
async function novaUser(env, req) {
  await appCheck(env, req);
  const { uid, verified } = await verifyUser(env, req.headers.get('Authorization'));
  await throttle(env.RL_USER, uid);
  // Cuentas con email sin confirmar no usan Nova: si no, un bot abre cuentas
  // truchas sin parar y se come la cuota gratis de la IA.
  if (!verified && env.NOVA_REQUIRE_VERIFIED !== '0') throw new HttpError(403, 'Confirmá tu email para hablar con Nova', 'verify');
  return uid;
}

// Plan y topes. Devuelve la respuesta de corte (tope del día o freno global) o null si sigue.
async function novaQuota(env, uid) {
  const plan = await planOf(env, uid);
  if (plan === 'free') throw new HttpError(402, 'Nova es parte de BOOST Pro');
  // Tope diario: se cuenta ANTES de leer datos o llamar a la IA, y se decide con el valor
  // que devuelve la suma atómica (no con una lectura previa): 20 pedidos a la vez con
  // 35 de 40 usados dejan pasar 5, no 20. Pasado el tope, este isolate ni toca Firestore.
  const day = new Date().toISOString().slice(0, 10);
  if (overToday.get(uid) === day) return LIMIT;
  const use = await bumpUsage(env, uid, day);
  if (use.user > DAILY[plan]) { overToday.set(uid, day); return LIMIT; }
  // Freno global de la IA para todo BOOST (NOVA_GLOBAL_DAILY): si una ola de cuentas
  // truchas o un error dispara el uso, se corta acá y no en la factura.
  if (use.global > (Number(env.NOVA_GLOBAL_DAILY) || 20000)) {
    console.error('nova: freno global alcanzado', day, use.global);
    return { text: 'Hoy estoy con demasiada demanda. Mañana seguimos.', chip: '' };
  }
  return null;
}

async function route(req, env, ctx) {
  const { pathname } = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (pathname === '/health') return json(req, { ok: true });

  const ip = req.headers.get('CF-Connecting-IP') || 'local';
  await throttle(env.RL_IP, ip);

  if (pathname === '/nova/ask' && req.method === 'POST') {
    const t0 = Date.now();
    const uid = await novaUser(env, req);
    const body = await req.json().catch(() => null);
    const question = body && typeof body.question === 'string' ? body.question.trim().slice(0, MAX_Q) : '';
    if (!question) throw new HttpError(400, 'Falta la pregunta');
    const t1 = Date.now();
    const stop = await novaQuota(env, uid);
    if (stop) return json(req, stop);
    const [profile, st] = await Promise.all([getProfile(env, uid), getNovaState(env, uid)]);
    // Permiso aparte para la IA: apagado (el consentimiento va en el registro). Con
    // NOVA_REQUIRE_CONSENT=1 se exige aiConsentV en el perfil, por si Apple lo pide en la revisión.
    if (env.NOVA_REQUIRE_CONSENT === '1' && !(profile && profile.aiConsentV)) throw new HttpError(403, 'Falta tu permiso para usar la IA', 'consent');
    const { sets, snap } = await syncSets(env, uid, st);
    // El historial sale del servidor. Del teléfono solo se usa una señal: si su
    // chat no tiene ningún mensaje del usuario, es una conversación nueva.
    const fresh = !(Array.isArray(body.history) && body.history.some(m => m && m.me));
    const since = Date.now() - CHAT_HOURS * 36e5;
    // Pregunta editada en el teléfono: se borran de la copia las últimas `edit` preguntas
    // (con sus respuestas), así Nova contesta como si nunca se hubieran hecho. Solo recorta.
    let stored = st.chat;
    const cut = Math.min(20, Math.max(0, Math.floor(Number(body.edit) || 0)));
    for (let n = 0; n < cut; n++) { const j = stored.map(m => !!m.me).lastIndexOf(true); if (j < 0) break; stored = stored.slice(0, j); }
    const past = fresh ? [] : stored.filter(m => m.at > since).slice(-CHAT_KEEP);
    const t2 = Date.now();
    const today = new Date().toLocaleDateString('es-UY', { timeZone: 'America/Montevideo', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const ans = await askNova(env, { question, history: past, profile, sets, today });
    const by = ans._by || '-'; delete ans._by;
    const now = Date.now();
    const chat = [...past, { me: true, t: question, at: now }, { me: false, t: String(ans.text || '').slice(0, 2000), at: now + 1 }].slice(-CHAT_KEEP);
    const save = saveChat(env, uid, chat, snap).catch(e => console.warn('saveChat', String(e).slice(0, 200)));
    if (ctx && ctx.waitUntil) ctx.waitUntil(save); else await save;
    const res = json(req, ans);
    // Tiempos por etapa y qué modelo contestó: solo con DEBUG_TIMING=1, para no mostrarle
    // a cualquiera cómo está armado el servidor.
    if (env.DEBUG_TIMING === '1') res.headers.set('Server-Timing', `auth;dur=${t1 - t0}, datos;dur=${t2 - t1}, ia;dur=${now - t2};desc="${by}"`);
    console.log('nova', by, 'auth', t1 - t0, 'datos', t2 - t1, 'ia', now - t2);
    return res;
  }

  // Rutina nueva: las reglas de BOOST (src/velo/routine.js) ya la armaron en el teléfono;
  // Nova la revisa con el perfil y las series y explica el porqué. Cuenta como un mensaje
  // del tope diario y no se guarda en el chat.
  if (pathname === '/nova/routine' && req.method === 'POST') {
    const uid = await novaUser(env, req);
    const body = await req.json().catch(() => null);
    const plan = body && typeof body.plan === 'string' ? body.plan.trim().slice(0, 1000) : '';
    if (!plan) throw new HttpError(400, 'Falta la rutina');
    const stop = await novaQuota(env, uid);
    if (stop) return json(req, stop);
    const [profile, st] = await Promise.all([getProfile(env, uid), getNovaState(env, uid)]);
    if (env.NOVA_REQUIRE_CONSENT === '1' && !(profile && profile.aiConsentV)) throw new HttpError(403, 'Falta tu permiso para usar la IA', 'consent');
    const { sets, snap } = await syncSets(env, uid, st);
    const today = new Date().toLocaleDateString('es-UY', { timeZone: 'America/Montevideo', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const ans = await explainRoutine(env, { plan, profile, sets, today });
    const save = saveChat(env, uid, st.chat, snap).catch(e => console.warn('saveChat', String(e).slice(0, 200)));
    if (ctx && ctx.waitUntil) ctx.waitUntil(save); else await save;
    console.log('nova rutina', ans._by || '-');
    return json(req, { text: String(ans.text || '').slice(0, 900) });
  }

  if (pathname === '/account' && req.method === 'DELETE') {
    await appCheck(env, req);
    const { uid } = await verifyUser(env, req.headers.get('Authorization'));
    await throttle(env.RL_USER, uid);
    await deleteEverything(env, uid);
    await deleteSubscriber(env, uid);
    return json(req, null, 204);
  }

  throw new HttpError(404, 'No existe');
}

export default {
  async fetch(req, env, ctx) {
    try { return await route(req, env, ctx); }
    catch (e) {
      if (e instanceof HttpError) return json(req, { error: e.message, ...(e.code ? { code: e.code } : {}) }, e.status);
      console.error(e);
      return json(req, { error: 'Error del servidor' }, 500);
    }
  }
};
