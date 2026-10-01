/* ============================================================
   log.js — descarga del log interno del sensor.

   Herramienta interna, no el producto. Es de donde sale el dataset: el
   sensor graba las series en su flash aunque el teléfono no esté cerca, y
   acá se bajan como `.vbt`, el mismo formato que leen `replay.exe` y
   `metrics.py`.

   Lo que más importa de esta pantalla no es bajar el archivo: es que si la
   descarga sale incompleta, SE VEA. Por BLE se pierden lotes y no hay forma
   de pedirlos de nuevo. Un archivo corto que se presenta como completo
   envenena el dataset y nadie se entera hasta que las métricas no cierran.
   ============================================================ */

import { Sensor } from './sensor.js';
import { BleSensor, bleSupported } from './ble.js';
import { SimSensor } from './sim.js';
import { exerciseName, SESION_ABIERTA } from './protocol.js';
import { icono } from './icons.js';
import { sfx } from './sfx.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

const app = { sensor: null, sesiones: [], bajando: false };

/* --- Íconos ------------------------------------------------- */
$('icoBt').innerHTML = icono('bluetooth', 18);
$('icoRecargar').innerHTML = icono('recargar', 15);
$('icoBorrar').innerHTML = icono('basura', 18);

/* --- Soporte ------------------------------------------------- */

function esIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

if (!bleSupported()) {
  const n = $('soporteNota');
  n.hidden = false;
  n.textContent = esIOS()
    ? 'En iPhone no se puede conectar el sensor: ningún navegador de iOS tiene Web Bluetooth. Para descargar el log hace falta un Android con Chrome.'
    : 'Este navegador no tiene Web Bluetooth. Hace falta Chrome o Edge en Android, Windows o macOS.';
  $('btnConnect').disabled = true;
}

/* --- Pantallas ---------------------------------------------- */

function mostrar(cual) {
  $('panel-conectar').hidden = cual !== 'conectar';
  $('panel-lista').hidden = cual !== 'lista';
  window.scrollTo(0, 0);
}

/* --- Conexión ------------------------------------------------ */

$('btnConnect').addEventListener('click', () => conectar(new BleSensor()));
$('btnSim').addEventListener('click', () => conectar(new SimSensor()));

async function conectar(transporte) {
  const s = new Sensor(transporte);
  try {
    await s.connect();
  } catch (err) {
    if (err?.name !== 'NotFoundError') toast(err.message || 'No se pudo conectar');
    return;
  }

  app.sensor = s;
  s.addEventListener('connection', (e) => {
    if (!e.detail.connected) {
      app.sensor = null;
      app.bajando = false;
      $('chipEstado').textContent = 'Sin conectar';
      mostrar('conectar');
      toast('Se perdió la conexión con el sensor.');
    }
  });
  s.addEventListener('status', pintarEspacio);

  $('nombreSensor').textContent = s.name;
  $('chipEstado').textContent = s.simulated ? 'Simulado' : 'Conectado';

  mostrar('lista');
  await releer();
}

$('btnDesconectar').addEventListener('click', () => app.sensor?.disconnect());

/* --- Lista de sesiones ---------------------------------------- */

async function releer() {
  if (!app.sensor || app.bajando) return;
  $('btnRecargar').disabled = true;
  try {
    app.sesiones = await app.sensor.listarSesiones();
  } catch (err) {
    toast(err.message || 'No se pudo leer la lista de sesiones.');
    app.sesiones = [];
  } finally {
    $('btnRecargar').disabled = false;
  }
  pintarLista();
  pintarEspacio();
}

$('btnRecargar').addEventListener('click', () => { sfx.tap(); releer(); });

function pintarEspacio() {
  const st = app.sensor?.status;
  if (!st) { $('espacio').textContent = ''; return; }
  const libres = st.logFreeBytes ?? 0;
  const mb = (libres / (1024 * 1024)).toFixed(1);
  /* Traducido a minutos de grabación, que es lo que uno necesita saber antes
     de ir al gimnasio. En bytes no le dice nada a nadie. */
  const min = Math.floor(libres / 12 / 208 / 60);
  $('espacio').textContent =
    `${mb} MB LIBRES · ALCANZA PARA ~${min} MIN DE GRABACIÓN`;
}

function pintarLista() {
  const cont = $('sesiones');
  cont.textContent = '';
  $('vacio').hidden = app.sesiones.length > 0;

  app.sesiones.forEach((s, i) => cont.appendChild(tarjeta(s, i)));
}

