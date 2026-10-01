// ─── DATOS REALES EN LAS PANTALLAS ────────────────────────────────────
// El diseño trae datos de ejemplo fijos (Martina, 1RM de 108 kg, "Martes 23
// de setiembre"…). En la app real, patch() los reemplaza por lo que el atleta
// midió, justo antes de dibujar. El diseño no cambia: mismas claves, mismos
// formatos, otros valores. En el link demo (window.VELO_DEMO) no se toca nada.
//
// Todo sale de las series guardadas en el teléfono (data.listSets) y del perfil.
import { isNative } from './core.js';
import { enabled, firebase } from './firebase.js';
import { data } from './data.js';
import { sensor } from './sensor.js';
import { RC } from './payments.js';
import { fitProfile, estimate1RM } from '../../../app/js/lv.js';
import { EXERCISES } from '../../../app/js/protocol.js';
import { fatigue } from './fatigue.js';
import { TERMS, PRIVACY, LEGAL_V } from './legal.js';
import * as RT from './routine.js';

// ── Tablas del diseño que hacen falta acá (copiadas tal cual de VELOPhone) ──
const CUT = { 'Sentadilla': 0.55, 'Press banca': 0.50, 'Peso muerto': 0.45, 'Press militar': 0.50, 'Dominadas': 0.45, 'Hip thrust': 0.55, 'Cargada': 1.10, 'Remo': 0.55 };
const GOAL = { fuerza: { t: 'Fuerza', off: 0, s: 4, r: 5 }, potencia: { t: 'Potencia', off: 0.25, s: 5, r: 3 }, hipertrofia: { t: 'Hipertrofia', off: 0.1, s: 4, r: 8 }, deporte: { t: 'Rendimiento', off: 0.15, s: 4, r: 5 } };
const DEFAULT_EXS = ['Sentadilla', 'Press banca', 'Peso muerto'];
const ACC = '#EE4F2F', GRAY = '#E3E1DD';

// ── Formatos (los mismos que usa el diseño) ──
const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIA3 = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const fk = x => String(x).replace('.', ',');
const f2 = v => Number(v).toFixed(2).replace('.', ',');
const r05 = x => Math.round(x * 2) / 2;
const DAY = 864e5;
const dayKey = t => { const d = new Date(t); return d.getFullYear() * 1e4 + (d.getMonth() + 1) * 100 + d.getDate(); };
const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const best = s => Math.max(0, ...(s.reps || []));
// Pérdida de velocidad de una serie: de la rep más rápida a la última (la misma cuenta en
// la pantalla en vivo, el resumen, los avisos y Nova). Usar la primera daba 0 % cuando la
// segunda rep salía más rápida, algo común al arrancar.
export const lossOf = s => { const r = (s.reps || []).filter(v => v > 0); const top = Math.max(0, ...r); return r.length > 1 && top > 0 ? Math.max(0, Math.round((top - r[r.length - 1]) / top * 100)) : 0; };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const pct = (a, b) => Math.round((b - a) / a * 100);
const signPct = p => (p >= 0 ? '+' : '−') + Math.abs(p) + '%';
function when(t, now = Date.now()) {
  const d = Math.round((startOfDay(now) - startOfDay(t)) / DAY);
  if (d <= 0) { const m = Math.round((now - t) / 6e4); return m < 60 ? Math.max(1, m) + ' min' : Math.round(m / 60) + ' h'; }
  if (d === 1) return 'Ayer';
  if (d < 7) return DIA3[new Date(t).getDay()];
  const x = new Date(t); return x.getDate() + ' ' + MES3[x.getMonth()];
}
const dateShort = t => { const d = startOfDay(Date.now()) - startOfDay(t); if (d <= 0) return 'Hoy'; if (d === DAY) return 'Ayer'; const x = new Date(t); return x.getDate() + ' ' + MES3[x.getMonth()]; };
export const longDate = (t = Date.now()) => { const d = new Date(t); return cap(DIA[d.getDay()]) + ' ' + d.getDate() + ' de ' + MES[d.getMonth()]; };

// ── Caché de series (se refresca cuando data.js avisa) ──
let SETS = [];
let app = null;
const refresh = async () => { SETS = (await data.listSets()).slice().sort((a, b) => a.at - b.at); if (app) app.setState({}); };
data.onChange(refresh);

const ONBOARDING = ['name', 'role', 'body', 'age', 'goal', 'level', 'exercises', 'loads', 'days', 'perms', 'pair', 'calibrate'];
const uidNow = () => { try { return enabled() && firebase().auth.currentUser ? firebase().auth.currentUser.uid : null; } catch { return null; } };
// Borrador del registro de esta cuenta (o null).
export function onboardingDraft(uid) {
  try { const d = JSON.parse(localStorage.getItem('velo.draft') || 'null'); return d && d.uid === uid && ONBOARDING.includes(d.screen) ? d : null; } catch { return null; }
}

export const realMode = () => !window.VELO_DEMO && (isNative() || enabled());

// ── Cálculos ──
const exId = name => (EXERCISES.find(e => e.name.toLowerCase() === String(name).toLowerCase()) || { id: 0 }).id;
const byEx = ex => SETS.filter(s => s.exercise === ex);
const sessionsOf = list => { const m = new Map(); for (const s of list) { const k = dayKey(s.at); if (!m.has(k)) m.set(k, []); m.get(k).push(s); } return [...m.values()]; };

// 1RM estimado con el perfil carga-velocidad (app/js/lv.js), con las series
// de los 60 días anteriores a `until`. null si no alcanza para una recta creíble.
function e1rm(ex, until = Infinity) {
  const pts = byEx(ex).filter(s => s.at <= until && s.at > until - 60 * DAY && s.load > 0 && best(s) > 0).map(s => ({ loadKg: s.load, vel: best(s) }));
  const fit = fitProfile(pts);
  const est = estimate1RM(fit, exId(ex));
  if (!est || est.extrapolation > 2) return null;
  return { kg: r05(est.kg), fit, confidence: est.confidence };
}

