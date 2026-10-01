/* ============================================================
   lv.js — perfil carga-velocidad.

   Esta es la parte que un contador de repeticiones gratis no te puede
   dar, y la razón por la que alguien pagaría por el producto.

   La idea, en una línea: para un mismo atleta y un mismo ejercicio, la
   velocidad media concéntrica cae de forma casi lineal a medida que
   sube la carga. Si medís unas cuantas series a cargas distintas y
   ajustás una recta, esa recta te dice dos cosas:

     · Qué carga te falta para llegar a la velocidad mínima con la que
       se mueve un 1RM → estimación de 1RM sin ir al fallo.
     · Con qué carga entrenar hoy para moverte a la velocidad objetivo
       del bloque, que cambia día a día con el descanso y el estrés.

   El 1RM estimado es una ESTIMACIÓN, no una medición. Con pocos puntos
   o con cargas todas parecidas, la recta se extrapola lejos y el número
   se vuelve poco confiable. Por eso `fitProfile` devuelve r² y el conteo
   de puntos, y la interfaz tiene que mostrarlos junto al número — no
   escondidos. Un 1RM estimado sin su r² es un número inventado con
   aspecto de dato.
   ============================================================ */

/* Velocidad media concéntrica con la que se mueve un 1RM, por ejercicio.
   Es la "velocidad umbral mínima" (MVT) que reporta la literatura de VBT:
   sorprendentemente estable dentro de un mismo atleta y ejercicio, incluso
   cuando el 1RM sube. Es lo que hace que todo esto funcione. */
export const MVT = {
  1: 0.17,  // press banca
  2: 0.30,  // sentadilla
  3: 0.15,  // peso muerto
  4: 0.19,  // press militar
  5: 0.30,  // remo con barra
  6: 0.25,  // hip thrust
  0: 0.20,  // genérico
};

/* Zonas de velocidad. Sirven para decirle al atleta qué está entrenando
   de verdad con la carga que puso, en vez de dejarlo interpretar un
   número suelto. Los cortes son los de uso corriente en VBT. */
export const ZONES = [
  { min: 1.30, max: Infinity, key: 'velocidad',      label: 'Velocidad',        hint: 'Cargas livianas, foco en velocidad pura.' },
  { min: 1.00, max: 1.30,     key: 'velocidad-fuerza',label: 'Velocidad-fuerza', hint: 'Potencia con carga moderada.' },
  { min: 0.75, max: 1.00,     key: 'potencia',       label: 'Potencia',         hint: 'La zona de máxima producción de potencia.' },
  { min: 0.50, max: 0.75,     key: 'fuerza-velocidad',label: 'Fuerza-velocidad', hint: 'Cargas pesadas movidas rápido.' },
  { min: 0.00, max: 0.50,     key: 'fuerza',         label: 'Fuerza máxima',    hint: 'Cargas altas. Acá se construye el 1RM.' },
];

export const zoneFor = (vel) => ZONES.find((z) => vel >= z.min && vel < z.max) || ZONES[ZONES.length - 1];

/* ============================================================
   Ajuste lineal por mínimos cuadrados: velocidad = a + b·carga.
   Se ajusta velocidad EN FUNCIÓN de la carga porque la carga es lo
   que el atleta elige (sin error) y la velocidad es lo que se mide
   (con error). Al revés, la pendiente sale sesgada.
   ============================================================ */
export function fitProfile(points) {
  const pts = points.filter((p) => p.loadKg > 0 && p.vel > 0);
  const n = pts.length;
  if (n < 2) return { ok: false, n, reason: n === 0 ? 'sin-datos' : 'pocos-puntos' };

  const mx = pts.reduce((s, p) => s + p.loadKg, 0) / n;
  const my = pts.reduce((s, p) => s + p.vel, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of pts) {
    const dx = p.loadKg - mx, dy = p.vel - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  /* Todas las cargas iguales: no hay recta posible, sólo una vertical.
     Pasa cuando el atleta hizo cinco series con el mismo peso. */
  if (sxx === 0) return { ok: false, n, reason: 'sin-rango-de-carga' };

  const b = sxy / sxx;                       // pendiente, (m/s) por kg
  const a = my - b * mx;                     // ordenada
  /* Recortado a [0,1]: con puntos casi perfectamente alineados la cuenta
     sale 1,0000000000000002 por redondeo del punto flotante, y un r²
     mayor que 1 impreso en pantalla no significa nada. */
  const r2 = syy === 0 ? 0 : Math.min(1, (sxy * sxy) / (sxx * syy));

  const loads = pts.map((p) => p.loadKg);
  return {
    ok: true, n, a, b, r2,
    minLoad: Math.min(...loads),
    maxLoad: Math.max(...loads),
    velAt: (kg) => a + b * kg,
    loadAt: (vel) => (b === 0 ? NaN : (vel - a) / b),
  };
}

/* 1RM estimado: la carga a la que la recta cruza la velocidad umbral.
   `extrapolation` dice cuánto más allá del peso más pesado que
   realmente levantó está ese cruce. Arriba de ~1,3 el número es una
   suposición larga y hay que decirlo. */
export function estimate1RM(fit, exerciseId) {
  if (!fit.ok || fit.b >= 0) return null;    // pendiente positiva: datos sin sentido
  const mvt = MVT[exerciseId] ?? MVT[0];
  const kg = fit.loadAt(mvt);
  if (!isFinite(kg) || kg <= 0) return null;
  return {
    kg,
    mvt,
    extrapolation: kg / fit.maxLoad,
    /* Confianza honesta, no decorativa: castiga tanto el r² bajo como
       extrapolar lejos, y no sube de "media" con menos de 4 series. */
    confidence: confidenceOf(fit, kg / fit.maxLoad),
  };
}

function confidenceOf(fit, extrap) {
  if (fit.n < 3 || fit.r2 < 0.5 || extrap > 1.6) return 'baja';
  if (fit.n < 4 || fit.r2 < 0.85 || extrap > 1.3) return 'media';
  return 'alta';
}

/* Carga sugerida para entrenar hoy a una velocidad objetivo. */
export function loadForVelocity(fit, targetVel) {
  if (!fit.ok || fit.b >= 0) return null;
  const kg = fit.loadAt(targetVel);
  return isFinite(kg) && kg > 0 ? kg : null;
}

/* Un punto por serie: la mejor rep de la serie contra la carga usada.
   Se toma la MEJOR y no el promedio porque el promedio arrastra la
   fatiga de las últimas reps, y la relación carga-velocidad describe
   lo que el atleta puede hacer fresco, no cansado. */
export function pointsFromSets(sets, exerciseId) {
  return sets
    .filter((s) => s.exerciseId === exerciseId && s.loadKg > 0 && s.bestMeanVel > 0)
    .map((s) => ({
      loadKg: s.loadKg,
      vel: s.bestMeanVel,
      at: s.startedAt,
      reps: s.repCount,
      /* Marcadas para poder dibujarlas más apagadas: una serie con
         reps saturadas o sin reposo tiene la velocidad menos confiable. */
      suspect: !!(s.flags?.saturated || s.flags?.weakZupt),
    }));
}
