/* ============================================================
   grabar.js — la pantalla de captura del dataset.

   Herramienta interna, no el producto. Junta señal humana real con el
   IMU del teléfono mientras el sensor no llegó, en el mismo formato
   `.vbt` que lee `replay.exe`.

   El flujo está pensado para usarse en el gimnasio, con el teléfono
   atado a la barra y sin poder mirarlo mientras se levanta:
   configurar → grabar → anotar cuántas reps fueron de verdad → bajar
   los dos archivos.
   ============================================================ */

import { EXERCISES, exerciseName, clamp } from './protocol.js';
import { GrabadorIMU, haySoporte, necesitaPermiso } from './imu.js';
import { icono } from './icons.js';
import { sfx } from './sfx.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

const STEP = 2.5;
const MAX_KG = 300;

const app = {
  exerciseId: 1,
  loadKg: 60,
  grabador: new GrabadorIMU(),
  vbt: null,
  meta: null,
  timer: null,
};

/* --- Íconos ------------------------------------------------- */
$('icoRec').innerHTML = icono('velocidad', 18);
$('icoStop').innerHTML = icono('stop', 17);
$('icoDown').innerHTML = icono('descargar', 18);
$('loadMinus').innerHTML = icono('menos', 22);
$('loadPlus').innerHTML = icono('mas', 22);
$('repsMenos').innerHTML = icono('menos', 22);
$('repsMas').innerHTML = icono('mas', 22);

/* --- Soporte del dispositivo -------------------------------- */
/* Se avisa ANTES de que apriete grabar, no después de una serie
   perdida. Un teléfono sin acelerómetro accesible no da error: da
   cero muestras, que es peor. */
if (!haySoporte()) {
  const n = $('soporteNota');
  n.hidden = false;
  n.textContent = 'Este navegador no expone el acelerómetro. Abrí esta página ' +
    'desde el celular, no desde la computadora.';
  $('btnGrabar').disabled = true;
} else if (necesitaPermiso()) {
  const n = $('soporteNota');
  n.hidden = false;
  n.textContent = 'iPhone te va a pedir permiso para usar el movimiento cuando ' +
    'aprietes grabar. Hay que aceptarlo.';
}

/* --- Ejercicio y carga -------------------------------------- */

const box = $('exercises');
for (const ex of EXERCISES) {
  const b = el('button', null, ex.name);
  b.type = 'button';
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', String(ex.id === app.exerciseId));
  b.addEventListener('click', () => {
    app.exerciseId = ex.id;
    sfx.tap();
    for (const s of box.children) s.setAttribute('aria-checked', String(s === b));
  });
  box.appendChild(b);
}

const fmtKg = (kg) => (kg % 1 === 0 ? String(kg) : kg.toFixed(1).replace('.', ','));

function setLoad(kg) {
  app.loadKg = clamp(Math.round(kg / STEP) * STEP, 0, MAX_KG);
  const t = fmtKg(app.loadKg);
  $('loadInput').value = t;
  const dig = t.replace(/[^0-9]/g, '').length;
  $('loadInput').style.width = `${dig + (t.length - dig) * 0.42}ch`;
}

let paso = 0, pasoTimer = null;
const contarPaso = () => {
  clearTimeout(pasoTimer);
  pasoTimer = setTimeout(() => { paso = 0; }, 1000);
  return paso++;
};

$('loadMinus').addEventListener('click', () => { if (app.loadKg > 0) { sfx.pesoAbajo(contarPaso()); setLoad(app.loadKg - STEP); } });
$('loadPlus').addEventListener('click', () => { if (app.loadKg < MAX_KG) { sfx.pesoArriba(contarPaso()); setLoad(app.loadKg + STEP); } });
$('loadInput').addEventListener('focus', (e) => e.target.select());
$('loadInput').addEventListener('change', (e) => {
  const v = parseFloat(e.target.value.replace(',', '.'));
  setLoad(isFinite(v) ? v : app.loadKg);
});
setLoad(app.loadKg);

/* --- Repeticiones reales ------------------------------------ */

function setReps(n) {
  const v = clamp(Math.round(n), 0, 99);
  $('repsInput').value = String(v);
  $('repsInput').style.width = `${String(v).length}ch`;
}
$('repsMenos').addEventListener('click', () => { sfx.tap(); setReps(+$('repsInput').value - 1); });
$('repsMas').addEventListener('click', () => { sfx.tap(); setReps(+$('repsInput').value + 1); });
$('repsInput').addEventListener('focus', (e) => e.target.select());
$('repsInput').addEventListener('change', (e) => setReps(parseInt(e.target.value, 10) || 0));

