// ─── FATIGA Y SOBREENTRENAMIENTO ──────────────────────────────────────
// Cuentas deterministas sobre las series medidas. Las usan la app (tarjeta en
// Análisis y saludo de Nova) y el servidor (contexto de Nova): la IA NUNCA
// calcula esto, solo lo redacta con cuidado.
//
// Señales (cada una con sus números, para que Nova los diga):
//   velocidad  la velocidad a la carga de siempre cae en las 2 últimas sesiones
//   1rm        el 1RM estimado baja dos sesiones seguidas
//   volumen    esta semana hiciste mucho más que tu promedio (carga aguda:crónica)
//   lentos     varios días seguidos más lentos que lo esperado para esas cargas
//   sinDescanso 6 o más días entrenados de los últimos 7
//
// Sin pure-JS raro: corre igual en el iPhone y en el Worker de Cloudflare.
import { fitProfile, estimate1RM } from '../../../app/js/lv.js';
import { EXERCISES } from '../../../app/js/protocol.js';

const DAY = 864e5;
// Días de Uruguay (UTC−3, sin horario de verano): así el teléfono y el servidor
// (que corre en UTC) cortan los días en el mismo lugar.
const dayOf = t => Math.floor((t - 3 * 36e5) / DAY);
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const best = s => Math.max(0, ...(s.reps || []).filter(v => v > 0 && v < 5));
const exId = name => (EXERCISES.find(e => e.name.toLowerCase() === String(name).toLowerCase()) || { id: 0 }).id;
const pct = (from, to) => Math.round((to - from) / from * 100);
const fk = v => String(Math.round(v * 10) / 10).replace('.', ',');

// Series limpias, de la más vieja a la más nueva.
const clean = sets => (sets || [])
  .filter(s => s && Number.isFinite(s.at) && Number.isFinite(s.load) && s.exercise)
  .map(s => ({ ...s, v: best(s) }))
  .filter(s => s.v > 0)
  .sort((a, b) => a.at - b.at);

// Agrupa por día: [{ day, sets }]
function sessions(list) {
  const m = new Map();
  for (const s of list) { const d = dayOf(s.at); if (!m.has(d)) m.set(d, []); m.get(d).push(s); }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([day, sets]) => ({ day, sets }));
}

