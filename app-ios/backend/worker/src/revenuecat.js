// Suscripción del usuario según RevenueCat (el que cobra es Apple; RevenueCat
// lleva la cuenta). El app_user_id de RevenueCat es el uid de Firebase.
const RC_BASE = 'https://api.revenuecat.com';
const rcUrl = (env, uid) => (env.REVENUECAT_BASE_URL || RC_BASE) + '/v1/subscribers/' + encodeURIComponent(uid);

// 'elite' | 'pro' | 'free'
export async function planOf(env, uid) {
  // Para probar sin RevenueCat (solo local): FAKE_PLAN=pro
  if (env.FAKE_PLAN) return env.FAKE_PLAN;
  // Beta sin pagos todavía (NOVA_BETA=1): todo usuario con cuenta usa Nova como Pro.
  // Se apaga solo al cargar REVENUECAT_SECRET.
  if (!env.REVENUECAT_SECRET) return env.NOVA_BETA === '1' ? 'pro' : 'free';
  // Se guarda 5 min en memoria: una charla con Nova no le pregunta a RevenueCat en cada
  // mensaje. Si RevenueCat falla o tarda más de 4 s, vale el último plan conocido
  // (un suscriptor no queda afuera por una caída ajena); sin nada conocido, gratis.
  const hit = plans.get(uid);
  if (hit && hit.exp > Date.now()) return hit.plan;
  try {
    const r = await fetch(rcUrl(env, uid), { headers: { Authorization: 'Bearer ' + env.REVENUECAT_SECRET }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error('RevenueCat ' + r.status);
    const ent = ((await r.json()).subscriber || {}).entitlements || {};
    const on = e => e && (!e.expires_date || Date.parse(e.expires_date) > Date.now());
    const plan = on(ent.elite) ? 'elite' : on(ent.pro) ? 'pro' : 'free';
    // 'free' no se guarda: el que acaba de suscribirse tiene que entrar al toque.
    if (plans.size > 5000) plans.clear();
    if (plan !== 'free') plans.set(uid, { plan, exp: Date.now() + 5 * 60e3 }); else plans.delete(uid);
    return plan;
  } catch (e) {
    console.warn('planOf', String(e).slice(0, 120));
    return hit ? hit.plan : 'free';
  }
}
const plans = new Map();

// Al borrar la cuenta. Ojo: esto NO cancela la suscripción de Apple; eso lo
// hace el usuario en Ajustes del iPhone (y la app se lo tiene que decir).
export async function deleteSubscriber(env, uid) {
  if (!env.REVENUECAT_SECRET) return;
  await fetch(rcUrl(env, uid), { method: 'DELETE', headers: { Authorization: 'Bearer ' + env.REVENUECAT_SECRET } });
}
