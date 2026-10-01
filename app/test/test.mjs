/* ============================================================
   Tests de la app. Se corren con:  node test/test.mjs

   Qué se testea y qué no:

   · SÍ el protocolo. Es un contrato binario con el firmware, y un
     offset mal puesto no rompe nada visible: muestra un número
     equivocado, que es peor. Cada campo se verifica en su posición.
   · SÍ la regresión carga-velocidad. Tiene una respuesta correcta
     conocida, así que se puede comprobar contra datos generados a
     partir de una recta que uno mismo eligió.
   · NO la interfaz. Se verifica en el navegador, mirándola.

   No hay framework: son 90 líneas de assert y no vale la pena traer
   una dependencia para eso.
   ============================================================ */

import assert from 'node:assert/strict';
import {
  parseRepResult, parseSetSummary, parseStatus,
  encodeSetStart, encodeSimple, encodeConfigWrite, encodeSetTime,
  decodeQuality, decodeStatusFlags, stateName, OP, SCHEMA_VERSION,
} from '../js/protocol.js';
import { fitProfile, estimate1RM, MVT, zoneFor, pointsFromSets } from '../js/lv.js';
import { enPalabras, fraseRep, fraseCorte, fraseResumen } from '../js/voz.js';

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; }
  catch (e) { fail++; console.error(`  FALLA  ${name}\n         ${e.message}`); }
};

/* ============================================================
   Protocolo
   ============================================================ */

test('RepResult: cada campo en su offset', () => {
  const d = new DataView(new ArrayBuffer(20));
  d.setUint8(0, 1);
  d.setUint8(1, 7);
  d.setUint16(2, 620, true);    // 0,620 m/s
  d.setUint16(4, 655, true);
  d.setUint16(6, 1180, true);
  d.setUint16(8, 415, true);    // 415 mm
  d.setUint16(10, 690, true);
  d.setUint16(12, 1240, true);
  d.setUint16(14, 310, true);
  d.setUint8(16, 0b00010010);   // WEAK_ZUPT + LOW_CONFIDENCE
  d.setUint8(17, 42);
  d.setUint8(18, 3);

  const r = parseRepResult(d);
  assert.equal(r.repIndex, 7);
  assert.equal(r.meanConcVel, 0.62);
  assert.equal(r.meanPropVel, 0.655);
  assert.equal(r.peakVel, 1.18);
  assert.equal(r.rom, 0.415);
  assert.equal(r.concMs, 690);
  assert.equal(r.eccMs, 1240);
  assert.equal(r.pauseMs, 310);
  assert.equal(r.peakVelPos, 42);
  assert.equal(r.setIndex, 3);
  assert.equal(r.quality.weakZupt, true);
  assert.equal(r.quality.lowConfidence, true);
  assert.equal(r.quality.saturated, false);
  assert.equal(r.quality.list.length, 2);
});

test('SetSummary: pérdida de velocidad y carga vienen escaladas', () => {
  const d = new DataView(new ArrayBuffer(20));
  d.setUint8(0, 1);
  d.setUint8(1, 4);
  d.setUint8(2, 12);
  d.setUint8(3, 1);
  d.setUint16(4, 760, true);
  d.setUint16(6, 745, true);
  d.setUint16(8, 510, true);
  d.setUint16(10, 329, true);    // 32,9 %
  d.setUint16(12, 1025, true);   // 102,5 kg
  d.setUint32(14, 61500, true);
  d.setUint8(18, 0b00000001);

  const s = parseSetSummary(d);
  assert.equal(s.repCount, 12);
  assert.equal(s.exerciseId, 1);
  assert.equal(s.bestMeanVel, 0.76);
  assert.equal(s.velocityLoss, 32.9);
  assert.equal(s.loadKg, 102.5);
  assert.equal(s.durationMs, 61500);
  assert.equal(s.flags.saturated, true);
});