const fmtFecha = (unix) => {
  const d = new Date(unix * 1000);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const fmtKg = (kg) => (kg % 1 === 0 ? String(kg) : kg.toFixed(1).replace('.', ','));

function tarjeta(s, indice) {
  const abierta = s.muestras === SESION_ABIERTA;

  const caja = el('div', 'ses');
  if (abierta) caja.classList.add('ses--abierta');

  const top = el('div', 'ses__top');
  top.appendChild(el('span', 'ses__ej', exerciseName(s.exerciseId)));
  top.appendChild(el('span', 'ses__kg', `${fmtKg(s.loadKg)} kg`));
  caja.appendChild(top);

  const meta = el('p', 'ses__meta');
  if (abierta) {
    meta.textContent = `${fmtFecha(s.t0Unix)} · ${s.odrHz} HZ`;
  } else {
    const seg = s.muestras / s.odrHz;
    const kb = Math.round((32 + s.muestras * 12) / 1024);
    meta.textContent = `${fmtFecha(s.t0Unix)} · ${s.muestras.toLocaleString('es')} MUESTRAS · ` +
      `${Math.floor(seg / 60)}:${String(Math.round(seg % 60)).padStart(2, '0')} · ${kb} KB`;
  }
  caja.appendChild(meta);

  if (abierta) {
    /* Sin `sample_count` no se sabe dónde termina la sesión: volcarla
       mandaría basura hasta el final de la flash. El firmware la rechaza y
       acá se explica por qué, en vez de dejar un botón que siempre falla. */
    caja.appendChild(el('p', 'ses__aviso',
      'Quedó abierta: se cortó la energía en medio de la grabación y no se ' +
      'sabe dónde termina. No se puede descargar.'));
    return caja;
  }

  const prog = el('div', 'prog');
  prog.hidden = true;
  const pista = el('div', 'prog__pista');
  const barra = el('div', 'prog__barra');
  pista.appendChild(barra);
  prog.appendChild(pista);
  const txt = el('p', 'prog__txt', '');
  prog.appendChild(txt);

  const acciones = el('div', 'ses__acciones');
  const btn = el('button', 'btn btn--primary');
  btn.type = 'button';
  btn.innerHTML = `${icono('descargar', 18)}<span>Descargar</span>`;
  btn.addEventListener('click', () => bajar(indice, s, { btn, prog, barra, txt }));
  acciones.appendChild(btn);
  caja.appendChild(acciones);
  caja.appendChild(prog);

  return caja;
}

/* --- La descarga --------------------------------------------- */

async function bajar(indice, s, ui) {
  if (!app.sensor || app.bajando) return;

  /* Una sola descarga a la vez: las notificaciones de las dos llegarían por
     la misma característica y se mezclarían sin forma de separarlas. */
  app.bajando = true;
  ui.btn.disabled = true;
  ui.prog.hidden = false;
  ui.prog.classList.remove('prog--mal');
  ui.barra.style.width = '0%';
  ui.txt.textContent = 'Pidiendo la sesión…';

  try {
    const r = await app.sensor.descargarSesion(indice, {
      alAvanzar: (v) => {
        const pct = s.muestras ? Math.min(100, (v.recibidas / s.muestras) * 100) : 100;
        ui.barra.style.width = `${pct}%`;
        ui.txt.textContent =
          `${v.recibidas.toLocaleString('es')} de ${s.muestras.toLocaleString('es')} muestras · ${pct.toFixed(0)}%`;
      },
    });

    guardar(r, s);

    if (r.completo) {
      ui.barra.style.width = '100%';
      ui.txt.textContent = `Listo: ${r.recibidas.toLocaleString('es')} muestras.`;
      sfx.guardar();
      toast('Descargado. Pasalo a firmware/dataset/raw/ en la compu.');
    } else {
      /* Se guarda igual — los datos que llegaron sirven — pero no se puede
         decir "listo". El archivo tiene un agujero en el medio. */
      ui.prog.classList.add('prog--mal');
      ui.txt.textContent =
        `INCOMPLETO: llegaron ${r.recibidas.toLocaleString('es')} de ${r.declarado.toLocaleString('es')} muestras ` +
        `(${r.perdidos} lote${r.perdidos === 1 ? '' : 's'} perdido${r.perdidos === 1 ? '' : 's'}).`;
      sfx.aviso();
      toast('Descarga incompleta: se perdieron lotes. El archivo quedó con un ' +
        'hueco y está marcado como tal. Probá de nuevo más cerca del sensor.');
    }
  } catch (err) {
    ui.prog.classList.add('prog--mal');
    ui.txt.textContent = err.message || 'Falló la descarga.';
    sfx.aviso();
    toast(err.message || 'Falló la descarga.');
  } finally {
    app.bajando = false;
    ui.btn.disabled = false;
  }
}

function guardar(r, s) {
  const p = (x) => String(x).padStart(2, '0');
  const d = new Date(s.t0Unix * 1000);
  const base = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${exerciseName(s.exerciseId).toLowerCase().replace(/[^a-z]/g, '')}` +
    `_${fmtKg(s.loadKg).replace(',', '')}kg_${p(d.getHours())}${p(d.getMinutes())}` +
    /* El estado va en el NOMBRE y no sólo adentro del `.json`: seis meses
       después, mirando una carpeta con cuarenta archivos, nadie abre los
       metadatos de cada uno para ver cuál tenía un hueco. */
    (r.completo ? '' : '_INCOMPLETO');

  descargar(r.blob, `${base}.vbt`);
  /* Un respiro entre las dos: algunos navegadores móviles descartan la
     segunda descarga si salen juntas. */
  setTimeout(() => descargar(app.sensor.metadataDeVolcado(r), `${base}.json`), 700);
}

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = el('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* --- Borrar el log -------------------------------------------- */

$('btnBorrar').addEventListener('click', async () => {
  if (!app.sensor) return;
  if (app.bajando) { toast('Esperá a que termine la descarga.'); return; }

  const n = app.sesiones.length;
  const ok = confirm(
    `Se van a borrar las ${n} sesiones del sensor. No se puede deshacer.\n\n` +
    'Si no las bajaste todavía, se pierden. ¿Seguir?');
  if (!ok) return;

  try {
    await app.sensor.borrarLog();
    /* El borrado tarda decenas de segundos: el firmware lo hace de a un
       sector por vuelta del lazo para poder seguir parpadeando el LED. La
       lista se relee sola cuando termina, no en el momento. */
    toast('Borrando. Tarda un rato; releé la lista en unos segundos.');
  } catch (err) {
    toast(err.message || 'No se pudo borrar.');
  }
});

/* --- Utilidades ----------------------------------------------- */

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 5200);
}

mostrar('conectar');
