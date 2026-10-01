// Motor de rutinas (src/velo/routine.js): reglas de seguridad y de entrenamiento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPORTS, OBJECTIVES, buildRoutine, questions, normalize, summary, sessionFor, weekOf } from '../../../src/velo/routine.js';

const prof = { level: 'inter', age: 22, bw: 80, loads: { Sentadilla: 100, 'Press banca': 70, 'Peso muerto': 120 } };
const base = { mode: 'sport', focus: 'rugby', pos: 'tercera', season: 'pre', match: 5, field: 3, days: 3, mins: 60, prio: 'contacto', inj: [], eq: 'completo', weeks: 6 };
const bars = r => r.days.flatMap(d => d.items.filter(x => x.bar));
const names = r => r.days.flatMap(d => d.items.map(x => x.n));

test('todas las combinaciones de deporte, posición, temporada y días arman una rutina válida', () => {
  let n = 0;
  for (const sp of SPORTS) for (const pos of sp.pos) for (const season of ['pre', 'in', 'off']) for (const days of [2, 3, 4, 5]) for (const mins of [45, 75]) {
    const r = buildRoutine({ ...base, focus: sp.id, pos: pos.id, season, days, mins, prio: sp.prio[0][0] }, prof, {}, 0);
    assert.ok(r.days.length >= 2, `${sp.id}/${pos.id}/${season}/${days}`);
    for (const d of r.days) {
      assert.ok(d.items.some(x => x.bar), `sin ejercicio con sensor: ${sp.id}/${pos.id}/${d.name}`);
      assert.equal(d.items[0].n, 'Entrada en calor');
      for (const x of d.items.filter(i => i.bar)) {
        assert.ok(x.s >= 2 && x.s <= 5 && x.r >= 2 && x.r <= 12, `${x.n} ${x.s}×${x.r}`);
        assert.ok(x.cut >= 0.4 && x.cut <= 1.3, `${x.n} corte ${x.cut}`);
        assert.ok(x.pct <= 90, `${x.n} ${x.pct} %`);
      }
      assert.ok(d.items.length - 1 <= (mins === 45 ? 4 : 6), `demasiados ejercicios para ${mins} min: ${d.items.length - 1}`);
    }
    assert.ok(summary(r, prof).length < 1000);
    n++;
  }
  for (const o of OBJECTIVES) buildRoutine({ mode: 'obj', focus: o.id, days: 4 }, prof, {}, 0);
  assert.ok(n > 300);
});

test('con partido: nada de gimnasio el día antes ni el día del partido, y la sesión fuerte a las 48 h', () => {
  for (const match of [0, 2, 5, 6]) for (const days of [2, 3, 4]) {
    const r = buildRoutine({ ...base, match, days, season: 'pre' }, prof, {}, 0);
    const ds = r.days.map(d => d.dow);
    assert.ok(!ds.includes(match), 'día de partido');
    assert.ok(!ds.includes((match + 6) % 7), 'día antes del partido');
    assert.ok(!ds.includes((match + 1) % 7), 'día después del partido');
    assert.ok(ds.includes((match + 2) % 7), 'MD+2');
  }
});

test('en temporada: máximo 2 sesiones, menos series y cargas altas', () => {
  const pre = buildRoutine({ ...base, season: 'pre', days: 4 }, prof, {}, 2);
  const inn = buildRoutine({ ...base, season: 'in', days: 4 }, prof, {}, 2);
  assert.equal(inn.days.length, 2);
  assert.ok(inn.warn.some(w => /2 sesiones/.test(w)));
  const setsOf = r => bars(r).reduce((a, x) => a + x.s, 0) / r.days.length;
  assert.ok(setsOf(inn) < setsOf(pre));
  const mains = inn.days.map(d => d.items.find(x => x.bar)).filter(x => x.type === 'fuerza');
  assert.ok(mains.length && mains.every(x => x.pct >= 80), 'la intensidad del ejercicio principal se mantiene');
});

test('pretemporada: 3 semanas subiendo y la cuarta de descarga', () => {
  const sq = w => bars(buildRoutine(base, prof, {}, w)).find(x => x.n === 'Sentadilla');
  assert.ok(sq(1).pct > sq(0).pct && sq(2).pct > sq(1).pct);
  const d = buildRoutine(base, prof, {}, 3);
  assert.equal(d.phase.label, 'Descarga');
  assert.ok(sq(3).pct < sq(2).pct && sq(3).s < sq(2).s);
});

test('menores de 18: sin cargadas y nada por encima del 85 %', () => {
  const r = buildRoutine({ ...base, prio: 'contacto' }, { ...prof, age: 16 }, {}, 2);
  assert.ok(bars(r).every(x => x.pct <= 85));
  assert.ok(!names(r).includes('Cargada colgante'));
  assert.ok(r.warn.some(w => /menor de 18/.test(w)));
});

test('molestias: se cambian los ejercicios que las cargan', () => {
  const back = buildRoutine({ ...base, inj: ['espalda'] }, prof, {}, 0);
  assert.ok(!names(back).includes('Peso muerto') && !names(back).includes('Cargada colgante') && !names(back).includes('Sentadilla'));
  const shoulder = buildRoutine({ ...base, inj: ['hombro'], days: 4 }, prof, {}, 0);
  assert.ok(!names(shoulder).includes('Press militar') && !names(shoulder).includes('Push press') && !names(shoulder).includes('Press banca'));
  const knee = buildRoutine({ ...base, focus: 'voley', pos: 'central', prio: 'salto', inj: ['rodilla'] }, prof, {}, 0);
  assert.ok(!names(knee).some(n => /Zancadas|búlgara/.test(n)));
  assert.ok(names(knee).some(n => /bajás caminando/.test(n)));
  const ham = buildRoutine({ ...base, focus: 'futbol', pos: 'extremo', prio: 'velocidad', inj: ['isquios'] }, prof, {}, 0);
  assert.ok(!names(ham).some(n => /Sprints|Aceleraciones/.test(n)));
  assert.ok(ham.warn.some(w => /consultá/.test(w)));
});