test('Status: versión de firmware, batería y flags', () => {
  const d = new DataView(new ArrayBuffer(20));
  d.setUint8(0, 1);
  d.setUint8(1, 7);              // CALIBRATING
  d.setUint8(2, 87);
  d.setUint8(3, 0b00100011);     // IMU_OK + CHARGING + CALIBRATED
  d.setUint16(4, 4050, true);
  d.setUint8(6, 5);
  d.setUint8(7, 2);
  d.setUint32(8, 3600, true);
  d.setUint32(12, 8388608, true);
  d.setUint16(16, (1 << 8) | 4, true);   // 1.4
  d.setUint8(18, 3);

  const s = parseStatus(d);
  assert.equal(s.stateName, 'CALIBRATING');
  assert.equal(s.batteryPct, 87);
  assert.equal(s.batteryMv, 4050);
  assert.equal(s.fwVersion, '1.4');
  assert.equal(s.flags.charging, true);
  assert.equal(s.flags.calibrated, true);
  assert.equal(s.flags.logFull, false);
  assert.equal(s.errorText, 'Overrun del FIFO');
});

test('Una versión de esquema desconocida se descarta en silencio', () => {
  const d = new DataView(new ArrayBuffer(20));
  d.setUint8(0, 99);
  assert.equal(parseRepResult(d), null);
  assert.equal(parseSetSummary(d), null);
  assert.equal(parseStatus(d), null);
});

test('Un payload corto no rompe el parser', () => {
  const d = new DataView(new ArrayBuffer(8));
  d.setUint8(0, 1);
  assert.equal(parseRepResult(d), null);
});

test('Un estado que la app no conoce no es un error', () => {
  /* El firmware puede agregar valores al enum sin subir SCHEMA_VERSION
     — así se agregó CALIBRATING. La app tiene que sobrevivirlo. */
  assert.match(stateName(200), /DESCONOCIDO/);
});

test('SET_START: little-endian y carga × 10', () => {
  const b = encodeSetStart(1, 102.5);
  assert.deepEqual([...b], [SCHEMA_VERSION, OP.SET_START, 1, 0x01, 0x04]);
  //                                                       1025 = 0x0401 LE
  const d = new DataView(b.buffer);
  assert.equal(d.getUint16(3, true), 1025);
});

test('SET_START: la carga se recorta al rango del protocolo', () => {
  const d = new DataView(encodeSetStart(1, 99999).buffer);
  assert.equal(d.getUint16(3, true), 65535);
  const z = new DataView(encodeSetStart(1, -5).buffer);
  assert.equal(z.getUint16(3, true), 0);
});

test('SET_STOP son dos bytes', () => {
  assert.deepEqual([...encodeSimple(OP.SET_STOP)], [1, 2]);
});

test('SET_TIME lleva el unix time en 4 bytes little-endian', () => {
  const b = encodeSetTime(1756500000);
  assert.equal(b.length, 6);
  assert.equal(new DataView(b.buffer).getUint32(2, true), 1756500000);
});

test('Config: 8 bytes, con el valor según su tipo', () => {
  const u16 = encodeConfigWrite(0x40, 1, 150);      // REP_MIN_ROM_MM
  assert.equal(u16.length, 8);
  assert.equal(new DataView(u16.buffer).getUint16(4, true), 150);

  const i16 = encodeConfigWrite(0x33, 2, -420);     // ODR_CALIB_PPM
  assert.equal(new DataView(i16.buffer).getInt16(4, true), -420);

  const u8 = encodeConfigWrite(0x10, 0, 12);        // TAP_THS
  assert.equal(new DataView(u8.buffer).getUint8(4), 12);

  assert.throws(() => encodeConfigWrite(0x10, 9, 1));
});

test('Los bitfields se decodifican bit por bit', () => {
  assert.equal(decodeQuality(0).any, false);
  assert.equal(decodeQuality(1).saturated, true);
  assert.equal(decodeQuality(0b1000).highRotation, true);
  assert.equal(decodeQuality(0b11111).list.length, 5);
  assert.equal(decodeStatusFlags(0b100000).calibrated, true);
  assert.equal(decodeStatusFlags(0).imuOk, false);
});

/* ============================================================
   Perfil carga-velocidad
   ============================================================ */