// Carga de referencia: la más usada del ejercicio (o la del perfil).
function refLoad(ex, profileLoads) {
  const c = new Map();
  for (const s of byEx(ex)) c.set(s.load, (c.get(s.load) || 0) + 1);
  const top = [...c.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  return top ? top[0] : (profileLoads && profileLoads[ex]) || 0;
}

// Velocidad a la carga de referencia por sesión: media de la mejor rep de cada serie a esa carga (±2,5 kg).
function velSeries(ex, ref, from = 0) {
  return sessionsOf(byEx(ex).filter(s => s.at >= from && Math.abs(s.load - ref) <= 2.5 && best(s) > 0))
    .map(ss => ({ at: ss[ss.length - 1].at, v: mean(ss.map(best)) }));
}

// Carga de trabajo de la última sesión: la más repetida (con empate, la más alta).
// No la última serie: puede haber sido una serie de tope más pesada.
function lastLoad(ex) {
  const ses = sessionsOf(byEx(ex)).pop();
  if (!ses) return null;
  const c = new Map(); for (const s of ses) c.set(s.load, (c.get(s.load) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

// ── Rutina de Nova (src/velo/routine.js) ──
// Guardada en el perfil como las respuestas del formulario + la fecha de inicio: la
// rutina se vuelve a armar con las cargas medidas de cada semana (así progresa sola).
const LEGACY = { Rugby: 'rugby', 'Fútbol': 'futbol', 'Básquet': 'basquet', Tenis: 'raqueta', 'Natación': 'natacion', Hockey: 'hockey', Fuerza: 'fuerza', Potencia: 'potencia', Hipertrofia: 'hipertrofia', Resistencia: 'salud' };
const SEASON_OLD = { Pretemporada: 'pre', 'En temporada': 'in', 'Fuera de temporada': 'off' };
const profOf = S => ({ level: S.level, age: S.age, bw: S.bw, loads: S.loads, week: S.week, goals: S.goals });
// Rutinas viejas (antes de la versión 2): se traducen a respuestas.
const asV2 = r => (r && (r.v === 2 || r.kind === 'custom') ? r : r ? { v: 2, mode: r.sport ? 'sport' : 'obj', focus: LEGACY[r.focus] || 'fuerza', season: SEASON_OLD[r.season] || 'pre', days: r.days, weeks: r.weeks, start: r.start } : null);
const rmCtx = { oneRM: ex => { const e = realMode() ? e1rm(ex) : null; return e ? e.kg : null; } };
function routineNow(S, now = Date.now()) {
  const r = asV2(S.routine);
  if (!r) return null;
  try {
    const w = RT.weekOf(r.start || now, r.weeks, now);
    return r.kind === 'custom' ? RT.buildCustom(r, profOf(S), rmCtx, w) : RT.buildRoutine(r, profOf(S), rmCtx, w);
  }
  catch (e) { console.warn('[VELO rutina]', e); return null; }
}
// Sesión de hoy (o la próxima) de la rutina, en el formato del plan de Entrenar.
function planFromRoutine(rt, S) {
  const ses = RT.sessionFor(rt);
  const bars = ses.items.filter(x => x.bar);
  const cfg = (bars.length ? bars : [{ n: 'Sentadilla', s: 3, r: 5, kg: null, cut: 0.55 }])
    .map(b => ({ n: b.n, s: b.s, r: b.r, kg: b.kg ?? lastLoad(b.n) ?? (S.loads && S.loads[b.n]) ?? 40, cut: b.cut }));
  const today = SETS.filter(s => s.at >= startOfDay(Date.now()));
  const done = cfg.map((c, i) => today.filter(s => s.exercise === c.n).length >= c.s ? i : -1).filter(i => i >= 0);
  const next = cfg.findIndex((_, i) => !done.includes(i));
  return { name: ses.today ? ses.name : ses.name + ' · ' + RT.DOW[ses.dow], cfg, done, sel: next < 0 ? 0 : next, extras: ses.items.filter(x => !x.bar), today: ses.today, dow: ses.dow };
}
// Semana de la rutina para Nova › Plan.
function routineWeek(out, rt, now) {
  const dow0 = (new Date(now).getDay() + 6) % 7, start = asV2(app && app.state.routine)?.start || 0;
  // Si la rutina arranca la semana que viene, se muestran esas fechas.
  const monday = Math.max(startOfDay(now) - dow0 * DAY, start), dow = monday > startOfDay(now) ? -1 : dow0;
  out.nvWeek = rt.days.map(d => {
    const t = monday + d.dow * DAY, today = d.dow === dow;
    const did = SETS.some(s => startOfDay(s.at) === t);
    const bars = d.items.filter(x => x.bar), others = d.items.filter(x => !x.bar && x.n !== 'Entrada en calor');
    const w = { d: RT.DOW[d.dow], n: new Date(t).getDate(), t: d.name, x: bars.slice(0, 3).map(b => b.n + ' ' + b.s + '×' + b.r).join(' · ') + (others.length ? ' · +' + others.length + ' sin sensor' : ''),
      tag: today ? 'Hoy' : '', done: did && t < startOfDay(now), today };
    return { ...w, hasTag: !!w.tag, bc: today ? 'rgba(255,106,61,.45)' : 'rgba(255,255,255,.08)', bg: today ? 'rgba(238,79,47,.08)' : 'rgba(255,255,255,.05)', stBg: w.done ? '#EE4F2F' : 'transparent', stB: w.done ? '#EE4F2F' : 'rgba(255,255,255,.2)' };
  });
  out.planTitle = rt.title;
  out.planSub = dow < 0 ? 'Arranca el lunes ' + new Date(monday).getDate() : 'Semana ' + (rt.week + 1) + ' de ' + rt.weeks + ' · ' + rt.phase.label.toLowerCase();
}

// ── Formulario de Nova: preguntas de a una ──
const tick = ms => new Promise(r => setTimeout(r, ms));
function builderVals(out, a) {
  const S = a.state, prof = profOf(S);
  const ans = RT.normalize(S.bAns || RT.defaultAnswers(prof), prof);
  const set = p => a.setState({ bAns: { ...ans, ...p } });
  out.openBuilder = () => { if (!S.pro) return a.go('premium'); a.setState({ b: 'form', bQ: 0, bAns: (S.routine && S.routine.kind !== 'custom' ? asV2(S.routine) : null) || RT.defaultAnswers(prof), bRt: null, bWhy: null }); };
  out.regen = () => a.setState({ b: 'form', bQ: 0 });
  if (S.b === 'form') {
    const qs = RT.questions(ans), i = Math.max(0, Math.min(S.bQ || 0, qs.length - 1)), q = qs[i];
    const last = i === qs.length - 1;
    out.bStepTxt = 'Pregunta ' + (i + 1) + ' de ' + qs.length;
    out.bQPct = Math.round((i + 1) / qs.length * 100) + '%';
    out.bQT = q.t; out.bQS = q.s;
    out.bIsFocus = q.kind === 'focus';
    out.bQGrid = q.kind === 'focus' || q.kind === 'grid'; out.bQChips = !out.bQGrid;
    out.bModes = [['obj', 'Objetivo'], ['sport', 'Deporte']].map(([id, t]) => ({ t, bg: ans.mode === id ? 'rgba(255,255,255,.12)' : 'transparent', c: ans.mode === id ? '#F2EEE9' : 'rgba(242,238,233,.55)',
      pick: () => set({ mode: id, focus: id === 'obj' ? 'fuerza' : 'rugby', pos: null, prio: null }) }));
    out.bQOpts = q.opts.map(o => {
      const on = q.kind === 'multi' ? (o.v === 'nada' ? !ans.inj.length : ans.inj.includes(o.v)) : ans[q.id] === o.v;
      return { t: o.t, d: o.d || '', hasD: !!o.d, p: o.p || '', hasP: !!o.p, on: String(on),
        border: on ? 'rgba(255,106,61,.6)' : 'rgba(255,255,255,.1)', bg: on ? 'rgba(238,79,47,.14)' : 'rgba(255,255,255,.04)',
        ibg: on ? '#EE4F2F' : 'rgba(255,255,255,.08)', ic: on ? '#fff' : '#F2EEE9', c: '#F2EEE9',
        pick: () => {
          if (q.kind === 'multi') { if (o.v === 'nada') return set({ inj: [] }); const s2 = new Set(ans.inj); s2.has(o.v) ? s2.delete(o.v) : s2.add(o.v); return set({ inj: [...s2] }); }
          set(q.id === 'focus' ? { focus: o.v, pos: null, prio: null } : { [q.id]: o.v });
        } };
    });
    // Lo que Nova ya sabe no se vuelve a preguntar: se muestra una vez, al empezar.
    const nS = sessionsOf(SETS).length;
    out.bHasKnown = i === 0;
    out.bKnown = 'Nova ya sabe tu peso (' + (S.bw || '—') + ' kg), tu edad (' + (S.age || '—') + '), tu nivel y tus cargas' + (nS ? ', y va a usar tus ' + nS + (nS === 1 ? ' sesión medida' : ' sesiones medidas') : '') + '. Solo te pregunta lo que le falta.';
    out.bHasBack = i > 0; out.bBack = () => a.setState({ bQ: i - 1 });
    out.bNextTxt = last ? 'Generar con Nova' : 'Siguiente';
    out.bNext = () => (last ? a.generate() : a.setState({ bQ: i + 1 }));
  }
  // Pasos del armado: cada uno es trabajo real (perfil, reglas, cargas, Nova).
  if (out.bSteps) {
    const nS = sessionsOf(SETS).length, rt = S.bRt;
    const label = rt ? rt.title.toLowerCase() : 'vos';
    [nS ? 'Leyendo tu perfil y tus ' + nS + (nS === 1 ? ' sesión' : ' sesiones') : 'Leyendo tu perfil y tus cargas', 'Eligiendo ejercicios para ' + label, 'Calculando cargas y cortes de velocidad', 'Nova revisa tu plan']
      .forEach((t, k) => { if (out.bSteps[k]) out.bSteps[k].t = t; });
  }
  const rt = S.bRt;
  if (rt) {
    out.rTitle2 = rt.title; out.rSub2 = rt.sub;
    const rows = [];
    rt.days.forEach((d, di) => {
      rows.push({ head: true, ex: false, d: RT.DOW[d.dow], t: d.name, mt: di ? '10px' : '0px' });
      d.items.forEach((x, ei) => {
        const L = ei === d.items.length - 1;
        rows.push({ head: false, ex: true, t: x.n, s: x.bar ? x.s + '×' + x.r + (x.kg ? ' · ' + fk(x.kg) + ' kg' : ' · ' + x.pct + ' %') : x.x,
          z: x.bar ? 'corte ' + f2(x.cut) : x.n === 'Entrada en calor' ? 'calor' : 'sin sensor',
          zb: x.bar ? 'rgba(238,79,47,.16)' : 'rgba(255,255,255,.08)', zc: x.bar ? '#FF9B75' : 'rgba(242,238,233,.6)',
          rad: L ? '0 0 22px 22px' : '0', pb: L ? '14px' : '9px' });
      });
    });
    out.bRows = rows;
    out.bHasWhy = true;
    out.bWhyHead = S.bWhy ? 'Por qué, según Nova' : 'Por qué esta rutina';
    out.bWhyTxt = S.bWhy || rt.why.join(' ');
    out.bHasWarn = rt.warn.length > 0; out.bWarnTxt = rt.warn.join(' ');
  }
}
// "Quiero una rutina", "armame la semana", "haceme un plan"… Una rutina no se escribe en el
// chat: hacen falta respuestas (deporte, posición, días, molestias) y reglas de seguridad.
export const ROUTINE_INTENT = /\b(arm[aá](me|r)?|cre[aá](me|r)?|hac[eé](me|r)?|diseñ[aá](me|r)?|d[aá]me|pas[aá]me|necesito|quiero)\s+(una?\s+|la\s+|mi\s+|otra\s+)?(nueva\s+)?(rutina|plan\b|programa|semana)/i;
function installBuilder(a) {
  a.openRoutine = () => {
    const S = a.state;
    if (!S.pro) return a.go('premium');
    a.setState({ b: 'form', bQ: 0, bAns: (S.routine && S.routine.kind !== 'custom' ? asV2(S.routine) : null) || RT.defaultAnswers(profOf(S)), bRt: null, bWhy: null });
  };
  a.routineIntent = q => {
    if (!ROUTINE_INTENT.test(String(q || '')) || !a.state.pro) return false;
    // Mismo ritmo que una respuesta normal: "escribiendo…", el mensaje palabra por palabra,
    // un momento para leerlo y recién ahí se abre el formulario.
    const reply = 'Dale. Para que la rutina sirva de verdad te hago unas preguntas cortas: deporte, posición, temporada, días y si algo te molesta. Tu peso, edad y cargas ya los sé.';
    a.setState(s => ({ nvStarted: true, chat: [...s.chat, { from: 'me', t: q }], novaTyping: true }));
    clearTimeout(a._rtOpen); clearTimeout(a._rtSay);
    a._rtSay = setTimeout(() => {
      a.setState(s => ({ novaTyping: false, chat: [...s.chat, { from: 'nova', t: reply }], chatTyped: 0 }));
      const typing = reply.split(' ').length * 42 + 550;
      a._rtOpen = setTimeout(() => { if (a.state.screen === 'nova' && a.state.b === 'off') a.openRoutine(); }, typing + 1800);
    }, 1100);
    return true;
  };
  a.generate = async () => {
    const S = a.state, prof = profOf(S);
    const ans = RT.normalize(S.bAns || RT.defaultAnswers(prof), prof);
    a.setState({ b: 'gen', bStep: 0, bAns: ans, bRt: null, bWhy: null });
    await tick(450);
    const rt = RT.buildRoutine(ans, prof, rmCtx, 0);
    a.setState({ bStep: 1, bRt: rt });
    await tick(450);
    a.setState({ bStep: 2 });
    await tick(450);
    a.setState({ bStep: 3 });
    // Nova revisa y explica. Si tarda o no hay conexión, queda la explicación de las reglas.
    const V = window.VELO;
    const why = V && V.nova && V.nova.routine ? await Promise.race([V.nova.routine(RT.summary(rt, prof)), tick(15000).then(() => null)]) : null;
    if (a.state.b !== 'gen') return; // cerró el formulario mientras tanto
    a.setState({ bStep: 4, bWhy: why });
    await tick(350);
    a.setState({ b: 'result' });
  };
  a.saveRoutine = () => {
    const S = a.state, now = Date.now();
    const dow = (new Date(now).getDay() + 6) % 7;
    const ans = RT.normalize(S.bAns, profOf(S));
    const routine = { v: 2, mode: ans.mode, focus: ans.focus, pos: ans.pos, season: ans.season, match: ans.match, field: ans.field, days: ans.days, mins: ans.mins, prio: ans.prio, inj: ans.inj, eq: ans.eq, weeks: ans.weeks,
      // De lunes a miércoles arranca esta semana; de jueves en adelante, el lunes que viene.
      start: startOfDay(now) - dow * DAY + (dow >= 3 ? 7 * DAY : 0), why: String(S.bWhy || '').slice(0, 600) };
    // Queda también en "Tus rutinas" (Entrenar), para volver a elegirla después.
    const rt = RT.buildRoutine(routine, profOf(S), rmCtx, 0);
    routine.id = 'r' + now.toString(36); routine.name = rt.title;
    a.setState({ b: 'off', nvTab: 'plan', savedToast: true });
    clearTimeout(a.st); a.st = setTimeout(() => a.setState({ savedToast: false }), 2600);
    commitRoutines(a, [routine, ...listOf(a.state)], routine);
  };

  // ── Tus rutinas (Entrenar): elegir, borrar y crear una personalizada ──
  a.rtOpen = () => a.setState({ rtSheet: 'pick' });
  a.rtClose = () => a.setState({ rtSheet: 'off' });
  a.rtUse = id => { const r = listOf(a.state).find(x => x.id === id) || null; commitRoutines(a, listOf(a.state), r); a.setState({ rtSheet: 'off' }); };
  a.rtDelete = id => { const S = a.state, list = listOf(S).filter(x => x.id !== id); commitRoutines(a, list, S.routine && S.routine.id === id ? null : S.routine); };
  a.rtNew = () => a.setState({ rtSheet: 'edit', rtEdit: { kind: 'custom', id: null, name: '', weeks: 6, plan: [] }, rtAdd: -1 });
  a.rtEditOf = id => { const r = listOf(a.state).find(x => x.id === id); if (r && r.kind === 'custom') a.setState({ rtSheet: 'edit', rtEdit: JSON.parse(JSON.stringify(r)), rtAdd: -1 }); };
  a.rtSaveCustom = () => {
    const S = a.state, e = S.rtEdit, now = Date.now(), dow = (new Date(now).getDay() + 6) % 7;
    const plan = (e.plan || []).filter(d => d.items && d.items.length);
    if (!plan.length) return;
    const r = { ...e, plan, id: e.id || 'c' + now.toString(36), name: (e.name || '').trim() || 'Mi rutina', start: e.start || startOfDay(now) - dow * DAY + (dow >= 3 ? 7 * DAY : 0) };
    const list = listOf(S).filter(x => x.id !== r.id);
    commitRoutines(a, [r, ...list], r);
    a.setState({ rtSheet: 'off', rtEdit: null });
  };
}

// Rutinas guardadas (hasta 8, la más nueva primero). La vieja rutina única se suma sola.
const MAX_ROUTINES = 8;
function listOf(S) {
  const list = Array.isArray(S.routines) ? S.routines.filter(Boolean) : [];
  const cur = S.routine;
  if (cur && !cur.id) { const r = { ...asV2(cur), id: 'r0', name: (routineNow({ ...S, routine: cur }) || {}).title || 'Mi rutina' }; if (!list.some(x => x.id === 'r0')) list.unshift(r); }
  return list;
}
function commitRoutines(a, list, active) {
  const routines = list.slice(0, MAX_ROUTINES);
  const routine = active ? routines.find(x => x.id === active.id) || active : null;
  a.setState({ routines, routine });
  if (realMode()) {
    setTimeout(() => data.saveProfile({ ...a.profile(), routine, routines }), 0);
    a._velPlanSig = null; setTimeout(() => real.syncPlan(true), 0);
  }
}

// Valores de la hoja "Tus rutinas" y del editor de rutina personalizada.
function routineSheetVals(out, a) {
  const S = a.state, list = listOf(S), active = S.routine && (S.routine.id || 'r0');
  const rtA = routineNow(S);
  out.rtName = rtA ? rtA.title : 'Automática · según tu perfil';
  out.rtOpen = () => a.rtOpen(); out.rtClose = () => a.rtClose();
  out.rtSheetOn = S.rtSheet === 'pick' || S.rtSheet === 'edit';
  out.rtPick = S.rtSheet === 'pick'; out.rtEditing = S.rtSheet === 'edit';
  out.rtRows = list.map(r => {
    const on = r.id === active;
    const built = (() => { try { return r.kind === 'custom' ? RT.buildCustom(r, profOf(S), rmCtx, 0) : RT.buildRoutine(r, profOf(S), rmCtx, 0); } catch { return null; } })();
    return { t: r.name || (built && built.title) || 'Rutina', d: built ? built.sub : '', on, onS: String(on), custom: r.kind === 'custom',
      bg: on ? 'rgba(238,79,47,.08)' : 'var(--surface)', bd: on ? 'rgba(238,79,47,.35)' : 'var(--line)',
      use: () => a.rtUse(r.id), del: () => a.rtDelete(r.id), edit: () => a.rtEditOf(r.id), delL: 'Borrar ' + (r.name || 'rutina'), editL: 'Editar ' + (r.name || 'rutina') };
  });
  out.rtNone = !S.routine; out.rtNoneBg = !S.routine ? 'rgba(238,79,47,.08)' : 'var(--surface)'; out.rtNoneBd = !S.routine ? 'rgba(238,79,47,.35)' : 'var(--line)';
  out.rtUseNone = () => { commitRoutines(a, list, null); a.setState({ rtSheet: 'off' }); };
  out.rtNew = () => a.rtNew();
  out.rtNova = () => { a.setState({ rtSheet: 'off' }); a.go('nova'); setTimeout(() => a.openRoutine(), 450); };
  out.rtFull = list.length >= MAX_ROUTINES;
  out.rtFullTxt = 'Tenés ' + MAX_ROUTINES + ' rutinas guardadas: borrá una para crear otra.';
  if (S.rtSheet !== 'edit' || !S.rtEdit) return;
  // Editor.
  const e = S.rtEdit, setE = p => a.setState({ rtEdit: { ...e, ...p } });
  const setPlan = plan => setE({ plan: plan.sort((x, y) => x.dow - y.dow) });
  out.rtEName = e.name || ''; out.rtENameIn = ev => setE({ name: String(ev.target.value).slice(0, 40) });
  out.rtDays = RT.DOW.map((t, dow) => {
    const on = e.plan.some(d => d.dow === dow);
    return { t, on: String(on), bg: on ? 'var(--ink)' : 'var(--surface)', c: on ? 'var(--surface)' : 'var(--ink)', bd: on ? 'var(--ink)' : 'var(--line)',
      pick: () => setPlan(on ? e.plan.filter(d => d.dow !== dow) : [...e.plan, { dow, name: 'Día ' + (e.plan.length + 1), items: [] }]) };
  });
  const exs = [...new Set([...RT.CATALOG, ...(S.exs || []).filter(x => x !== 'Dominadas')])];
  out.rtEDays = e.plan.map((d, di) => {
    const upd = items => setPlan(e.plan.map((x, j) => (j === di ? { ...x, items } : x)));
    return { d: RT.DOW[d.dow], hasItems: d.items.length > 0, empty: !d.items.length,
      items: d.items.map((x, ii) => {
        const ch = (k, dv, lo, hi) => upd(d.items.map((y, j) => (j === ii ? { ...y, [k]: Math.max(lo, Math.min(hi, (+y[k] || 0) + dv)) } : y)));
        return { n: x.n, s: x.s, r: x.r, sm: () => ch('s', -1, 1, 8), sp: () => ch('s', 1, 1, 8), rm: () => ch('r', -1, 1, 15), rp: () => ch('r', 1, 1, 15),
          del: () => upd(d.items.filter((_, j) => j !== ii)), smL: 'Menos series de ' + x.n, spL: 'Más series de ' + x.n, rmL: 'Menos reps de ' + x.n, rpL: 'Más reps de ' + x.n, delL: 'Quitar ' + x.n };
      }),
      adding: S.rtAdd === di, addOpen: () => a.setState({ rtAdd: S.rtAdd === di ? -1 : di }),
      addTxt: S.rtAdd === di ? 'Cerrar' : '+ Agregar ejercicio',
      canAdd: d.items.length < 8,
      opts: exs.filter(n => !d.items.some(x => x.n === n)).map(n => ({ t: n, pick: () => { upd([...d.items, { n, s: 3, r: 5 }]); } }))
    };
  });
  out.rtNoDays = !e.plan.length;
  const ok = e.plan.some(d => d.items.length);
  out.rtCantSave = String(!ok); out.rtSaveOp = ok ? 1 : 0.4;
  out.rtSave = () => a.rtSaveCustom();
  out.rtBack = () => a.setState({ rtSheet: 'pick', rtEdit: null });
  out.rtETitle = e.id ? 'Editar rutina' : 'Rutina personalizada';
}

// Plan del día: la sesión de la rutina de Nova si hay; si no, rota los ejercicios del
// perfil y usa la última carga de cada uno.
export function planFor(S) {
  const rt = routineNow(S);
  if (rt) return planFromRoutine(rt, S);
  const g = GOAL[(S.goals || [])[0]] || GOAL.fuerza;
  const exs = (S.exs && S.exs.length ? S.exs : DEFAULT_EXS);
  const past = sessionsOf(SETS.filter(s => s.at < startOfDay(Date.now()))).length;
  const pick = exs.length <= 3 ? exs : [0, 1, 2].map(i => exs[(past * 3 + i) % exs.length]);
  const today = SETS.filter(s => s.at >= startOfDay(Date.now()));
  const cfg = pick.map(n => ({ n, s: g.s, r: g.r, kg: lastLoad(n) ?? (S.loads && S.loads[n]) ?? 40, cut: Math.round(((CUT[n] ?? 0.5) + g.off) * 20) / 20 }));
  const done = cfg.map((c, i) => today.filter(s => s.exercise === c.n).length >= c.s ? i : -1).filter(i => i >= 0);
  const next = cfg.findIndex((_, i) => !done.includes(i));
  return { name: g.t, cfg, done, sel: next < 0 ? 0 : next };
}

// Disposición del día: la primera serie de hoy contra tu media a esa carga.
function readiness() {
  const today = SETS.filter(s => s.at >= startOfDay(Date.now()) && best(s) > 0);
  if (!today.length) return { missing: 'hoy' };
  const f = today[0];
  const prev = SETS.filter(s => s.at < startOfDay(Date.now()) && s.exercise === f.exercise && Math.abs(s.load - f.load) <= Math.max(2.5, f.load * 0.05) && s.setNo === 1 && best(s) > 0);
  if (prev.length < 2) return { missing: 'historial', ex: f.exercise, load: f.load, have: prev.length };
  const p = pct(mean(prev.map(best)), best(f));
  return { score: Math.max(0, Math.min(100, Math.round(75 + p * 3))), p, ex: f.exercise };
}

function weekStats() {
  const w = SETS.filter(s => s.at >= Date.now() - 7 * DAY);
  return { sessions: sessionsOf(w).length, series: w.length, loss: w.length ? Math.round(mean(w.map(lossOf))) : 0 };
}

function greetingFor(S) {
  const first = (S.name || '').trim().split(' ')[0];
  const hi = first ? 'Hola, ' + first + '. ' : 'Hola. ';
  const last = SETS[SETS.length - 1];
  if (!last) return { from: 'nova', t: hi + 'Soy Nova. Cuando midas tus primeras series te digo cuánto cargar y cuándo cortar.' };
  // Con señales de fatiga, Nova arranca por ahí (con cuidado) y no por la carga.
  const f = fatigue(SETS);
  if (f.level !== 'ok') return { from: 'nova', t: hi + 'Antes de cargar, te cuento algo: ' + f.signals[0].text.charAt(0).toLowerCase() + f.signals[0].text.slice(1) + ' ' + f.advice + ' ¿Cómo venís durmiendo?', k: { atento: 'Hoy −5 a 10 %', descanso: 'Descanso 1–2 días', descarga: 'Semana de descarga' }[f.level] };
  const ses = sessionsOf(SETS)[sessionsOf(SETS).length - 1].filter(s => s.exercise === last.exercise);
  return { from: 'nova', t: hi + 'Tu última sesión de ' + last.exercise.toLowerCase() + ' fue a ' + fk(last.load) + ' kg, con ' + Math.round(mean(ses.map(lossOf))) + '% de caída media. ¿Qué entrenamos hoy?', k: fk(last.load) + ' kg · ' + last.exercise.toLowerCase() };
}

// Perfil en blanco para una cuenta nueva (sin "Martina" ni sus cargas).
// Beta sin pagos (RevenueCat apagado): todo abierto como Pro, igual que el servidor
// (NOVA_BETA). Se apaga solo al poner RC.enabled = true en payments.js.
const beta = () => (RC.enabled ? {} : { pro: true, plan: 'pro' });
const BLANK = { name: '', role: 'atleta', goals: ['fuerza'], level: 'inter', exs: DEFAULT_EXS.slice(), custom: [], loads: { 'Sentadilla': 60, 'Press banca': 40, 'Peso muerto': 80 }, week: [0, 2, 4], bw: 70, hgt: 172, age: 25, unit: 'kg', remind: true, routine: null };

// ── Enganches con la app ──
export const real = {
  draft: onboardingDraft,
  active: realMode,
  // Para pruebas y depuración: el componente de la app.
  app: () => app,

  async attach(a) {
    app = a;
    // Rutinas con el motor de reglas + Nova, también en el demo.
    installBuilder(a);
    if (!realMode()) return;
    const origPro = a.activatePro.bind(a);
    a.activatePro = plan => { origPro(plan); a.setState({ chat: [greetingFor(a.state)] }); };
    a.authFail = e => a.setState({ authErr: (e && e.message) || 'No pudimos ingresar. Probá de nuevo.' });
    a.setState({ ...BLANK, ...beta(), chat: [greetingFor(BLANK)], read: {} });
    // El estado del sensor (conectado, se cortó…) se ve al instante en Inicio y en vivo.
    sensor.onState(() => a.setState({}));
    await refresh();
  },

  // Al terminar de cargar el perfil de la cuenta.
  profileLoaded(p) { if (app && realMode()) app.setState({ chat: [greetingFor({ ...app.state, ...p })] }); this.syncPlan(true); },

  onScreen(s) {
    if (!app) return;
    if (!realMode()) { if (s === 'home' || s === 'train') this.syncPlan(); return; }
    // Borrador del registro inicial: si Safari recarga la pestaña a mitad de camino
    // (pasa al cambiar de app en el iPhone), se retoma donde estaba (index.js → boot).
    if (ONBOARDING.includes(s)) { try { localStorage.setItem('velo.draft', JSON.stringify({ uid: uidNow(), screen: s, p: app.profile() })); } catch {} }
    if (s === 'ready' || s === 'home') { try { localStorage.removeItem('velo.draft'); } catch {} }
    if (s === 'welcome') { app._velPlanSig = null; app.setState({ ...BLANK, ...beta(), chat: [greetingFor(BLANK)], read: {}, authErr: null, sensor: null }); }
    if (s === 'home' || s === 'train') this.syncPlan();
    if (s === 'auth') app.setState({ authErr: null });
    if (s === 'pair') { clearTimeout(app._velPairT); app._velPairAt = Date.now(); app._velPairT = setTimeout(() => app.setState({}), 16000); }
  },

  // Arma el plan del día una vez por día (o si cambió el perfil). No pisa
  // los ajustes que el atleta hizo con los botones +/−.
  syncPlan(force) {
    const S = app.state;
    const sig = dayKey(Date.now()) + '|' + (S.exs || []).join(',') + '|' + (S.goals || []).join(',') + '|' + JSON.stringify(S.loads || {}) + '|' + JSON.stringify(S.routine || null);
    if (!force && app._velPlanSig === sig) return;
    if (['live', 'summary'].includes(S.screen)) return;
    app._velPlanSig = sig;
    const p = planFor(S);
    const f = p.cfg[0];
    app.setState({ tCfg: p.cfg, tDone: p.done, tSel: p.sel, cur: { ...p.cfg[p.sel] }, fCfg: { n: f.n, s: 3, r: 6, kg: f.kg, cut: f.cut }, pgEx: S.pgEx });
  },

  patch(out, a) {
    // Textos legales de verdad (src/velo/legal.js), también en el demo.
    if (a.state.screen === 'legal') out.legalSecs = [TERMS, PRIVACY][a.state.legalTab] || TERMS;
    if (a.state.screen === 'legal') { const [y, m, d] = LEGAL_V.split('-').map(Number); out.legalDate = d + ' de ' + MES[m - 1] + ' de ' + y; }
    // Apple (3.1.2) y la Ley 17.250: decir antes de comprar que se renueva sola y cómo cancelar.
    if (a.state.screen === 'premium' && out.finePrint) out.finePrint += ' Se renueva sola; cancelás cuando quieras en Ajustes › tu nombre › Suscripciones, hasta 24 h antes.';
    out.booting = !!window.__veloBooting && a.state.screen === 'welcome';
    // Rutinas (formulario, resultado y semana en Nova › Plan), también en el demo.
    if (a.state.screen === 'train') routineSheetVals(out, a);
    if (a.state.screen === 'nova') {
      builderVals(out, a);
      const rtw = routineNow(a.state);
      if (rtw) routineWeek(out, rtw, Date.now());
    }
    if (!realMode()) {
      const S = a.state, c = S.tCfg[S.tDone.length >= S.tCfg.length ? 0 : S.tSel];
      if (c) { out.homeEx = c.n; out.homeSets = String(c.s); out.homeKg = fk(c.kg); out.homeCut = f2(c.cut); out.homeVLabel = 'Velocidad media a ' + fk(c.kg) + ' kg'; }
      if (a._velPlanSig) { out.planName = planFor(S).name; const nS = S.tCfg.reduce((x, y) => x + y.s, 0); out.planMeta = S.tCfg.length + ' ejercicios · ' + nS + ' series · ~' + Math.max(15, Math.round(nS * 3.5 / 5) * 5) + ' min'; }
      return out;
    }
    app = a;
    const S = a.state, now = Date.now();
    const first = (S.name || '').trim().split(' ')[0];
    const plan = planFor(S);

    // Nombre
    out.nameOr = first || 'atleta';
    out.initials = (first || '·').slice(0, 2).toUpperCase();
    // Saludo del chat vacío de Nova, según la hora (el diseño trae "Buen día, Martina.").
    const h = new Date().getHours();
    const hello = h >= 5 && h < 13 ? 'Buen día' : h >= 13 && h < 20 ? 'Buenas tardes' : 'Buenas noches';
    out.nvHello = hello + (first ? ', ' + first : '') + '.';
    out.homeHello = hello + (first ? ', ' + first : '');

    // Errores de ingreso (el diseño no tiene pantalla de error: va en el subtítulo)
    if (S.screen === 'auth' && S.authErr) out.authSub = S.authErr;
    if (S.screen === 'auth') { const oe = out.onEmail, op = out.onPw; out.onEmail = e => { if (S.authErr) a.setState({ authErr: null }); oe(e); }; out.onPw = e => { if (S.authErr) a.setState({ authErr: null }); op(e); }; }

    // Fechas
    out.homeDate = longDate(now);
    out.trainDate = longDate(now);
    out.exFile = 'boost-' + ['ultimo-mes', '3-meses', 'todo'][S.exRange] + '-' + new Date(now).toISOString().slice(0, 10) + '.' + S.exFmt;

    // ── Inicio y Entrenar ──
    const c = S.tCfg[S.tDone.length >= S.tCfg.length ? 0 : S.tSel] || plan.cfg[0];
    out.homeEx = c.n; out.homeSets = String(c.s); out.homeKg = fk(c.kg); out.homeCut = f2(c.cut);
    const vc = velCard(c.n, S, now);
    out.homeVLabel = vc.label; out.homeVDelta = vc.delta;
    out.homeNumTxt = vc.v != null ? f2(vc.v * S.homeNum) : '—';
    // Sin mediciones no hay número ni barras: se dice qué falta.
    out.homeHasV = vc.v != null; out.homeNoV = vc.v == null;
    out.homeNoVTxt = 'Todavía no hay mediciones de ' + c.n.toLowerCase() + '. Tu velocidad aparece acá después de tu primera sesión con el sensor.';
    out.trend = vc.series.slice(-8).map((p, i, arr) => ({ h: S.ready ? Math.max(6, (p.v - vc.min) / (vc.max - vc.min || 1) * 90 + 10) + '%' : '3%', c: i === arr.length - 1 ? ACC : GRAY, sh: 'none' }));
    out.planName = plan.name;
    // Lo que la rutina de hoy tiene sin sensor (sprints, saltos, prevención).
    const ex = plan.extras || [];
    out.hasExtras = ex.some(x => x.n !== 'Entrada en calor'); // solo la entrada en calor no merece la caja
    out.extrasHead = plan.today === false ? 'Tu próxima sesión es el ' + RT.DOW[plan.dow].toLowerCase() + '. Incluye, sin sensor:' : 'Además hoy, sin sensor';
    out.tExtras = ex.map(x => ({ n: x.n, x: x.x, note: x.note, hasNote: !!x.note }));
    const nSets = S.tCfg.reduce((x, y) => x + y.s, 0);
    out.planMeta = S.tCfg.length + ' ejercicios · ' + nSets + ' series · ~' + Math.max(15, Math.round(nSets * 3.5 / 5) * 5) + ' min';
    // Sugerencia Pro: solo si la última vez sobraron reps (≥6 antes del corte).
    // Se mira la carga de trabajo de la última sesión, no una serie de tope suelta.
    const cfg = a.cfg();
    const lastSes = sessionsOf(byEx(cfg.n)).pop();
    const work = lastLoad(cfg.n);
    const atWork = lastSes ? lastSes.filter(s => s.load === work) : [];
    const topReps = atWork.length ? Math.max(...atWork.map(s => s.reps.length)) : 0;
    const base = S.sugOk ? cfg.kg - 2.5 : cfg.kg;
    const up = topReps >= 6 && work != null && work >= base;
    // Con fatiga (descanso o descarga) no se sugiere subir: primero recuperarse.
    const tired = ['descanso', 'descarga'].includes(fatigue(SETS).level);
    out.showSug = out.showSug && !!up && !tired;
    if (up && !S.sugOk) out.sugTxt = 'La última vez hiciste ' + topReps + ' reps a ' + fk(work) + ' kg antes del corte. Probá ' + fk(cfg.kg + 2.5) + ' kg.';

    // ── Sensor ──
    const st = sensor.status(), on = sensor.connected();
    const saved = sensor.saved();
    out.sensorDot = on ? '#2E9E5B' : '#B5B0A9';
    // En palabras, no solo un color: ¿está listo para medir?
    const sst = sensor.state();
    out.sensorLbl = !isNative() ? 'Demo' : on ? 'Conectado' : sst === 'connecting' ? 'Buscando…' : sst === 'lost' ? 'Desconectado' : saved ? 'Sin conectar' : 'Sin sensor';
    if (isNative() && !on && sst === 'lost') out.sensorDot = '#E4441F';
    out.sensorBatt = on && st ? st.batteryPct + '%' : on ? 'OK' : '—';
    const sid = (S.sensor && S.sensor.shortId) || (saved && saved.shortId);
    out.pairDevTxt = 'ID ' + (sid || '—') + (st ? ' · Batería ' + st.batteryPct + '%' : '');
    // Varios sensores cerca (gimnasio): se elige el de mejor señal y se pide confirmar el ID.
    if (S.screen === 'pair' && S.pair === 'found' && S.sensor && S.sensor.others > 0) out.pairSub = 'Hay ' + (S.sensor.others + 1) + ' sensores cerca. Revisá que el ID ' + S.sensor.shortId + ' sea el que figura en el tuyo antes de conectar.';
    if (S.screen === 'pair' && S.pair === 'scanning' && a._velPairAt && now - a._velPairAt > 15000) out.pairSub = 'No aparece. Prendelo, acercalo al teléfono y activá el Bluetooth.';
    // En el navegador (app.getboost.fit) no hay Bluetooth: el prototipo simulaba "Sensor
    // encontrado" y reps de mentira. Se dice la verdad y se sigue sin sensor.
    // Beta sin pagos (todos Pro): al terminar el registro no se muestra la oferta de
    // "7 días gratis" de algo que ya tiene; va directo a Inicio.
    if (!RC.enabled && S.screen === 'ready') out.toPremium = () => a.go('home');
    // "Escribinos": el diseño marcaba "Recibimos tu mensaje" sin esperar; si la nube lo
    // rechazaba (email sin confirmar, 3 por día) igual decía enviado. Ahora espera.
    if (S.screen === 'support') out.supSend = () => {
      if (S.supMsg.trim().length < 10 || S.supSent || a._supBusy) return;
      a._supBusy = true;
      data.sendSupport({ topic: S.supTopic, message: S.supMsg, email: S.email })
        .then(() => a.setState({ supSent: true, supMsg: '' }))
        .catch(e => { console.warn('[VELO soporte]', e); alert(e.message || 'No se pudo enviar. Probá de nuevo.'); })
        .finally(() => { a._supBusy = false; });
    };
    if (!RC.enabled && S.screen === 'premium' && S.pro) { out.buyTxt = 'Ya tenés Pro gratis en la beta'; out.buy = () => a.go('home'); out.finePrint = 'Durante la beta, Nova y todo Pro son gratis. Cuando salga la app te avisamos antes de cobrar nada.'; }
    if (!isNative()) {
      if (S.screen === 'pair') {
        out.pairTitle = 'El sensor va con la app';
        out.pairSub = 'En el navegador no hay Bluetooth: para medir, usá la app de iPhone.';
        out.pairShowDevice = true; out.pairConnecting = false; out.pairConnected = false;
        out.pairDevTxt = 'Se conecta desde la app de iPhone';
        out.connectLabel = 'Seguir';
        out.connect = () => a.go('ready');
        out.pairLater = false; // ya hay un solo botón para seguir
      }
      if (S.screen === 'live' && out.livePill === 'Conectado') { out.livePill = 'Demo'; out.liveDot = '#B5B0A9'; }
      if (S.screen === 'live' && !(S.reps || []).length) { out.msgTitle = 'Modo demostración'; out.msgBody = 'En el navegador no hay sensor: estas reps son de ejemplo y no se guardan.'; }
    }
    if (S.forget !== 2) {
      out.devStatus = on ? 'Conectado · ID ' + (sid || '—') : sid ? 'Sin conexión · ID ' + sid : 'Sin emparejar';
      out.devDot = on ? '#2E9E5B' : '#B5B0A9';
      out.devStats = [{ k: 'Batería', v: st ? st.batteryPct + '%' : '—', bl: 'none' }, { k: 'Firmware', v: st ? st.fwVersion : '—', bl: '1px solid rgba(0,0,0,.08)' }, { k: 'Señal', v: on ? 'OK' : '—', bl: '1px solid rgba(0,0,0,.08)' }];
    }
    patchRow(out, 'Sensor BOOST', S.forget === 2 || !sid ? 'Sin sensor' : on && st ? st.batteryPct + '%' : on ? 'Conectado' : 'Sin conexión');
    // En vivo con sensor real: la serie arranca cuando el sensor confirma (design run()).
    // Si no pudo arrancar o se cortó, se explica acá y "Seguir" reintenta (reconecta solo).
    if (S.screen === 'live' && sensor.isReal()) {
      if (S.sensorErr) { out.msgTitle = sst === 'lost' || !on ? 'Sensor desconectado' : 'No arrancó la serie'; out.msgBody = S.sensorErr; }
      else if (!(S.reps || []).length && S.phase !== 'lifting') { out.msgTitle = 'Barra quieta 2 segundos'; out.msgBody = 'El sensor se calibra solo al empezar. La serie se corta cuando una rep baja de ' + f2(S.cur.cut) + ' m/s.'; }
      if (!on && out.livePill === 'Conectado') { out.livePill = 'Sin sensor'; out.liveDot = '#E4441F'; }
    }
    // Preparar el sensor (registro): con sensor real no se promete una calibración que no
    // pasó. Se confirma que está conectado y midiendo; la calibración la hace en cada serie.
    if (S.screen === 'calibrate' && sensor.isReal()) {
      const cs = S.calState;
      out.calLabel = cs === 'done' ? 'Sensor listo' : cs === 'running' ? 'Revisando el sensor…' : 'Listo para revisar';
      out.calChecks = [['Sensor conectado', 0.2], ['Midiendo bien el movimiento', 0.55], ['Se calibra solo al empezar cada serie', 0.95]].map(([t, k]) => { const ok = S.cal >= k; return { t, color: ok ? '#111' : '#8A8680', bg: ok ? '#EE4F2F' : 'rgba(0,0,0,.12)' }; });
    }

    // ── Progreso ──
    Object.assign(out, progress(S, now, a));

    // ── Exportar ──
    const exFrom = now - [30, 90, 36500][S.exRange] * DAY;
    const nReps = SETS.filter(s => s.at >= exFrom).reduce((x, s) => x + s.reps.length, 0);
    const kb = nReps * (S.exFmt === 'csv' ? 0.05 : 0.12);
    out.exSize = '≈ ' + nReps + ' reps · ' + (kb >= 1000 ? fk((kb / 1000).toFixed(1)) + ' MB' : Math.max(1, Math.round(kb)) + ' KB');

    // ── Avisos ──
    Object.assign(out, notifs(S, now, a));

    // ── Entrenador (Élite): todavía sin back-end ──
    out.athletes = [];
    out.coSub = 'Todavía no tenés atletas';
    out.coInviteTxt = S.invite ? 'Muy pronto: invitá atletas con un código' : 'Invitar atleta';
    patchRow(out, 'Mis atletas', out.coLocked ? 'Para entrenadores' : '0 atletas');

    // ── Nova ──
    const n = sessionsOf(SETS).length;
    out.nvBasis = n ? 'Hoy · basado en ' + n + (n === 1 ? ' sesión' : ' sesiones') : 'Hoy · todavía sin sesiones';
    if (!n && !S.novaTyping) out.novaStatus = 'En línea';
    // Disposición: sin datos suficientes no hay número (un 0 parecería un día malísimo).
    const rdx = readiness(), rd = rdx && rdx.score != null ? rdx : null;
    const score = rd ? rd.score : 0;
    out.readyOff = 226.2 * (1 - score / 100 * S.readyAnim);
    out.readyNum = rd ? Math.round(score * S.readyAnim) : '—';
    out.readyOf = rd ? 'de 100' : '';
    out.readyTitle = !rd ? 'Todavía no calculada' : score >= 75 ? 'Alta · buen día para cargar' : score >= 60 ? 'Media · mantené las cargas' : 'Baja · día para bajar';
    out.readySubT = rd ? 'Primera serie de ' + rd.ex.toLowerCase() + ' ' + Math.abs(rd.p) + '% ' + (rd.p >= 0 ? 'más rápida' : 'más lenta') + ' que tu media.'
      : rdx.missing === 'hoy' ? 'Hace falta tu primera serie de hoy y 2 sesiones previas con la misma carga.'
      : 'Falta historial: necesita 2 primeras series anteriores de ' + rdx.ex.toLowerCase() + ' a ' + fk(rdx.load) + ' kg (tenés ' + rdx.have + ').';
    const w = weekStats();
    // "Series" y no "Volumen": en Progreso, volumen es kg × reps (en toneladas).
    out.nvStats = [{ k: 'Sesiones', v: String(w.sessions), d: 'esta semana', dc: 'rgba(242,238,233,.5)' }, { k: 'Series', v: String(w.series), d: 'esta semana', dc: 'rgba(242,238,233,.5)' }, { k: 'Pérdida', v: w.series ? w.loss + '%' : '—', d: 'media · semana', dc: 'rgba(242,238,233,.5)' }];
    const nv = velCard(c.n, S, now);
    out.nvVLabel = nv.label; out.nvVDelta = nv.delta; out.nvVNum = nv.v != null ? f2(nv.v) : '—';
    Object.assign(out, spark(nv.series));
    // Nova no dice que está "leyendo tus series" si no hay ninguna.
    if (!n) out.nvThinkTxt = 'Pensando…';
    out.nvFinds = finds(S, a);
    out.novaTip = tired ? fatigue(SETS).title + '. ' + fatigue(SETS).advice : rd ? out.readySubT + (score >= 75 ? ' Buen día para subir.' : score < 60 ? ' Bajá un poco la carga.' : '') : up ? 'La última vez hiciste ' + topReps + ' reps a ' + fk(work) + ' kg en ' + cfg.n.toLowerCase() + '. Probá ' + fk(cfg.kg + 2.5) + ' kg.' : 'Medí tus series y Nova te dice cuánto cargar en cada una.';
    if (!S.routine) {
      out.nvWeek = weekPlan(S, now);
      // Qué es plantilla y qué sale de lo medido: sin sesiones, es la semana sugerida por tu objetivo.
      out.planTitle = n ? 'Tu semana' : 'Semana sugerida';
      out.planSub = (S.week || []).length + ' días · ' + (n ? 'cargas de tus series' : 'según tu objetivo');
    }
    // Con rutina de Nova, la semana la arma routineWeek() (arriba, también en el demo).

    // ── Restaurar compras: el email de la cuenta BOOST (Apple no da el Apple ID) ──
    const u = enabled() ? firebase().auth.currentUser : null;
    out.rsAccount = (u && u.email) || S.email || 'tu cuenta BOOST';
    return out;
  }
};

function patchRow(out, title, v) {
  for (const sec of out.pfSections || []) for (const r of sec.rows) if (r.t === title) r.v = v;
}

function velCard(ex, S, now) {
  const ref = refLoad(ex, S.loads);
  const all = ref ? velSeries(ex, ref) : [];
  const recent = all.filter(p => p.at >= now - 28 * DAY);
  const v = all.length ? all[all.length - 1].v : null;
  const vs = all.map(p => p.v);
  return {
    ref, v, series: all,
    label: ref ? 'Velocidad media a ' + fk(ref) + ' kg' : 'Velocidad media',
    delta: recent.length >= 2 ? signPct(pct(recent[0].v, recent[recent.length - 1].v)) + ' · 4 sem' : all.length ? 'Nuevo' : 'Sin datos',
    min: vs.length ? Math.min(...vs) - 0.02 : 0, max: vs.length ? Math.max(...vs) + 0.02 : 1
  };
}

function spark(series) {
  const pts = series.slice(-8);
  // Sin 2 puntos no hay curva: nada de líneas decorativas que parezcan una medición.
  if (pts.length < 2) return { nvHasSpark: false, nvNoSpark: true, nvNoSparkTxt: pts.length ? 'Una sesión medida a esta carga. Con la próxima ves la tendencia.' : 'Todavía no hay suficientes datos: medí 2 sesiones a la misma carga.' };
  const vs = pts.map(p => p.v), mn = Math.min(...vs), mx = Math.max(...vs);
  const xy = pts.map((p, i) => [i * 320 / (pts.length - 1), 60 - (p.v - mn) / (mx - mn || 1) * 48]);
  const d = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(0) + ' ' + p[1].toFixed(0)).join(' ');
  const L = xy[xy.length - 1];
  return { nvHasSpark: true, nvNoSpark: false, nvSpark: d, nvSparkArea: d + ' L320 70 L0 70 Z', nvDotX: Math.min(316, L[0]), nvDotY: L[1] };
}

function progress(S, now, a) {
  const withData = [...new Set(SETS.map(s => s.exercise))].sort((x, y) => byEx(y).length - byEx(x).length);
  const list = (withData.length ? withData : (S.exs && S.exs.length ? S.exs : DEFAULT_EXS)).slice(0, 4);
  const ex = list.includes(S.pgEx) ? S.pgEx : list[0];
  const days = [28, 91, 365][S.pgRange], from = now - days * DAY;
  const bt = i => i ? '1px solid rgba(0,0,0,.06)' : 'none';
  const o = {};
  o.pgExs = list.map(t => { const on = t === ex; return { t, bg: on ? '#111' : 'rgba(255,255,255,.7)', c: on ? '#fff' : '#111', border: on ? '#111' : 'rgba(0,0,0,.06)', pick: () => a.setState({ pgEx: t }) }; });

  // 1RM estimado al cierre de cada sesión del período
  const ses = sessionsOf(byEx(ex).filter(s => s.at >= from));
  const rms = ses.map(ss => ({ at: ss[ss.length - 1].at, r: e1rm(ex, ss[ss.length - 1].at) })).filter(x => x.r).map(x => ({ at: x.at, kg: x.r.kg }));
  const rm = rms.length ? rms[rms.length - 1].kg : null;
  const pts = rms.length >= 2 ? rms.map(x => x.kg) : rms.length === 1 ? [rm, rm] : [0, 0];
  const N = pts.length, mn = Math.min(...pts), mx = Math.max(...pts);
  const xy = pts.map((v, i) => [8 + i * 302 / (N - 1), rms.length >= 2 && mx > mn ? 100 - (v - mn) / (mx - mn) * 84 : 58]);
  const line = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  o.pgRm = rm != null ? fk(rm) : '—';
  o.pgDelta = rms.length >= 2 ? ((rm - rms[0].kg) >= 0 ? '+' : '−') + fk(Math.abs(r05(rm - rms[0].kg))) + ' kg' : rms.length ? 'Nuevo' : '—';
  o.pgLine = line; o.pgArea = rms.length >= 2 ? line + ' L310 112 L8 112 Z' : ''; o.pgLx = xy[N - 1][0]; o.pgLy = xy[N - 1][1];
  // Sin estimación: estado vacío que explica qué falta (no una línea plana en cero).
  o.pgHasLine = rms.length > 0; o.pgNoLine = !rms.length;
  o.pgNoLineTxt = byEx(ex).length ? 'Para estimar tu 1RM de ' + ex.toLowerCase() + ' hacen falta series a 2 cargas distintas en los últimos 60 días.' : 'Todavía no hay series de ' + ex.toLowerCase() + '.';
  if (rms.length === 1) { o.pgLine = 'M' + xy[0][0].toFixed(1) + ' 58'; o.pgLx = 159; }
  const fd = new Date(from);
  o.pgFrom = S.pgRange === 2 ? MES3[fd.getMonth()] + ' ' + fd.getFullYear() : fd.getDate() + ' ' + MES3[fd.getMonth()];

  // Totales del período, todos los ejercicios
  const inR = SETS.filter(s => s.at >= from);
  const vol = inR.reduce((x, s) => x + s.load * s.reps.length, 0) / 1000;
  o.pgStats = [{ k: 'Sesiones', v: String(sessionsOf(inR).length), u: '', bl: 'none' }, { k: 'Series', v: String(inR.length), u: '', bl: '1px solid rgba(0,0,0,.08)' }, { k: 'Volumen', v: fk(vol.toFixed(1)), u: 't', bl: '1px solid rgba(0,0,0,.08)' }];

  // Velocidad a la carga de referencia
  const ref = refLoad(ex, S.loads);
  const vser = ref ? velSeries(ex, ref, from) : [];
  o.pgRef = fk(ref || 0);
  o.pgV = vser.length ? f2(vser[vser.length - 1].v) : '—';
  o.pgVd = vser.length >= 2 ? signPct(pct(vser[0].v, vser[vser.length - 1].v)) : '—';

  // Récords (de todo el historial del ejercicio)
  const mine = byEx(ex);
  const atRef = mine.filter(s => Math.abs(s.load - ref) <= 1 && best(s) > 0);
  const bRef = atRef.reduce((m, s) => (!m || best(s) > best(m) ? s : m), null);
  const longest = mine.reduce((m, s) => (!m || s.reps.length > m.reps.length ? s : m), null);
  o.pgRecs = [
    { t: '1RM estimado', v: rm != null ? fk(rm) + ' kg' : '—', d: rms.length ? dateShort(rms[rms.length - 1].at) : '' },
    { t: 'Mejor rep a ' + fk(ref || 0) + ' kg', v: bRef ? f2(best(bRef)) + ' m/s' : '—', d: bRef ? dateShort(bRef.at) : '' },
    { t: 'Serie más larga', v: longest ? longest.reps.length + ' reps' : '—', d: longest ? dateShort(longest.at) : '' }
  ].map((r, i) => ({ ...r, bt: bt(i) }));

  // Historial: últimas 4 sesiones del ejercicio
  o.pgHist = sessionsOf(mine).slice(-4).reverse().map((ss, i) => {
    const d = new Date(ss[0].at);
    return { dw: DIA3[d.getDay()], dn: String(d.getDate()), t: ex, meta: ss.length + (ss.length === 1 ? ' serie' : ' series') + ' · ' + fk(Math.max(...ss.map(s => s.load))) + ' kg', v: f2(mean(ss.map(best))), bt: bt(i) };
  });
  return o;
}

const IC_REC = 'M8 4h8v5a4 4 0 01-8 0zM8 6H5.5a2.5 2.5 0 002.8 3.6M16 6h2.5a2.5 2.5 0 01-2.8 3.6M12 13v4M9 20h6';
const IC_BAT = 'M4 8.5h13a1.5 1.5 0 011.5 1.5v4a1.5 1.5 0 01-1.5 1.5H4A1.5 1.5 0 012.5 14v-4A1.5 1.5 0 014 8.5zM21 11v2M5.5 11v2';
const IC_WEEK = 'M5 20v-7M11 20V6M17 20v-10M3 20h18';

function notifs(S, now, a) {
  const all = [];
  // Récord de 1RM estimado en los últimos 7 días
  for (const ex of new Set(SETS.map(s => s.exercise))) {
    const ses = sessionsOf(byEx(ex));
    const rms = ses.map(ss => ({ at: ss[ss.length - 1].at, r: e1rm(ex, ss[ss.length - 1].at) })).filter(x => x.r);
    if (rms.length < 2) continue;
    const last = rms[rms.length - 1], prevMax = Math.max(...rms.slice(0, -1).map(x => x.r.kg));
    if (last.at >= now - 7 * DAY && last.r.kg > prevMax) all.push({ id: 'rec-' + ex, k: 'me', av: '', ic: IC_REC, title: 'Nuevo récord en ' + ex.toLowerCase(), body: 'Tu 1RM estimado subió a ' + fk(last.r.kg) + ' kg (antes ' + fk(prevMax) + ' kg).', time: when(last.at, now), at: last.at, unread: now - last.at < 2 * DAY, hot: true });
  }
  const st = sensor.status();
  if (st && st.batteryPct <= 20) all.push({ id: 'bat', k: 'me', av: '', ic: IC_BAT, title: 'Batería del sensor al ' + st.batteryPct + '%', body: 'Cargalo antes de tu próxima sesión.', time: 'ahora', at: now, unread: true });
  const w = weekStats();
  if (w.series) all.push({ id: 'week', k: 'me', av: '', ic: IC_WEEK, title: 'Tu semana', body: w.sessions + (w.sessions === 1 ? ' sesión' : ' sesiones') + ' · ' + w.series + ' series · pérdida media ' + w.loss + '%.', time: 'Hoy', at: now - 1, unread: false });
  if (!all.length) all.push({ id: 'hola', k: 'me', av: '', ic: IC_WEEK, title: 'Todavía no hay avisos', body: 'Acá van a aparecer tus récords, el resumen de la semana y la batería del sensor.', time: '', at: now, unread: false });
  all.sort((x, y) => y.at - x.at);
  const isU = x => x.unread && !S.read[x.id];
  const list = all.filter(x => S.tab === 'todo' || x.k === 'atl').map(x => ({ ...x, hasIc: !!x.ic, dot: isU(x) ? 1 : 0, bg: isU(x) ? 'linear-gradient(180deg,#FFFFFF,#F8F7F5)' : 'linear-gradient(180deg,#F7F6F3,#F2F0ED)', avBg: x.hot ? ACC : 'linear-gradient(180deg,#F1EFEC,#E2DFDA)', avC: x.hot ? '#fff' : '#111', tap: () => a.setState(s => ({ read: { ...s.read, [x.id]: true } })) }));
  const unread = all.filter(isU).length;
  return { notifs: list, unread, hasUnread: unread > 0, readAllD: unread > 0 ? 'block' : 'none', readAll: () => a.setState(s => ({ read: { ...s.read, ...Object.fromEntries(all.map(x => [x.id, true])) } })) };
}

function finds(S, a) {
  const out = [];
  const up = { p: 'M12 19V5M6 11l6-6 6 6', c: '#7FD8A3', bg: 'rgba(60,196,122,.14)' };
  const down = { p: 'M12 5v14M6 13l6 6 6-6', c: '#FF9B75', bg: 'rgba(238,79,47,.16)' };
  const info = { p: 'M12 21a8 8 0 100-16 8 8 0 000 16zM12 9v4l2.5 1.5', c: '#F2EEE9', bg: 'rgba(255,255,255,.08)' };
  // Recuperación primero: si hay fatiga, es lo más importante de la pantalla.
  const f = fatigue(SETS);
  const tired = ['descanso', 'descarga'].includes(f.level);
  if (f.level !== 'ok') out.push({ ...down, t: f.title, d: f.signals[0].text + (f.signals.length > 1 ? ' Y ' + (f.signals.length - 1) + (f.signals.length > 2 ? ' señales más.' : ' señal más.') : ''), q: '¿Estoy sobreentrenando? ¿Qué hago esta semana?' });
  for (const ex of new Set(SETS.map(s => s.exercise))) {
    const last = sessionsOf(byEx(ex)).pop();
    const top = last.reduce((m, s) => (!m || s.reps.length > m.reps.length ? s : m), null);
    const loss = Math.round(mean(last.map(lossOf)));
    if (top.reps.length >= 6 && !tired) out.push({ ...up, t: cap(ex.toLowerCase()) + ' lista para +2,5 kg', d: top.reps.length + ' reps a ' + fk(top.load) + ' kg antes del corte', q: '¿Subo la carga en ' + ex.toLowerCase() + '?' });
    else if (loss >= 30) out.push({ ...down, t: cap(ex.toLowerCase()) + ' cae rápido', d: 'Pérdida media ' + loss + '% en tu última sesión', q: '¿Por qué pierdo tanta velocidad en ' + ex.toLowerCase() + '?' });
  }
  if (!out.length) out.push({ ...info, t: SETS.length ? 'Todo dentro de lo planificado' : 'Todavía no hay datos', d: SETS.length ? 'Seguí con las cargas del plan' : 'Nova necesita un par de sesiones', q: '¿Cuánto cargo hoy?' });
  return out.slice(0, 3).map(f => ({ ...f, ask: () => { a.setState({ nvTab: 'chat' }); if (!a.state.asked.includes(f.q)) a.ask(f.q, 'Anotado. Lo miro con tus próximas series.'); } }));
}

function weekPlan(S, now) {
  const today = new Date(now), dow = (today.getDay() + 6) % 7; // 0 = lunes, como el perfil
  const monday = startOfDay(now) - dow * DAY;
  const p = planFor(S);
  const ex = S.exs && S.exs.length ? S.exs : DEFAULT_EXS;
  return (S.week || []).map((wd, i) => {
    const t = monday + wd * DAY, isToday = wd === dow;
    const did = SETS.some(s => startOfDay(s.at) === t);
    const name = isToday ? p.cfg.map(c => c.n).join(' · ') : ex[i % ex.length];
    const c = isToday ? p.cfg[0] : { s: p.cfg[0].s, r: p.cfg[0].r, kg: lastLoad(name) ?? (S.loads && S.loads[name]) ?? 40, cut: Math.round(((CUT[name] ?? 0.5) + (GOAL[(S.goals || [])[0]] || GOAL.fuerza).off) * 20) / 20 };
    const w = { d: DIA3[(wd + 1) % 7], n: new Date(t).getDate(), t: isToday ? p.name : name, x: (isToday ? '' : c.s + '×' + c.r + ' · ') + (isToday ? name : fk(c.kg) + ' kg · corte ' + f2(c.cut)), done: did && t < startOfDay(now), today: isToday, tag: isToday ? 'Hoy' : '' };
    return { ...w, hasTag: !!w.tag, done: !!w.done, bc: w.today ? 'rgba(255,106,61,.45)' : 'rgba(255,255,255,.08)', bg: w.today ? 'rgba(238,79,47,.08)' : 'rgba(255,255,255,.05)', stBg: w.done ? '#EE4F2F' : 'transparent', stB: w.done ? '#EE4F2F' : 'rgba(255,255,255,.2)' };
  });
}
