// Fatiga y síntomas (src/velo/fatigue.js): cuentas puras, sin emuladores.
// Correr desde backend/worker: node --test test/fatigue.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fatigue, symptomCheck } from '../../../src/velo/fatigue.js';

const DAY = 864e5;
const NOW = Date.UTC(2026, 8, 26, 15); // 26/9/2026, 12:00 en Uruguay
// Una sesión: `n` series de `ex` a `kg` con velocidad de mejor rep `v`.
const ses = (daysAgo, ex, kg, v, n = 3) => Array.from({ length: n }, (_, i) => ({
  exercise: ex, load: kg, setNo: i + 1, at: NOW - daysAgo * DAY + i * 3e5,
  reps: [v, v * 0.95, v * 0.9, v * 0.85, v * 0.8]
}));
// Historia estable: sentadilla 100 kg a 0,60 m/s y 110 kg a 0,50, dos veces por semana.
const steady = (from = 40, to = 3, v = 1) => {
  const out = [];
  for (let d = from; d >= to; d -= 3.5) out.push(...ses(d, 'Sentadilla', 100, 0.60 * v), ...ses(d, 'Sentadilla', 110, 0.50 * v, 1));
  return out;
};

test('entrenamiento estable → ok, sin señales', () => {
  const f = fatigue(steady(), NOW);
  assert.equal(f.level, 'ok');
  assert.deepEqual(f.signals, []);
});

test('velocidad que cae en las 2 últimas sesiones a la carga de siempre', () => {
  const sets = [...steady(40, 10), ...ses(6, 'Sentadilla', 100, 0.54), ...ses(2, 'Sentadilla', 100, 0.53)];
  const f = fatigue(sets, NOW);
  const s = f.signals.find(x => x.id === 'velocidad');
  assert.ok(s, JSON.stringify(f.signals));
  assert.match(s.text, /sentadilla a 100 kg.*11 % más lentas/);
  assert.notEqual(f.level, 'ok');
});

test('días lentos seguidos y 1RM que baja → descanso o descarga', () => {
  const sets = [...steady(40, 12)];
  for (const [d, k] of [[9, 0.93], [6, 0.9], [3, 0.87], [1, 0.84]]) sets.push(...ses(d, 'Sentadilla', 100, 0.60 * k), ...ses(d, 'Sentadilla', 110, 0.50 * k, 1));
  const f = fatigue(sets, NOW);
  const ids = f.signals.map(s => s.id);
  assert.ok(ids.includes('lentos'), ids.join());
  assert.ok(['descanso', 'descarga'].includes(f.level), f.level);
  assert.match(f.advice, /descanso|descarga/);
});

test('mucho volumen de golpe (7 días contra el promedio de 4 semanas)', () => {
  const sets = [...steady(34, 8)];
  for (let d = 6; d >= 0.5; d -= 1.5) sets.push(...ses(d, 'Press banca', 60, 0.7, 5));
  const s = fatigue(sets, NOW).signals.find(x => x.id === 'volumen');
  assert.ok(s);
  assert.match(s.text, /Esta semana hiciste \d+ series/);
});

test('sin descanso: 6 de los últimos 7 días', () => {
  const sets = [];
  for (let d = 0.2; d < 6.5; d += 1) sets.push(...ses(d, 'Remo con barra', 50, 0.8, 2));
  const s = fatigue(sets, NOW).signals.find(x => x.id === 'sinDescanso');
  assert.ok(s);
  assert.match(s.text, /Entrenaste (6|7) de los últimos 7 días/);
});

test('sin datos o datos rotos no revienta', () => {
  assert.equal(fatigue([], NOW).level, 'ok');
  assert.equal(fatigue([{ exercise: 'X', load: 'a', reps: 'b', at: 1 }, null], NOW).level, 'ok');
});

test('síntomas: urgente, dolor o nada', () => {
  for (const q of ['me duele el pecho cuando levanto', 'me mareé en la serie', 'casi me desmayo', 'siento falta de aire', 'se me durmió el brazo'])
    assert.equal(symptomCheck(q), 'urgente', q);
  for (const q of ['me duele la rodilla en la sentadilla', 'tengo una contractura en la espalda', 'creo que me desgarré', 'siento un pinchazo en el hombro'])
    assert.equal(symptomCheck(q), 'dolor', q);
  for (const q of ['¿cuánto cargo hoy?', 'quiero mejorar mi press de pecho', '¿subo la carga en banca?'])
    assert.equal(symptomCheck(q), null, q);
});

test('síntomas: "me voy a morir" es urgente; ideas de hacerse daño van a la línea de crisis', () => {
  for (const q of ['siento que me voy a morir', 'me muero, no puedo más con la serie', 'me siento muy mal'])
    assert.equal(symptomCheck(q), 'urgente', q);
  for (const q of ['me quiero morir', 'pienso en suicidarme', 'no quiero vivir más'])
    assert.equal(symptomCheck(q), 'crisis', q);
});

test('síntomas: orina oscura dicha de varias formas es urgente (rabdomiólisis); pérdidas de pis al levantar no', () => {
  for (const q of ['después de la sentadilla orino color té', 'hice pis oscuro después del crossfit', 'tengo la orina color coca', 'orino con sangre desde ayer'])
    assert.equal(symptomCheck(q), 'urgente', q);
  assert.notEqual(symptomCheck('me hago pis cuando levanto pesado'), 'urgente');
  assert.notEqual(symptomCheck('¿cuánto tengo que orinar para estar hidratado?'), 'urgente');
});
