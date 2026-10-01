// Nova en el chat: texto plano y corto aunque el modelo escriba markdown largo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plain } from '../src/nova.js';

test('saca el markdown y deja viñetas', () => {
  const t = plain('**Día 1 – Pierna**\n- Sentadilla 4×5\n- Peso muerto 3×8\n\n\n### Descanso\n`48 h`');
  assert.doesNotMatch(t, /\*\*|###|`/);
  assert.match(t, /• Sentadilla 4×5\n• Peso muerto 3×8/);
  assert.doesNotMatch(t, /\n{3}/);
});

test('corta los textos larguísimos al final de una oración', () => {
  const long = Array.from({ length: 60 }, (_, i) => `Oración número ${i} con algo de texto.`).join(' ');
  const t = plain(long);
  assert.ok(t.length <= 900);
  assert.match(t, /\.$/);
});
