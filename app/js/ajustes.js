/* ============================================================
   ajustes.js — la pantalla de ajustes del sensor.

   Herramienta interna, no el producto. Existe para calibrar en el gimnasio,
   con la barra en la mano, sin recompilar ni volver a la computadora. Es la
   diferencia entre iterar diez veces en una sesión o dos por semana.

   Los valores viven en el SENSOR, no en el teléfono: sin conexión no hay
   nada que mostrar, y nada se guarda acá. Un valor cacheado que ya no
   coincide con el chip sería peor que no mostrar ninguno.
   ============================================================ */

import { Sensor } from './sensor.js';
import { BleSensor, bleSupported } from './ble.js';
import { SimSensor } from './sim.js';
import { GRUPOS, ajuste, SIN_TEXTO, SIN_GRUPO } from './config.js';
import { icono } from './icons.js';
import { sfx } from './sfx.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

const app = {
  sensor: null,
  valores: new Map(),   // nombre -> número, o null si no se pudo leer
  filas: new Map(),     // nombre -> { num, valor, menos, mas }
};

/* Si alguien agrega un parámetro al firmware y regenera params.js sin tocar
   config.js, la pantalla lo mostraría con el identificador en mayúsculas o
   directamente no lo mostraría. Mejor decirlo en la consola. */
if (SIN_TEXTO.length) console.warn('parámetros sin texto:', SIN_TEXTO);
if (SIN_GRUPO.length) console.warn('parámetros sin grupo:', SIN_GRUPO);

/* --- Íconos ------------------------------------------------- */
$('icoBt').innerHTML = icono('bluetooth', 18);
$('icoRecargar').innerHTML = icono('recargar', 15);

/* --- Soporte ------------------------------------------------- */

function esIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

if (!bleSupported()) {
  const n = $('soporteNota');
  n.hidden = false;
  n.textContent = esIOS()
    ? 'En iPhone no se puede conectar el sensor: ningún navegador de iOS tiene Web Bluetooth. Para calibrar hace falta un Android con Chrome. Con el simulador podés recorrer la pantalla.'
    : 'Este navegador no tiene Web Bluetooth. Hace falta Chrome o Edge en Android, Windows o macOS.';
  $('btnConnect').disabled = true;
}

/* --- Pantallas ---------------------------------------------- */

function mostrar(cual) {
  $('panel-conectar').hidden = cual !== 'conectar';
  $('panel-ajustes').hidden = cual !== 'ajustes';
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
    /* Cancelar el diálogo del navegador no es un error que valga un cartel. */
    if (err?.name !== 'NotFoundError') toast(err.message || 'No se pudo conectar');
    return;
  }

  app.sensor = s;
  s.addEventListener('connection', (e) => {
    if (!e.detail.connected) {
      app.sensor = null;
      $('chipEstado').textContent = 'Sin conectar';
      mostrar('conectar');
      toast('Se perdió la conexión con el sensor.');
    }
  });
  /* El flag de config pendiente llega en el Status, cada 10 s. */
  s.addEventListener('status', pintarPendiente);

  $('nombreSensor').textContent = s.name;
  $('chipEstado').textContent = s.simulated ? 'Simulado' : 'Conectado';

  construir();
  mostrar('ajustes');
  await releerTodo();
}

$('btnDesconectar').addEventListener('click', () => app.sensor?.disconnect());

/* --- Construcción de la lista -------------------------------- */

function construir() {
  const cont = $('grupos');
  cont.textContent = '';
  app.filas.clear();

  for (const grupo of GRUPOS) {
    const g = el('section', 'grupo');
    g.appendChild(el('h3', 'grupo__h', grupo.titulo));
    if (grupo.intro) g.appendChild(el('p', 'grupo__intro', grupo.intro));
    for (const nombre of grupo.params) g.appendChild(fila(nombre));
    cont.appendChild(g);
  }
}

function fila(nombre) {
  const a = ajuste(nombre);

  const caja = el('div', 'aj');
  if (a.critico) caja.classList.add('aj--critico');
  if (!a.escribible) caja.classList.add('aj--fijo');

  const top = el('div', 'aj__top');
  top.appendChild(el('span', 'aj__label', a.label));
  /* El rango a la vista: sin esto uno descubre el tope apretando hasta que
     el botón deja de responder, que parece que la app se colgó. */
  if (a.escribible) top.appendChild(el('span', 'aj__rango', `${a.min}–${a.max}`));
  caja.appendChild(top);

  if (a.ayuda) caja.appendChild(el('p', 'aj__ayuda', a.ayuda));

  const row = el('div', 'aj__row');
  const valor = el('div', 'aj__valor aj__valor--desconocido');
  const num = el('span', null, '—');
  valor.appendChild(num);
  if (a.unidad) valor.appendChild(el('span', 'aj__unidad', a.unidad));
  row.appendChild(valor);

  if (a.escribible) {
    const pasos = el('div', 'aj__pasos');
    const menos = boton('menos', `Bajar ${a.label}`);
    const mas = boton('mas', `Subir ${a.label}`);
    menos.addEventListener('click', () => cambiar(nombre, -a.paso));
    mas.addEventListener('click', () => cambiar(nombre, a.paso));
    pasos.append(menos, mas);
    row.appendChild(pasos);
    app.filas.set(nombre, { num, valor, menos, mas });
  } else {
    row.appendChild(el('span', 'aj__fijo', 'FIJO'));
    app.filas.set(nombre, { num, valor });
  }

  caja.appendChild(row);
  return caja;
}