// Carga más usada del ejercicio (con empate, la más alta).
function refLoad(list) {
  const c = new Map();
  for (const s of list) c.set(s.load, (c.get(s.load) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

// Velocidad esperada para `load` según lo que hizo en los 42 días anteriores a `day`.
function expected(prior, load) {
  const same = prior.filter(s => Math.abs(s.load - load) <= 2.5);
  if (same.length >= 2) return mean(same.map(s => s.v));
  const fit = fitProfile(prior.map(s => ({ loadKg: s.load, vel: s.v })));
  if (!fit.ok || fit.b >= 0 || fit.r2 < 0.5) return null;
  if (load < fit.minLoad * 0.9 || load > fit.maxLoad * 1.1) return null;
  const v = fit.velAt(load);
  return v > 0 ? v : null;
}

function e1rmAt(list, until) {
  const pts = list.filter(s => s.at <= until && s.at > until - 60 * DAY).map(s => ({ loadKg: s.load, vel: s.v }));
  const est = estimate1RM(fitProfile(pts), exId(list[0].exercise));
  return est && est.extrapolation <= 2 && est.confidence !== 'baja' ? est.kg : null;
}

/**
 * @returns {{ level: 'ok'|'atento'|'descanso'|'descarga', score: number,
 *   signals: {id: string, strong: boolean, text: string}[], advice: string, title: string }}
 */
export function fatigue(sets, now = Date.now()) {
  const all = clean(sets).filter(s => s.at <= now && s.at > now - 70 * DAY);
  const today = dayOf(now);
  const signals = [];
  const byEx = new Map();
  for (const s of all) { if (!byEx.has(s.exercise)) byEx.set(s.exercise, []); byEx.get(s.exercise).push(s); }

  // 1) Velocidad que cae a la carga de siempre: las 2 últimas sesiones contra las anteriores.
  let velWorst = null;
  for (const [ex, list] of byEx) {
    const recent = list.filter(s => s.at > now - 42 * DAY);
    if (recent.length < 4) continue;
    const ref = refLoad(recent);
    const ses = sessions(recent.filter(s => Math.abs(s.load - ref) <= 2.5)).map(x => ({ day: x.day, v: mean(x.sets.map(s => s.v)) }));
    if (ses.length < 4) continue;
    const last2 = ses.slice(-2), base = ses.slice(-8, -2);
    const b = mean(base.map(x => x.v));
    const drops = last2.map(x => pct(b, x.v));
    if (b > 0 && drops.every(d => d <= -6) && today - last2[1].day <= 10) {
      const p = Math.round(mean(drops));
      if (!velWorst || p < velWorst.p) velWorst = { ex, p, ref };
    }
  }
  if (velWorst) signals.push({ id: 'velocidad', strong: velWorst.p <= -10,
    text: `En ${velWorst.ex.toLowerCase()} a ${fk(velWorst.ref)} kg, tus 2 últimas sesiones fueron ${Math.abs(velWorst.p)} % más lentas que tu media.` });

  // 2) 1RM estimado que baja dos sesiones seguidas (y en total 5 % o más).
  let rmWorst = null;
  for (const [ex, list] of byEx) {
    const ses = sessions(list).slice(-4);
    if (ses.length < 3) continue;
    const est = ses.map(x => e1rmAt(list, x.sets[x.sets.length - 1].at));
    const [a, b, c] = est.slice(-3);
    if (a == null || b == null || c == null) continue;
    const peak = Math.max(...est.filter(x => x != null));
    const p = pct(peak, c);
    if (b < a && c < b && p <= -5 && today - ses[ses.length - 1].day <= 10) {
      if (!rmWorst || p < rmWorst.p) rmWorst = { ex, p, from: peak, to: c };
    }
  }
  if (rmWorst) signals.push({ id: '1rm', strong: rmWorst.p <= -8,
    text: `Tu 1RM estimado de ${rmWorst.ex.toLowerCase()} bajó de ${fk(Math.round(rmWorst.from * 2) / 2)} a ${fk(Math.round(rmWorst.to * 2) / 2)} kg (${rmWorst.p} %) en las últimas sesiones.` });

  // 3) Mucho volumen: series de los últimos 7 días contra el promedio semanal de las 4 anteriores.
  const acute = all.filter(s => s.at > now - 7 * DAY).length;
  const chronic = all.filter(s => s.at <= now - 7 * DAY && s.at > now - 35 * DAY).length / 4;
  if (chronic >= 6 && acute >= 12 && acute >= chronic * 1.5) {
    const r = Math.round(acute / chronic * 10) / 10;
    signals.push({ id: 'volumen', strong: r >= 2,
      text: `Esta semana hiciste ${acute} series, ${fk(r)} veces tu promedio (${Math.round(chronic)} por semana).` });
  }

  // 4) Días lentos seguidos: cada día contra lo esperado para esas cargas.
  const days = sessions(all.filter(s => s.at > now - 28 * DAY));
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const rel = [];
    for (const s of days[i].sets) {
      const prior = (byEx.get(s.exercise) || []).filter(p => dayOf(p.at) < days[i].day && p.at > s.at - 42 * DAY);
      const e = expected(prior, s.load);
      if (e) rel.push(s.v / e - 1);
    }
    if (!rel.length) break;
    if (mean(rel) <= -0.05) streak++; else break;
  }
  if (streak >= 3 && days.length && today - days[days.length - 1].day <= 7) {
    signals.push({ id: 'lentos', strong: streak >= 4, text: `Vas ${streak} entrenamientos seguidos más lento de lo normal para esas cargas.` });
  }

  // 5) Sin descanso: 6 o más días entrenados de los últimos 7.
  const trained = new Set(all.filter(s => s.at > now - 7 * DAY).map(s => dayOf(s.at))).size;
  if (trained >= 6) signals.push({ id: 'sinDescanso', strong: trained >= 7, text: `Entrenaste ${trained} de los últimos 7 días.` });

  const score = signals.reduce((n, s) => n + (s.strong ? 2 : 1), 0);
  const level = score === 0 ? 'ok' : score === 1 ? 'atento' : score <= 3 ? 'descanso' : 'descarga';
  return {
    level, score, signals,
    title: { ok: 'Recuperación en orden', atento: 'Ojo con la fatiga', descanso: 'Tu cuerpo pide descanso', descarga: 'Toca una semana de descarga' }[level],
    advice: {
      ok: 'Seguí con el plan.',
      atento: 'Hoy bajá 5 a 10 % la carga o hacé una serie menos, y fijate cómo dormiste y comiste.',
      descanso: 'Tomate 1 o 2 días de descanso, o hacé una sesión muy liviana (−20 % de carga, la mitad de las series).',
      descarga: 'Hacé una semana de descarga: 5 a 7 días con las cargas 10 % más bajas y la mitad de las series. Volvés más fuerte.'
    }[level]
  };
}

// ─── Dolor, lesión o síntomas ─────────────────────────────────────────
// 'urgente' = síntomas que pueden ser serios (pecho, aire, mareo, desmayo…):
// el servidor contesta con un texto fijo, sin IA. 'dolor' = la IA contesta
// pero siempre con "pará y consultá a un profesional".
const URGENT = /(dolor|duele|presi[oó]n|opresi[oó]n|puntada)[^.?!]{0,25}(pecho|tor[aá]x)|pecho[^.?!]{0,20}(duele|dolor|aprieta)|falta (de )?aire|no (puedo|pod[ií]a) respirar|me ahogo|desmay|me desvanec|mare[oaé]|mareos|visi[oó]n borrosa|veo borroso|palpitaci|coraz[oó]n (acelerado|a mil|raro)|se me (durmi[oó]|entumeci[oó]) (el|la|los|las) (brazo|cara|pierna|mano)|hormigue[oa] en (el|la) (brazo|cara)|orin(a|o|é|e)[^.?!]{0,20}(oscur|marr[oó]n|coca|color t[eé]|con sangre|roj)|\bpis\b[^.?!]{0,20}(oscur|marr[oó]n|coca|color t[eé]|con sangre|roj)/i;
const PAIN = /dolor|duele|duelen|dolió|me lesion|lesi[oó]n|lesionad|pinchazo|puntada|tir[oó]n|desgarr|contractura|esguince|luxaci|hernia|lumbalgia|ci[aá]tic|tendinitis|tendin|inflamad|hinchad|molestia|me cruj|chasquido|me tron[oó]|torc[ií]|fractur|me lastim/i;

// Ideas de hacerse daño: otra respuesta, con la línea de prevención del suicidio.
const CRISIS = /suicid|matarme|me quiero morir|quiero morirme|no quiero (vivir|seguir viviendo)|quitarme la vida|hacerme da[ñn]o|lastimarme a prop[oó]sito|autolesi/i;
const DYING = /me (voy a|estoy por) morir|me muero|siento que me muero|me estoy muriendo|me siento (muy|re|horrible|p[eé]simo) mal/i;

export function symptomCheck(text) {
  const t = String(text || '');
  if (CRISIS.test(t)) return 'crisis';
  if (URGENT.test(t) || DYING.test(t)) return 'urgente';
  if (PAIN.test(t)) return 'dolor';
  return null;
}

export const URGENT_REPLY = 'Pará de entrenar ahora. Eso que contás puede ser serio: sentate, respirá tranquilo y, si es fuerte o no se te pasa en unos minutos, llamá al 911 o al número de emergencias de donde estés. Después de esto, antes de volver a entrenar, que te vea un médico. Me importa más que estés bien que la serie de hoy.';
export const CRISIS_REPLY = 'Gracias por contármelo. Lo que sentís importa y no tenés que atravesarlo en soledad. En Uruguay podés llamar gratis a la Línea Vida: 0800 0767 o *0767 desde el celular, todos los días a toda hora. Si estás en peligro ahora, llamá al 911. Y si podés, contale ya a alguien de confianza. Acá estoy para lo que necesites del entrenamiento, pero esto primero.';
export const PAIN_NOTE = 'Si te duele, pará ese ejercicio hoy y consultá a un médico o fisioterapeuta antes de volver a cargarlo. Entrenar con dolor no suma.';
