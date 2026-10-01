/* ============================================================
   store.js — historial local.

   localStorage y no IndexedDB a propósito. Una serie serializada pesa
   unos 700 bytes; con el cupo de 5 MB entran más de 6000 series, o sea
   varios años entrenando cuatro veces por semana. IndexedDB es
   asíncrona, tiene versionado y migraciones, y no compra nada a esta
   escala. Si algún día hace falta sincronizar con la nube, el cambio se
   hace acá adentro y el resto de la app no se entera.

   Todo se guarda en el teléfono. No hay cuenta, no hay servidor, no se
   sube nada. Es una decisión de producto, no una limitación técnica:
   los registros son del usuario y viven en su telefono.
   ============================================================ */

const KEY = 'boost.sets.v1';
const PREFS = 'boost.prefs.v1';

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    /* Modo incógnito, cupo lleno o JSON corrupto. Se pierde el
       historial, pero la app tiene que seguir entrenando igual. */
    return fallback;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

export const store = {
  /* --- series ---------------------------------------------- */

  all() {
    const sets = read(KEY, []);
    return Array.isArray(sets) ? sets : [];
  },

  add(set) {
    const sets = this.all();
    sets.push(compact(set));
    /* Tope duro por si alguien deja el simulador corriendo un mes:
       más viejo que las últimas 2000 series se descarta. */
    if (sets.length > 2000) sets.splice(0, sets.length - 2000);
    write(KEY, sets);
    return sets;
  },

  remove(startedAt) {
    const sets = this.all().filter((s) => s.startedAt !== startedAt);
    write(KEY, sets);
    return sets;
  },

  clear() { write(KEY, []); },

  /* Sesiones = series agrupadas por día, la más reciente primero.
     El día se corta a las 4 de la mañana y no a medianoche: un
     entrenamiento nocturno que termina 00:30 pertenece al día anterior. */
  sessions() {
    const byDay = new Map();
    for (const s of this.all()) {
      const d = new Date(s.startedAt - 4 * 3600 * 1000);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!byDay.has(key)) byDay.set(key, { key, date: startOfDay(s.startedAt), sets: [] });
      byDay.get(key).sets.push(s);
    }
    return [...byDay.values()]
      .map((sess) => {
        sess.sets.sort((a, b) => a.startedAt - b.startedAt);
        sess.reps = sess.sets.reduce((n, s) => n + s.repCount, 0);
        sess.volumeKg = sess.sets.reduce((v, s) => v + s.repCount * s.loadKg, 0);
        sess.exercises = [...new Set(sess.sets.map((s) => s.exerciseId))];
        return sess;
      })
      .sort((a, b) => b.date - a.date);
  },

  /* --- preferencias ---------------------------------------- */

  prefs() {
    return { exerciseId: 1, loadKg: 60, ...read(PREFS, {}) };
  },

  setPrefs(patch) {
    const next = { ...this.prefs(), ...patch };
    write(PREFS, next);
    return next;
  },

  /* --- exportar -------------------------------------------- */

  /* CSV y no JSON: es lo que se abre en una planilla sin explicaciones,
     y el punto de exportar es que los datos sean tuyos de verdad. */
  toCsv() {
    const head = [
      'fecha', 'ejercicio_id', 'carga_kg', 'rep', 'vel_media_ms',
      'vel_propulsiva_ms', 'vel_pico_ms', 'rom_m', 'conc_ms', 'ecc_ms',
      'pausa_ms', 'flags',
    ].join(',');

    const rows = [];
    for (const s of this.all()) {
      const iso = new Date(s.startedAt).toISOString();
      for (const r of s.reps || []) {
        rows.push([
          iso, s.exerciseId, s.loadKg.toFixed(1), r.i,
          r.v.toFixed(3), r.p.toFixed(3), r.k.toFixed(3), r.r.toFixed(3),
          r.c, r.e, r.u, r.f,
        ].join(','));
      }
    }
    return [head, ...rows].join('\n');
  },
};

/* Se guarda una forma compacta, con claves de una letra en las reps.
   Con 20 reps por serie, los nombres largos triplican el tamaño del
   historial sin agregar nada: esto no lo lee un humano, lo lee la app. */
function compact(s) {
  return {
    startedAt: s.startedAt,
    setIndex: s.setIndex,
    exerciseId: s.exerciseId,
    loadKg: s.loadKg,
    repCount: s.repCount,
    bestMeanVel: s.bestMeanVel,
    firstRepVel: s.firstRepVel,
    lastRepVel: s.lastRepVel,
    velocityLoss: s.velocityLoss,
    durationMs: s.durationMs,
    flags: {
      saturated: !!s.flags?.saturated,
      weakZupt: !!s.flags?.weakZupt,
      romOutlier: !!s.flags?.romOutlier,
      highRotation: !!s.flags?.highRotation,
    },
    reps: (s.reps || []).map((r) => ({
      i: r.repIndex,
      v: round3(r.meanConcVel),
      p: round3(r.meanPropVel),
      k: round3(r.peakVel),
      r: round3(r.rom),
      c: r.concMs, e: r.eccMs, u: r.pauseMs,
      f: r.quality?.raw ?? 0,
      x: r.peakVelPos,
    })),
  };
}

const round3 = (v) => Math.round(v * 1000) / 1000;

function startOfDay(ts) {
  const d = new Date(ts - 4 * 3600 * 1000);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