/* Se generan puntos a partir de una recta elegida a mano, y se
   comprueba que el ajuste la recupere. Si el ajuste está mal, no hay
   forma de que devuelva los mismos números por casualidad. */
test('El ajuste recupera la recta que generó los datos', () => {
  const a = 1.63, b = -0.0146;                 // v = 1,63 − 0,0146·kg
  const pts = [40, 55, 70, 85, 95].map((kg) => ({ loadKg: kg, vel: a + b * kg }));
  const fit = fitProfile(pts);
  assert.equal(fit.ok, true);
  assert.ok(Math.abs(fit.a - a) < 1e-9, `a = ${fit.a}`);
  assert.ok(Math.abs(fit.b - b) < 1e-9, `b = ${fit.b}`);
  assert.ok(fit.r2 > 0.999);
});

test('El 1RM estimado cae donde la recta cruza el umbral', () => {
  const a = 1.63, b = -0.0146;
  const esperado = (MVT[1] - a) / b;            // ≈ 100 kg
  const pts = [40, 55, 70, 85, 95].map((kg) => ({ loadKg: kg, vel: a + b * kg }));
  const est = estimate1RM(fitProfile(pts), 1);
  assert.ok(Math.abs(est.kg - esperado) < 0.01, `kg = ${est.kg}`);
  assert.equal(est.confidence, 'alta');
});

test('Con pocos puntos la confianza baja aunque el ajuste sea perfecto', () => {
  /* Dos puntos siempre dan r² = 1: la recta pasa exacto por los dos.
     Si la confianza no mirara también el número de series, dos series
     producirían un 1RM con "confianza alta" que no vale nada. */
  const pts = [{ loadKg: 60, vel: 0.75 }, { loadKg: 80, vel: 0.46 }];
  const est = estimate1RM(fitProfile(pts), 1);
  assert.equal(fitProfile(pts).r2, 1);
  assert.equal(est.confidence, 'baja');
});

test('Extrapolar lejos baja la confianza', () => {
  /* Cargas livianas y muy juntas: la recta hay que estirarla al doble
     para llegar al 1RM, y el número deja de ser confiable. */
  const a = 1.63, b = -0.0146;
  const pts = [30, 34, 38, 42].map((kg) => ({ loadKg: kg, vel: a + b * kg }));
  const est = estimate1RM(fitProfile(pts), 1);
  assert.ok(est.extrapolation > 2, `extrapolación = ${est.extrapolation}`);
  assert.equal(est.confidence, 'baja');
});

test('Sin rango de carga no hay recta', () => {
  const pts = [60, 60, 60].map((kg) => ({ loadKg: kg, vel: 0.7 }));
  const fit = fitProfile(pts);
  assert.equal(fit.ok, false);
  assert.equal(fit.reason, 'sin-rango-de-carga');
});

test('Una pendiente positiva no produce un 1RM', () => {
  /* Velocidad que SUBE con la carga: datos sin sentido físico. Antes
     que inventar un número, no se devuelve ninguno. */
  const pts = [{ loadKg: 40, vel: 0.4 }, { loadKg: 60, vel: 0.6 }, { loadKg: 80, vel: 0.9 }];
  assert.equal(estimate1RM(fitProfile(pts), 1), null);
});

test('Las zonas de velocidad cubren todo el rango sin huecos', () => {
  for (const v of [0, 0.17, 0.49, 0.5, 0.74, 0.75, 0.99, 1.0, 1.29, 1.3, 3.0]) {
    assert.ok(zoneFor(v), `sin zona para ${v}`);
  }
  assert.equal(zoneFor(0.62).key, 'fuerza-velocidad');
  assert.equal(zoneFor(0.85).key, 'potencia');
  assert.equal(zoneFor(2.0).key, 'velocidad');
});