test('prevención con evidencia según el deporte', () => {
  const futbol = buildRoutine({ ...base, focus: 'futbol', pos: 'medio', prio: 'aceleracion', match: 6 }, prof, {}, 0);
  assert.equal(names(futbol).filter(n => n === 'Nórdicos').length, 2, 'nórdicos 2 veces en pretemporada');
  assert.ok(names(futbol).includes('Copenhagen (aductores)'));
  const futbolIn = buildRoutine({ ...base, focus: 'futbol', pos: 'medio', prio: 'aceleracion', match: 6, season: 'in' }, prof, {}, 0);
  assert.equal(names(futbolIn).filter(n => n === 'Nórdicos').length, 1, 'nórdicos 1 vez en temporada');
  const hand = buildRoutine({ ...base, focus: 'handball', pos: 'lateral', prio: 'lanzamiento' }, prof, {}, 0);
  assert.ok(hand.days.every(d => /Andersson/.test(d.items[0].note)), 'programa de hombro en la entrada en calor');
  const rugby = buildRoutine({ ...base, pos: 'primera' }, prof, {}, 0);
  assert.ok(names(rugby).some(n => /cuello/.test(n)));
});

test('la posición cambia la rutina: un wing no entrena igual que un pilar', () => {
  const wing = buildRoutine({ ...base, pos: 'wing', prio: 'velocidad' }, prof, {}, 0);
  const pilar = buildRoutine({ ...base, pos: 'primera', prio: 'contacto' }, prof, {}, 0);
  assert.ok(names(wing).some(n => /Sprints/.test(n)));
  assert.ok(!names(pilar).some(n => /Sprints lanzados/.test(n)));
  assert.notDeepEqual(wing.days.map(d => d.name), pilar.days.map(d => d.name));
});

test('cargas: del 1RM medido si hay; si no, del perfil; si no, sin kg y con aviso', () => {
  const measured = buildRoutine(base, prof, { oneRM: ex => (ex === 'Sentadilla' ? 150 : null) }, 2);
  assert.equal(bars(measured).find(x => x.n === 'Sentadilla').kg, 127.5); // 85 % de 150
  const noData = buildRoutine(base, { level: 'inter', age: 22, bw: 80, loads: {} }, {}, 0);
  assert.ok(bars(noData).every(x => x.kg == null));
  assert.ok(noData.warn.some(w => /zona de velocidad/.test(w)));
});

test('preguntas: solo lo que falta; la de día de partido no aparece fuera de temporada ni en deportes sin partido', () => {
  const ids = a => questions(normalize(a, prof)).map(q => q.id);
  assert.ok(ids(base).includes('pos') && ids(base).includes('match'));
  assert.ok(!ids({ ...base, season: 'off' }).includes('match'));
  assert.ok(!ids({ ...base, focus: 'natacion' }).includes('match'));
  assert.ok(!ids({ mode: 'obj', focus: 'fuerza' }).includes('pos'));
  for (const q of questions(normalize(base, prof))) assert.ok(!/peso corporal|edad|altura|cuánto pesás/i.test(q.t), q.t);
});

test('sesión de hoy o la próxima, y semana del plan', () => {
  const r = buildRoutine(base, prof, {}, 0);
  const monday = new Date(2026, 8, 28, 10).getTime(); // lunes
  const s = sessionFor(r, monday);
  assert.equal(s.today, true);
  const sat = new Date(2026, 9, 3, 10).getTime();
  assert.equal(sessionFor(r, sat).today, false);
  assert.equal(weekOf(monday, 6, monday + 15 * 864e5), 2);
  assert.equal(weekOf(monday, 6, monday + 100 * 864e5), 5);
});

test('rutina personalizada: respeta lo que eligió el atleta y pone cargas, cortes y progresión', async () => {
  const { buildCustom } = await import('../../../src/velo/routine.js');
  const r = { kind: 'custom', name: 'Fuerza 2 días', weeks: 6, plan: [{ dow: 3, name: 'Torso', items: [{ n: 'Press banca', s: 4, r: 6 }] }, { dow: 0, name: 'Piernas', items: [{ n: 'Sentadilla', s: 4, r: 5 }, { n: 'Hip thrust', s: 3, r: 10 }] }, { dow: 5, items: [] }] };
  const w0 = buildCustom(r, prof, {}, 0), w2 = buildCustom(r, prof, {}, 2), w3 = buildCustom(r, prof, {}, 3);
  assert.deepEqual(w0.days.map(d => d.dow), [0, 3], 'ordenado y sin días vacíos');
  const sq = rt => rt.days[0].items.find(x => x.n === 'Sentadilla');
  assert.equal(sq(w0).s, 4); assert.equal(sq(w0).r, 5);
  assert.ok(sq(w0).kg > 0 && sq(w2).pct > sq(w0).pct, 'sube la carga');
  assert.ok(sq(w3).s < sq(w2).s && sq(w3).pct < sq(w2).pct, 'descarga en la semana 4');
  assert.equal(w0.title, 'Fuerza 2 días');
  const kid = buildCustom({ ...r, plan: [{ dow: 0, items: [{ n: 'Sentadilla', s: 3, r: 1 }] }] }, { ...prof, age: 15 }, {}, 2);
  assert.ok(kid.days[0].items[1].pct <= 85);
});