/* --- Pantallas ---------------------------------------------- */

function mostrar(cual) {
  for (const p of ['config', 'rec', 'fin']) $(`panel-${p}`).hidden = p !== cual;
  window.scrollTo(0, 0);
}

/* --- Grabar -------------------------------------------------- */

let wakeLock = null;

$('btnGrabar').addEventListener('click', async () => {
  try {
    await app.grabador.iniciar();
  } catch (e) {
    toast(e.message);
    return;
  }

  /* La pantalla no se puede apagar: al bloquearse, el navegador deja de
     entregar eventos de movimiento y la grabación se corta sin aviso. */
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* si no se puede, se graba igual */ }

  sfx.comenzar();
  mostrar('rec');

  const t0 = Date.now();
  app.timer = setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1000);
    $('recTiempo').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const n = app.grabador.cantidad;
    $('recN').textContent = String(n);
    $('recHz').textContent = app.grabador.odr ? app.grabador.odr.toFixed(0) : '—';
    $('recKb').textContent = String(Math.round((32 + n * 12) / 1024));
    $('recSub').textContent = `${n} muestras`;
  }, 250);
});

$('btnParar').addEventListener('click', async () => {
  app.grabador.detener();
  clearInterval(app.timer);
  sfx.terminar();

  try { if (wakeLock) { await wakeLock.release(); wakeLock = null; } } catch {}

  const n = app.grabador.cantidad;
  const hz = app.grabador.odr;

  if (n < 60) {
    toast('Grabación demasiado corta, se descarta.');
    mostrar('config');
    return;
  }

  $('finTitulo').textContent = `${exerciseName(app.exerciseId)} · ${fmtKg(app.loadKg)} kg`;
  $('finHz').textContent = hz.toFixed(0);
  $('finN').textContent = String(n);
  $('finDur').textContent = app.grabador.duracionS.toFixed(0);

  /* Si el teléfono entregó muy pocas muestras por segundo, la grabación
     puede no servir para detectar repeticiones. Mejor decirlo ahora que
     descubrirlo cuando se corran las métricas. */
  const nota = $('finNota');
  if (hz < 40) {
    nota.textContent = `Ojo: ${hz.toFixed(0)} Hz es poco. Por debajo de 40 el ` +
      'detector puede perderse repeticiones rápidas. Sirve igual, pero anotalo.';
    sfx.aviso();
  } else {
    nota.textContent = '';
  }

  mostrar('fin');
});

/* --- Descarga ------------------------------------------------ */

function bajar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = el('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

$('btnBajar').addEventListener('click', () => {
  const repsReales = parseInt($('repsInput').value, 10);
  if (!isFinite(repsReales)) { toast('Falta el número de repeticiones reales'); return; }

  const opciones = {
    exerciseId: app.exerciseId,
    loadKg: app.loadKg,
    repsReales,
    nota: $('notaInput').value.trim(),
  };

  /* El nombre sigue el esquema de DATASET.md lo más cerca que se puede
     desde un navegador, que no crea carpetas: fecha, ejercicio, carga y
     hora. La hora evita pisar una grabación con otra del mismo día. */
  const f = new Date();
  const p = (x) => String(x).padStart(2, '0');
  const base = `${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())}` +
    `_${(EXERCISES.find((e) => e.id === app.exerciseId)?.short || 'gen').toLowerCase()}` +
    `_${fmtKg(app.loadKg).replace(',', '')}kg_${p(f.getHours())}${p(f.getMinutes())}`;

  bajar(app.grabador.aVbt(opciones), `${base}.vbt`);
  /* Un respiro entre las dos descargas: algunos navegadores móviles
     descartan la segunda si salen juntas. */
  setTimeout(() => bajar(app.grabador.aJson(opciones), `${base}.json`), 700);

  sfx.guardar();
  toast('Descargados. Pasalos a dataset/raw/ en la compu.');
});

$('btnOtra').addEventListener('click', () => {
  $('notaInput').value = '';
  sfx.tap();
  mostrar('config');
});

/* --- Utilidades ---------------------------------------------- */

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4200);
}

/* Si el teléfono se bloquea o se cambia de app durante la grabación, los
   eventos de movimiento se cortan. Se avisa en vez de dejar un archivo
   con un agujero silencioso en el medio. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden && app.grabador.grabando) {
    toast('La pantalla se apagó: la grabación puede tener un hueco.');
  }
});

mostrar('config');
