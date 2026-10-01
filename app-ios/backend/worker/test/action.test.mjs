// "Aplicar" de Nova: el chip se convierte en una acción concreta o en nada (src/velo/action.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipAction } from '../../../src/velo/action.js';

const plan = [{ n: 'Sentadilla', kg: 77.5 }, { n: 'Press banca', kg: 60 }, { n: 'Peso muerto', kg: 100 }];

test('carga absoluta con ejercicio', () => {
  const a = chipAction('Sentadilla · 80 kg', plan);
  assert.deepEqual({ ex: a.ex, op: a.op, to: a.to, label: a.label }, { ex: 'Sentadilla', op: 'set', to: 80, label: '77,5 → 80 kg' });
});

test('incremento: +2,5 kg suma, no deja la carga en 2,5', () => {
  assert.equal(chipAction('Sentadilla · +2,5 kg', plan).to, 80);
  assert.equal(chipAction('Subí 2,5 kg en press banca', plan).to, 62.5);
  assert.equal(chipAction('Peso muerto · −5 kg', plan).to, 95);
  assert.equal(chipAction('Bajá 5 kg de peso muerto', plan).to, 95);
});

test('números con coma o punto', () => {
  assert.equal(chipAction('Press banca · 62,5 kg', plan).to, 62.5);
  assert.equal(chipAction('Press banca · 62.5 kg', plan).to, 62.5);
});

test('sin acción: falta el ejercicio, hay dos, rangos, porcentajes o texto', () => {
  assert.equal(chipAction('100 kg · serie 1', plan), null);
  assert.equal(chipAction('Sentadilla y press banca · 80 kg', plan), null);
  assert.equal(chipAction('Sentadilla · 80–82,5 kg', plan), null);
  assert.equal(chipAction('Sentadilla · 80 a 82,5 kg', plan), null);
  assert.equal(chipAction('Sentadilla · 77,5 → 80 kg', plan), null);
  assert.equal(chipAction('Hoy −5 a 10 %', plan), null);
  assert.equal(chipAction('Urgencia médica', plan), null);
  assert.equal(chipAction('Corte 0,45 m/s', plan), null);
  assert.equal(chipAction('', plan), null);
});

test('cambios no creíbles o que no cambian nada no se aplican', () => {
  assert.equal(chipAction('Sentadilla · 2,5 kg', plan), null);   // de 77,5 a 2,5
  assert.equal(chipAction('Sentadilla · 140 kg', plan), null);   // salto enorme
  assert.equal(chipAction('Sentadilla · 77,5 kg', plan), null);  // ya está
  assert.equal(chipAction('Sentadilla · 80,3 kg', plan), null);  // no se puede cargar
  assert.equal(chipAction('Hip thrust · 80 kg', plan), null);    // no está en el plan de hoy
});