function boton(ico, etiqueta) {
  const b = el('button', 'aj__step');
  b.type = 'button';
  b.setAttribute('aria-label', etiqueta);
  b.innerHTML = icono(ico, 20);
  return b;
}

/* --- Leer y escribir ----------------------------------------- */

async function releerTodo() {
  if (!app.sensor) return;
  const nombres = GRUPOS.flatMap((g) => g.params);
  $('btnRecargar').disabled = true;
  document.body.classList.add('cargando');
  try {
    /* Se pinta cada valor apenas llega en vez de esperar a los 22: por BLE
       la tanda entera pasa el segundo, y una pantalla de guiones quietos se
       lee como que la app se colgó. */
    app.valores = await app.sensor.leerAjustes(nombres, (nombre, valor) => {
      app.valores.set(nombre, valor);
      pintar(nombre);
    });
    for (const n of nombres) pintar(n);
  } finally {
    document.body.classList.remove('cargando');
    $('btnRecargar').disabled = false;
  }
}

$('btnRecargar').addEventListener('click', () => { sfx.tap(); releerTodo(); });

function pintar(nombre) {
  const f = app.filas.get(nombre);
  if (!f) return;
  const v = app.valores.get(nombre);
  const a = ajuste(nombre);

  /* Un valor que no se pudo leer se muestra como desconocido y no como cero:
     un cero se parece demasiado a un dato. */
  f.num.textContent = v == null ? '—' : String(v);
  f.valor.classList.toggle('aj__valor--desconocido', v == null);

  if (f.menos) {
    f.menos.disabled = v == null || v - a.paso < a.min;
    f.mas.disabled = v == null || v + a.paso > a.max;
  }
}

async function cambiar(nombre, delta) {
  if (!app.sensor) return;
  const actual = app.valores.get(nombre);
  if (actual == null) { toast('Ese ajuste no se pudo leer del sensor.'); return; }

  const a = ajuste(nombre);
  const nuevo = Math.min(a.max, Math.max(a.min, actual + delta));
  if (nuevo === actual) return;

  try {
    await app.sensor.escribirAjuste(nombre, nuevo);
  } catch (err) {
    /* El sensor tiene la última palabra: si rechazó, se relee para mostrar lo
       que de verdad quedó y no lo que la app suponía. */
    toast(err.message || 'El sensor rechazó el cambio.');
    sfx.aviso();
    try { app.valores.set(nombre, await app.sensor.leerAjuste(nombre)); }
    catch { app.valores.set(nombre, null); }
    pintar(nombre);
    return;
  }

  app.valores.set(nombre, nuevo);
  pintar(nombre);
  if (delta > 0) sfx.pesoArriba(0); else sfx.pesoAbajo(0);
}

/* --- Restaurar de fábrica ------------------------------------ */

$('btnDefaults').addEventListener('click', async () => {
  if (!app.sensor) return;
  const ok = confirm('Se van a escribir los valores de fábrica de todos los ' +
    'ajustes. Lo que hayas calibrado se pierde. ¿Seguir?');
  if (!ok) return;

  const nombres = GRUPOS.flatMap((g) => g.params).filter((n) => ajuste(n).escribible);
  let fallaron = 0;
  for (const n of nombres) {
    /* En serie: son escrituras con respuesta y el sensor las atiende de a una.
       El orden importa, porque los pares mínimo/máximo se validan entre sí y
       uno puede rechazarse por el estado transitorio del otro. Por eso al
       final se relee todo en vez de confiar en lo que se mandó. */
    try { await app.sensor.escribirAjuste(n, ajuste(n).def); }
    catch { fallaron++; }
  }

  await releerTodo();
  if (fallaron) {
    const plural = fallaron > 1 ? 's' : '';
    toast(`Restaurado, salvo ${fallaron} ajuste${plural}. Probá de nuevo.`);
  } else {
    toast('Valores de fábrica restaurados.');
  }
});

/* --- Cambios sin aplicar al chip ------------------------------ */

/* Los umbrales del IMU no bajan a los registros en el momento: el chip puede
   estar en medio de una serie. Sin este aviso, la pantalla mostraría el valor
   nuevo como si ya estuviera en uso. */
function pintarPendiente() {
  $('avisoPendiente').hidden = !app.sensor?.status?.configDirty;
}

/* --- Utilidades ----------------------------------------------- */

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4200);
}

mostrar('conectar');