test('Los puntos del perfil salen de la mejor rep, no del promedio', () => {
  const sets = [
    { exerciseId: 1, loadKg: 60, bestMeanVel: 0.8, startedAt: 1, repCount: 5, flags: {} },
    { exerciseId: 2, loadKg: 100, bestMeanVel: 0.9, startedAt: 2, repCount: 5, flags: {} },
    { exerciseId: 1, loadKg: 0, bestMeanVel: 0.9, startedAt: 3, repCount: 5, flags: {} },
    { exerciseId: 1, loadKg: 80, bestMeanVel: 0.5, startedAt: 4, repCount: 3, flags: { weakZupt: true } },
  ];
  const pts = pointsFromSets(sets, 1);
  assert.equal(pts.length, 2);                  // se filtra otro ejercicio y la carga 0
  assert.equal(pts[0].vel, 0.8);
  assert.equal(pts[1].suspect, true);
});

/* ============================================================
   Voz — los números en palabras

   Es la única parte de voz.js con lógica; el resto es el API del
   navegador. Un número mal dicho no falla: dice otra cosa, y el atleta
   corrige la carga contra un dato equivocado sin enterarse.
   ============================================================ */

test('Números en palabras: los tramos regulares', () => {
  assert.equal(enPalabras(0), 'cero');
  assert.equal(enPalabras(7), 'siete');
  assert.equal(enPalabras(10), 'diez');
  assert.equal(enPalabras(15), 'quince');
  assert.equal(enPalabras(19), 'diecinueve');
  assert.equal(enPalabras(30), 'treinta');
  assert.equal(enPalabras(58), 'cincuenta y ocho');
  assert.equal(enPalabras(90), 'noventa');
  assert.equal(enPalabras(99), 'noventa y nueve');
});

test('Números en palabras: los veinti- van pegados y con tilde', () => {
  assert.equal(enPalabras(20), 'veinte');
  assert.equal(enPalabras(21), 'veintiuno');
  assert.equal(enPalabras(22), 'veintidós');
  assert.equal(enPalabras(26), 'veintiséis');
  assert.equal(enPalabras(29), 'veintinueve');
  /* El error clásico: "veinte y dos", que existe en el patrón general
     de las decenas y no en el español. */
  assert.ok(!enPalabras(22).includes(' y '));
});

test('Números en palabras: el cero del decimal no se pierde', () => {
  /* 1,05 dicho como "uno cinco" se entiende como 1,50: la diferencia
     entre cortar la serie y meter tres reps de más. */
  assert.equal(enPalabras(105), 'uno cero cinco');
  assert.equal(enPalabras(100), 'uno');
  assert.equal(enPalabras(118), 'uno dieciocho');
  assert.equal(enPalabras(150), 'uno cincuenta');
});

test('Números en palabras: entradas que no deberían llegar nunca', () => {
  assert.equal(enPalabras(-3), '');
  assert.equal(enPalabras(NaN), '');
  assert.equal(enPalabras(Infinity), '');
  assert.equal(enPalabras(4000), enPalabras(999));   // se recorta, no revienta
});

test('La velocidad se dice en la forma corta del entrenador', () => {
  assert.equal(fraseRep(0.58), 'cincuenta y ocho');
  assert.equal(fraseRep(0.6), 'sesenta');
  assert.equal(fraseRep(1.05), 'uno cero cinco');
  /* Redondeo a centésimas, que es la resolución que muestra la
     pantalla: si la voz dijera otra cosa que el número grande, la app
     se contradice a sí misma. */
  assert.equal(fraseRep(0.584), 'cincuenta y ocho');
  assert.equal(fraseRep(0.586), 'cincuenta y nueve');
});

test('El aviso de corte lleva el porcentaje y la recomendación', () => {
  const f = fraseCorte(21);
  assert.ok(f.includes('veintiuno'));
  assert.ok(f.includes('por ciento'));
  assert.ok(/cortar/i.test(f));
});

test('El resumen concuerda en número', () => {
  assert.ok(fraseResumen(1, 0).includes('repetición'));
  assert.ok(fraseResumen(6, 21).includes('repeticiones'));
  /* Sin pérdida no se dice "pérdida cero por ciento": se calla. */
  assert.ok(!fraseResumen(3, 0).includes('Pérdida'));
  assert.ok(fraseResumen(6, 21).includes('Pérdida'));
});

/* ============================================================ */

console.log(`\n${pass} pasan, ${fail} fallan\n`);
process.exit(fail ? 1 : 0);
