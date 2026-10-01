// ─── ACCIÓN DE UN CHIP DE NOVA ────────────────────────────────────────
// Nova contesta texto y un "chip" corto ("Sentadilla · 80 kg", "Press banca · +2,5 kg").
// El botón "Aplicar" no puede adivinar: antes tomaba el primer número con kg y, si no
// encontraba el ejercicio, cambiaba el que estuviera elegido; "+2,5 kg" terminaba como
// carga de 2,5 kg. Acá el chip se convierte en una acción concreta y validada:
//   { ex, op: 'set' | 'add', kg, from, to, label }
// o null si falta el ejercicio, hay más de uno, hay un rango o el cambio no es creíble.
// Lo usa la app (design/VELOPhone.dc.html lo copia tal cual en chipAct) y lo prueban los tests.

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const fk = x => String(Math.round(x * 100) / 100).replace('.', ',');

// plan: [{ n: 'Sentadilla', kg: 77.5 }, …]  (los ejercicios de hoy con su carga actual)
export function chipAction(chip, plan) {
  const k = norm(chip);
  if (!k || /%/.test(k)) return null;
  // Exactamente un ejercicio del plan nombrado en el chip.
  const hits = (plan || []).filter(c => c && c.n && k.includes(norm(c.n)));
  if (hits.length !== 1) return null;
  const c = hits[0];
  // Exactamente un número con kg; rangos ("80–82,5 kg", "80 a 82,5 kg", "100 → 102,5 kg") no.
  const nums = [...k.matchAll(/([+−-]?)\s*(\d+(?:[.,]\d+)?)\s*kg/g)];
  if (nums.length !== 1) return null;
  if (/\d\s*(?:kg\s*)?(?:[–—→-]|->|\ba\b|\bo\b|\by\b)\s*\d/.test(k)) return null;
  const [, sign, raw] = nums[0];
  const n = parseFloat(raw.replace(',', '.'));
  if (!(n > 0)) return null;
  const down = sign === '-' || sign === '−' || /\b(baja|bajar|bajale|menos|saca|restale)\b/.test(k);
  const up = sign === '+' || /\b(subi|subir|subile|suma|sumale|agrega|mas)\b/.test(k);
  const op = up || down ? 'add' : 'set';
  const from = +c.kg || 0;
  const to = op === 'add' ? from + (down ? -n : n) : n;
  // Cambios creíbles: carga positiva, múltiplo de 0,5 y no más de un 30 % (o 20 kg) de salto.
  if (!(to > 0) || to > 400 || Math.abs(to * 2 - Math.round(to * 2)) > 1e-9) return null;
  if (from > 0 && Math.abs(to - from) > Math.max(20, from * 0.3)) return null;
  if (to === from) return null;
  return { ex: c.n, op, kg: n, from, to, label: fk(from) + ' → ' + fk(to) + ' kg' };
}
