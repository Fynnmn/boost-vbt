/* ============================================================
   main.js — interfaz.

   Nada de framework. La app tiene cinco pantallas y un solo flujo;
   un framework acá agregaría un paso de build, cientos de kilobytes
   y una dependencia que hay que mantener, a cambio de nada. Igual que
   la landing: se edita, se recarga, se sube.

   Todo el estado vive en `app`. Cuando algo cambia, se vuelve a
   dibujar la pantalla que corresponde. Con cinco pantallas alcanza.
   ============================================================ */

import { EXERCISES, exerciseName, clamp } from './protocol.js';
import { BleSensor, bleSupported } from './ble.js';
import { SimSensor } from './sim.js';
import { Sensor } from './sensor.js';
import { store } from './store.js';
import { fitProfile, estimate1RM, pointsFromSets, zoneFor, ZONES, MVT } from './lv.js';
import { icono } from './icons.js';
import { sfx } from './sfx.js';
import { voz } from './voz.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

const app = {
  sensor: null,
  view: 'train',
  phase: 'connect',        // connect | setup | live | summary
  exerciseId: store.prefs().exerciseId,
  loadKg: store.prefs().loadKg,
  profExerciseId: store.prefs().exerciseId,
  lastSet: null,
};

/* ============================================================
   Navegación
   ============================================================ */

/* ============================================================
   Íconos y sonido
   ============================================================ */

/* Los íconos se pintan una vez al arrancar. Van por `innerHTML` con
   texto que produce este mismo módulo — nunca con datos del usuario. */
function pintarIconos() {
  const fijos = {
    icoConnect: ['bluetooth', 19],
    icoStart: ['play', 18],
    icoStop: ['stop', 17],
    icoSave: ['check', 18],
    icoExport: ['descargar', 15],
    icoWipe: ['basura', 15],
    iosNoteIco: ['info', 17],
    loadMinus: ['menos', 22],
    loadPlus: ['mas', 22],
  };
  for (const [id, [nombre, tam]] of Object.entries(fijos)) {
    const n = $(id);
    if (n) n.innerHTML = icono(nombre, tam);
  }
  for (const s of document.querySelectorAll('[data-ico]')) {
    s.innerHTML = icono(s.dataset.ico, 22);
  }
  pintarBotonSonido();
  pintarBotonVoz();
}

function pintarBotonSonido() {
  $('btnSonido').innerHTML = icono(sfx.activo ? 'sonidoSi' : 'sonidoNo', 18);
  $('btnSonido').setAttribute('aria-label', sfx.activo ? 'Silenciar' : 'Activar sonido');
  $('btnSonido').style.color = sfx.activo ? 'var(--fg-2)' : 'var(--fg-3)';
}

$('btnSonido').addEventListener('click', () => {
  sfx.alternar();
  pintarBotonSonido();
});

/* El botón de manos libres se esconde entero donde el navegador no
   tiene síntesis de voz, en vez de quedar puesto y no hacer nada. Un
   control que no responde se lee como app rota. */
function pintarBotonVoz() {
  const b = $('btnVoz');
  if (!voz.disponible) { b.hidden = true; return; }
  b.innerHTML = icono(voz.activo ? 'voz' : 'vozNo', 18);
  b.setAttribute('aria-label', voz.activo ? 'Apagar manos libres' : 'Manos libres: decir la velocidad en voz alta');
  b.setAttribute('aria-pressed', voz.activo ? 'true' : 'false');
  /* Encendido va en coral y no en el gris del sonido: es el único
     control de la cabecera que cambia lo que pasa DURANTE la serie, y
     conviene ver de un vistazo si quedó prendido. */
  b.style.color = voz.activo ? 'var(--coral)' : 'var(--fg-3)';
}

$('btnVoz').addEventListener('click', () => {
  sfx.tap();
  voz.alternar();
  pintarBotonVoz();
});

$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) { sfx.tap(); showView(b.dataset.view); }
});

function showView(name) {
  app.view = name;
  document.body.dataset.view = name;
  for (const v of ['train', 'history', 'profile']) {
    $(`view-${v}`).hidden = v !== name;
  }
  for (const b of $('tabs').children) b.classList.toggle('is-on', b.dataset.view === name);
  if (name === 'history') renderHistory();
  if (name === 'profile') renderProfile();
  window.scrollTo(0, 0);
}

function showPhase(name) {
  app.phase = name;
  for (const p of ['connect', 'setup', 'live', 'summary']) {
    $(`panel-${p}`).hidden = p !== name;
  }
  document.body.dataset.live = name === 'live' ? '1' : '0';
  /* La regla se mide con clientWidth, y un elemento oculto mide 0: si
     no se recalcula al mostrarla, los márgenes quedan en cero y la
     aguja apunta a un peso que no es. */
  if (name === 'setup') layoutRuler();
  window.scrollTo(0, 0);
}

/* ============================================================
   Conexión
   ============================================================ */

/* Tres motivos distintos por los que el botón de conectar puede no servir, y
   cada uno se arregla de una forma diferente. Decir siempre "tu navegador no
   soporta Bluetooth" mandaría a cambiar de navegador a alguien cuyo problema
   es que abrió la página por HTTP. */
if (!bleSupported()) {
  const n = $('bleNote');
  n.hidden = false;
  n.textContent = isIOS()
    ? 'En iPhone no se puede conectar el sensor: ningún navegador de iOS tiene Web Bluetooth, ni Safari ni el Chrome de iPhone. Para usarlo con el sensor hace falta un Android con Chrome. Mientras tanto podés recorrer la app con el sensor simulado.'
    : !window.isSecureContext
      ? 'El Bluetooth del navegador sólo funciona por HTTPS, y esta página se abrió por una conexión insegura. Abrila con https:// y el botón se habilita.'
      : 'Este navegador no tiene Web Bluetooth. Usá Chrome o Edge en Android, Windows o Mac.';
  $('btnConnect').disabled = true;
}

/* AVISO DE INSTALACIÓN EN iPHONE — no es cosmético.
   Safari borra todo el almacenamiento de un sitio a los 7 días sin
   visitas. Para una app que se abre dos o tres veces por semana, eso
   significa perder el historial entero en cualquier semana de descanso.
   Una app agregada a la pantalla de inicio queda fuera de esa regla:
   lleva su propio contador y no la alcanza el borrado.
   Por eso en iPhone, y sólo si NO está instalada, la app lo dice. */
const enPantallaDeInicio = () =>
  window.navigator.standalone === true ||
  window.matchMedia('(display-mode: standalone)').matches;

if (isIOS() && !enPantallaDeInicio()) {
  const aviso = $('iosNote');
  aviso.hidden = false;
}

$('btnConnect').addEventListener('click', () => attach(new BleSensor()));
$('btnSim').addEventListener('click', () => attach(new SimSensor()));

async function attach(transport) {
  const s = new Sensor(transport);
  s.addEventListener('connection', onConnection);
  s.addEventListener('status', onStatus);
  s.addEventListener('state', onState);
  s.addEventListener('rep', onRep);
  s.addEventListener('set', onSet);

  /* Conectar puede tardar unos segundos. Sin cambiar el texto, el botón
     quedaba gris y quieto y parecía que la app se había colgado. */
  const btn = transport.simulated ? $('btnSim') : $('btnConnect');
  const textoOriginal = btn.textContent;
  btn.textContent = 'Buscando…';
  $('btnConnect').disabled = true;
  $('btnSim').disabled = true;
  try {
    app.sensor = await s.connect();
  } catch (err) {
    /* Cancelar el selector de dispositivos no es un error que haya que
       gritarle al usuario: simplemente cambió de idea. */
    if (err?.name !== 'NotFoundError') toast(err.message || 'No se pudo conectar');
    app.sensor = null;
  } finally {
    btn.textContent = textoOriginal;
    $('btnConnect').disabled = !bleSupported();
    $('btnSim').disabled = false;
  }
}

$('deviceChip').addEventListener('click', async () => {
  if (!app.sensor?.connected) return;
  if (app.phase === 'live') { toast('Terminá la serie antes de desconectar'); return; }
  await app.sensor.disconnect();
});

function onConnection(e) {
  const { connected, name, simulated } = e.detail;
  const dot = $('deviceDot');
  dot.className = 'dot' + (connected ? (simulated ? ' is-sim' : ' is-on') : '');
  $('deviceLabel').textContent = connected
    ? (simulated ? 'Simulado' : name || 'Conectado')
    : 'Sin conectar';
  $('deviceBatt').hidden = !connected;

  if (connected) {
    sfx.conectado();
    showPhase('setup');
    if (simulated) toast('Sensor simulado: los datos son inventados, no medidos.');
  } else {
    sfx.desconectado();
    /* Perder la conexión en medio de una serie tiraba al usuario a la
       pantalla de conectar sin decir nada, y las repeticiones contadas
       hasta ahí desaparecían sin explicación. Ahora al menos se entiende
       qué pasó. */
    const perdidaEnSerie = app.phase === 'live';
    app.sensor = null;
    keepAwake(false);
    $('deviceBatt').hidden = true;
    showPhase('connect');
    if (perdidaEnSerie) {
      toast('Se perdió la conexión con el sensor y la serie se cortó. Volvé a conectarlo.');
    }
  }
}

function onStatus(e) {
  const s = e.detail;
  $('deviceBatt').hidden = false;
  $('deviceBatt').textContent = `${s.batteryPct}%${s.flags.charging ? ' ⚡' : ''}`;
  /* Sólo cuando el código CAMBIA. El firmware repite last_error en cada
     Status, y Status llega cada 10 s: avisar en cada uno haría aparecer
     el mismo cartel seis veces por minuto hasta que el error se limpie. */
  if (s.lastError && s.lastError !== lastErrorShown) toast(s.errorText);
  lastErrorShown = s.lastError;
}
let lastErrorShown = 0;

function onState(e) {
  const s = e.detail;
  if (app.phase !== 'live') return;
  $('liveState').textContent = {
    7: 'Calibrando',
    3: 'Grabando',
    2: 'En espera',
  }[s.state] || s.stateName;
  $('deviceDot').className = 'dot ' + (s.state === 3 ? 'is-live' : app.sensor?.simulated ? 'is-sim' : 'is-on');

  /* El bloque de espera sigue el estado real del sensor. Mientras no
     llegó ninguna repetición, dice qué está pasando; con la primera rep
     lo reemplaza el número y no vuelve a aparecer en toda la serie. */
  if (app.sensor?.reps.length === 0) {
    if (s.state === 7) {
      $('waitingTitle').textContent = 'Calibrando';
      $('waitingSub').textContent = 'Dejá la barra apoyada un segundo.';
    } else if (s.state === 3) {
      /* El sonido de "listo" avisa que puede levantar sin que tenga que
         mirar el teléfono, que ya está montando la barra. Se emite una
         sola vez por serie. */
      if ($('waitingTitle').textContent !== 'Listo') { sfx.listo(); voz.listo(); }
      $('waitingTitle').textContent = 'Listo';
      $('waitingSub').textContent = s.flags.calibrated
        ? 'Levantá cuando quieras.'
        : 'Levantá cuando quieras. No llegó a calibrar: esta serie va a venir marcada.';
    }
  }
}

/* ============================================================
   Antes de la serie: ejercicio y carga
   ============================================================ */

function buildExercisePicker(container, current, onPick) {
  container.replaceChildren();
  for (const ex of EXERCISES) {
    const b = el('button', null, ex.name);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(ex.id === current()));
    b.addEventListener('click', () => {
      onPick(ex.id);
      for (const s of container.children) {
        s.setAttribute('aria-checked', String(s === b));
      }
    });
    container.appendChild(b);
  }
}

buildExercisePicker($('exercises'), () => app.exerciseId, (id) => {
  app.exerciseId = id;
  store.setPrefs({ exerciseId: id });
  app.profExerciseId = id;
  updateSetupHint();
});

/* --- La regla ---------------------------------------------- */
/* 4 px por kilo: coincide con el paso de 10 px de los ticks chicos del
   CSS, así que un tick = 2,5 kg = el salto de un par de discos de 1,25.
   Si cambiás uno, cambiá el otro o la regla miente. */
const PX_PER_KG = 4;
const STEP = 2.5;
const MAX_KG = 300;

const ruler = $('ruler');
const rulerTrack = $('rulerTrack');

function layoutRuler() {
  const w = ruler.clientWidth;
  rulerTrack.style.width = `${MAX_KG * PX_PER_KG}px`;
  rulerTrack.style.marginLeft = `${w / 2}px`;
  rulerTrack.style.marginRight = `${w / 2}px`;

  /* Un número cada 25 kg: coincide con el tick grande del CSS, que cae
     cada 100px = 25 kg. Si cambia PX_PER_KG, esto se acomoda solo. */
  if (rulerTrack.childElementCount === 0) {
    for (let kg = 0; kg <= MAX_KG; kg += 25) {
      const t = el('b', null, String(kg));
      t.style.left = `${kg * PX_PER_KG}px`;
      rulerTrack.appendChild(t);
    }
  }

  setLoad(app.loadKg, true);

  /* Si la asignación no prendió —el navegador la recorta mientras el
     layout no está listo— se reintenta cuando termine de dibujar. Es el
     mismo motivo por el que el handler de scroll ignora un track a medio
     medir: el estado intermedio existe y hay que sobrevivirlo, no
     asumir que no pasa. */
  if (Math.abs(ruler.scrollLeft - app.loadKg * PX_PER_KG) > 1) {
    requestAnimationFrame(() => setLoad(app.loadKg, true));
    /* Y una red de contención por si las tipografías tardan y mueven el
       layout después del frame siguiente. */
    setTimeout(() => setLoad(app.loadKg, true), 250);
  }
}

/* El campo se ajusta al texto que tiene. Con un ancho fijo, "60" dejaba
   un hueco entre el número y el `kg`, y el conjunto se veía descentrado.
   Los dígitos de Archivo Black son tabulares (miden 1ch); la coma no,
   así que se cuenta aparte. */
function ajustarAnchoCarga(texto) {
  const digitos = texto.replace(/[^0-9]/g, '').length;
  const comas = texto.length - digitos;
  $('loadInput').style.width = `${digitos + comas * 0.42}ch`;
}

function setLoad(kg, syncRuler) {
  app.loadKg = clamp(Math.round(kg / STEP) * STEP, 0, MAX_KG);
  $('loadInput').value = fmtKg(app.loadKg);
  ajustarAnchoCarga($('loadInput').value);
  ruler.setAttribute('aria-valuenow', String(app.loadKg));
  /* Se anota a qué posición se está mandando la regla. El handler de
     scroll compara contra esto en vez de usar un candado con
     requestAnimationFrame: los navegadores congelan rAF en pestañas de
     segundo plano y un candado así no se soltaría nunca. */
  if (syncRuler) {
    scrollObjetivo = app.loadKg * PX_PER_KG;
    ruler.scrollLeft = scrollObjetivo;
  }
  store.setPrefs({ loadKg: app.loadKg });
  updateSetupHint();
}

let scrollObjetivo = null;

ruler.addEventListener('scroll', () => {
  /* Una regla que no está en pantalla mide 0 y reporta scrollLeft 0. Ese
     cero no es una intención del usuario: es el navegador armando el
     layout. Sin este corte, mostrar el panel ponía la carga en 0 kg. */
  if (!ruler.offsetParent) return;

  /* Y mientras el track no haya alcanzado su ancho definitivo, el
     scrollLeft que reporta el navegador está recortado al contenido que
     existe en ese instante. En producción, con las tipografías todavía
     cargando, ese estado intermedio duraba lo suficiente como para que
     la app arrancara marcando 0 kg. */
  if (rulerTrack.offsetWidth < MAX_KG * PX_PER_KG) return;

  /* Y este es el eco de la asignación que acaba de hacer setLoad. */
  if (scrollObjetivo !== null && Math.abs(ruler.scrollLeft - scrollObjetivo) < 1) {
    scrollObjetivo = null;
    return;
  }
  scrollObjetivo = null;

  const kg = clamp(Math.round(ruler.scrollLeft / PX_PER_KG / STEP) * STEP, 0, MAX_KG);
  if (kg === app.loadKg) return;
  /* Un tic por cada 2,5 kg al arrastrar, como el trinquete de un dial
     de metal. Muy bajo: arrastrar de 60 a 120 son 24 tics seguidos. */
  sfx.tic();
  app.loadKg = kg;
  $('loadInput').value = fmtKg(kg);
  ajustarAnchoCarga($('loadInput').value);
  ruler.setAttribute('aria-valuenow', String(kg));
  store.setPrefs({ loadKg: kg });
  updateSetupHint();
}, { passive: true });

ruler.addEventListener('keydown', (e) => {
  const d = { ArrowLeft: -STEP, ArrowRight: STEP, PageDown: -10, PageUp: 10 }[e.key];
  if (d == null) return;
  e.preventDefault();
  setLoad(app.loadKg + d, true);
});

/* Los pasos de carga suenan, y la altura del sonido sube con el peso.
   Apretar "+" cinco veces se siente como una progresión en vez de como
   cinco clics iguales; es un detalle chico y es exactamente lo que
   separa una app que se siente cara de una que no.
   El contador se reinicia tras un segundo sin tocar: cada tanda de
   ajustes vuelve a empezar desde la nota grave. */
let pasoSeguidilla = 0;
let pasoTimer = null;

function contarPaso() {
  clearTimeout(pasoTimer);
  pasoTimer = setTimeout(() => { pasoSeguidilla = 0; }, 1000);
  return pasoSeguidilla++;
}

function rebote() {
  const n = $('loadInput');
  n.classList.remove('is-bump');
  void n.offsetWidth;              // reinicia la animación
  n.classList.add('is-bump');
}

$('loadMinus').addEventListener('click', () => {
  if (app.loadKg <= 0) return;
  sfx.pesoAbajo(contarPaso());
  rebote();
  setLoad(app.loadKg - STEP, true);
});
$('loadPlus').addEventListener('click', () => {
  if (app.loadKg >= MAX_KG) return;
  sfx.pesoArriba(contarPaso());
  rebote();
  setLoad(app.loadKg + STEP, true);
});

$('loadInput').addEventListener('focus', (e) => e.target.select());
$('loadInput').addEventListener('change', (e) => {
  const v = parseFloat(e.target.value.replace(',', '.'));
  setLoad(isFinite(v) ? v : app.loadKg, true);
});
$('loadInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

window.addEventListener('resize', layoutRuler);

/* La pista: con qué velocidad debería moverse esa carga según el
   perfil del atleta. Es lo que convierte "60 kg" en una decisión. */
/* Lo que llena el espacio que antes estaba vacío. No es relleno: es
   exactamente lo que el atleta iba a buscar a otra pantalla para
   decidir con cuánto peso entrenar. */
function pintarUltimaSerie() {
  const sets = store.all().filter((s) => s.exerciseId === app.exerciseId);
  const box = $('lastSet');
  if (!sets.length) { box.hidden = true; return; }

  const u = sets[sets.length - 1];
  const dias = Math.floor((Date.now() - u.startedAt) / 86400000);
  $('lastSetWhen').textContent =
    dias === 0 ? 'Hoy' : dias === 1 ? 'Ayer' : `Hace ${dias} días`;
  $('lastSetWhat').textContent =
    `${fmtKg(u.loadKg)} kg × ${u.repCount} · −${u.velocityLoss.toFixed(0)}%`;
  box.hidden = false;
}

function updateSetupHint() {
  const hint = $('setupHint');
  pintarUltimaSerie();

  const pts = pointsFromSets(store.all(), app.exerciseId);
  const fit = fitProfile(pts);
  if (!fit.ok) {
    $('predict').hidden = true;
    hint.textContent = pts.length
      ? 'Todavía faltan series a cargas distintas para armar tu perfil.'
      : 'Con unas cuantas series a cargas distintas voy a poder decirte a qué velocidad esperar cada peso.';
    return;
  }
  const v = fit.velAt(app.loadKg);
  if (!isFinite(v)) { hint.textContent = ''; return; }

  /* El chequeo del umbral va ANTES de descartar velocidades negativas:
     con una carga bien por encima del máximo, la recta predice un
     número negativo, y ahí es justamente cuando más falta hace el aviso.
     Si se descartara primero, el mensaje desaparecería en el peor caso.

     Si la velocidad predicha cae por debajo del umbral de 1RM, la carga
     está en o por encima del máximo estimado. Decir "0.15 m/s — fuerza
     máxima" ahí sería técnicamente cierto e inútil: lo que el atleta
     necesita saber es que ese peso probablemente no lo levanta. */
  const mvt = MVT[app.exerciseId] ?? MVT[0];
  if (v <= mvt) {
    const est = estimate1RM(fit, app.exerciseId);
    $('predict').hidden = true;
    hint.textContent = est
      ? `${fmtKg(app.loadKg)} kg está por encima de tu 1RM estimado (${Math.round(est.kg)} kg). Puede que no salga.`
      : `${fmtKg(app.loadKg)} kg está en el límite de lo que tu perfil dice que podés mover.`;
    return;
  }

  const z = zoneFor(v);
  $('predict').hidden = false;
  $('predictVel').textContent = v.toFixed(2);
  $('predictZona').textContent = z.label;
  hint.textContent = '';
}

/* ============================================================
   La serie en vivo
   ============================================================ */

$('btnStart').addEventListener('click', async () => {
  if (!app.sensor?.connected) { toast('El sensor no está conectado'); return; }
  $('bigVel').textContent = '—';
  $('liveZone').textContent = '';
  $('mReps').textContent = '0';
  $('mMejor').textContent = '—';
  $('mPerdida').textContent = '—';
  $('mPerdida').style.color = '';
  $('liveWaiting').hidden = false;
  $('liveNum').hidden = true;
  $('liveBars').hidden = true;
  $('waitingTitle').textContent = 'Calibrando';
  $('waitingSub').textContent = 'Dejá la barra apoyada un segundo.';
  sfx.comenzar();
  /* Acá, y no en la carga: el navegador no deja hablar sin un gesto
     previo del usuario, y este click es ese gesto. */
  voz.preparar();
  voz.serieNueva();
  $('bars').replaceChildren();
  $('repIdx').textContent = 'REP 01';
  $('liveWarn').hidden = true;
  $('liveExercise').textContent = exerciseName(app.exerciseId);
  $('liveLoad').textContent = fmtKg(app.loadKg);
  $('liveState').textContent = 'Calibrando';
  showPhase('live');
  keepAwake(true);
  try {
    await app.sensor.startSet(app.exerciseId, app.loadKg);
  } catch (err) {
    toast(err.message || 'No se pudo arrancar la serie');
    showPhase('setup');
    keepAwake(false);
  }
});

$('btnStop').addEventListener('click', async () => {
  sfx.terminar();
  $('btnStop').disabled = true;
  try { await app.sensor.stopSet(); }
  catch (err) { toast(err.message || 'No se pudo cerrar la serie'); }
  finally { setTimeout(() => { $('btnStop').disabled = false; }, 400); }
});

function onRep(e) {
  const { rep, reps } = e.detail;

  /* La primera repetición cambia el bloque de espera por el número y
     saca del camino el gráfico de barras vacío, que hasta acá era una
     línea con un "0 reps" al lado. */
  $('liveWaiting').hidden = true;
  $('liveNum').hidden = false;
  $('liveBars').hidden = false;

  const n = $('bigVel');
  n.textContent = rep.meanConcVel.toFixed(2);
  n.classList.remove('is-new');
  void n.offsetWidth;            // reinicia la animación
  n.classList.add('is-new');

  const z = zoneFor(rep.meanConcVel);
  $('liveZone').textContent = z.label;

  renderBars(reps);

  const best = Math.max(...reps.map((r) => r.meanConcVel));
  const loss = ((best - rep.meanConcVel) / best) * 100;

  $('repIdx').textContent = `REP ${String(rep.repIndex).padStart(2, '0')}`;
  $('mReps').textContent = String(reps.length);
  $('mMejor').textContent = best.toFixed(2);

  /* El color va en la PÉRDIDA, no en el número grande.
     Teñir la velocidad de ámbar hacía que la lectura pareciera un
     error de la app en vez de una señal: el número es lo que el sensor
     midió y no cambia de naturaleza porque el atleta esté cansado.
     El que cambia de significado es el porcentaje, y ese es el que se
     tiñe. 20% es el corte que más se usa para cortar la serie antes de
     acumular fatiga que no aporta. */
  const perd = $('mPerdida');
  perd.textContent = reps.length > 1 ? `−${loss.toFixed(0)}%` : '—';
  perd.style.color = loss >= 30 ? 'var(--coral-hi)' : loss >= 20 ? 'var(--amber)' : '';

  /* EL SONIDO DE LA REPETICIÓN, que es el que de verdad sirve: la
     altura sale de la velocidad medida contra la mejor de la serie.
     Con el teléfono apoyado a dos metros, el atleta ESCUCHA la fatiga
     sin poder mirar la pantalla — que es justo lo que le pasa con la
     barra sobre el pecho. */
  if (rep.quality.saturated || rep.quality.weakZupt) sfx.repDudosa();
  else sfx.rep(rep.meanConcVel, best);

  /* MANOS LIBRES. El tono dice si esta rep fue más lenta; la voz dice
     cuánto. Van juntos y en ese orden: el tono es instantáneo y dura
     130 ms, así que llega en el momento del bloqueo y la voz entra
     detrás, sin pisarlo.
     La primera repetición no se dice: no hay contra qué compararla y
     el atleta acaba de escuchar "listo" un segundo antes. */
  if (reps.length > 1 && !rep.quality.saturated) {
    voz.rep(rep.meanConcVel, reps.length > 2 ? loss : 0);
  }

  const warn = $('liveWarn');
  if (rep.quality.any) {
    warn.hidden = false;
    warn.textContent = rep.quality.list.map((q) => q.label).join(' · ') + ' — ' + rep.quality.list[0].help;
  } else if (reps.length > 2 && loss >= 20) {
    warn.hidden = false;
    warn.textContent = `Perdiste ${loss.toFixed(0)}% de velocidad contra tu mejor rep. Buen momento para cortar.`;
  } else {
    warn.hidden = true;
  }

  if (navigator.vibrate && rep.quality.saturated) navigator.vibrate(40);
}

/* El gráfico reserva sitio para al menos 10 repeticiones. Sin eso, con
   tres reps las barras salían gordísimas y el gráfico se reescalaba en
   cada rep; con los huecos punteados se ve cuánto va llenado. */
const SLOTS_MIN = 10;

function renderBars(reps) {
  const box = $('bars');
  const best = Math.max(...reps.map((r) => r.meanConcVel), 0.01);
  box.replaceChildren();

  reps.forEach((r, i) => {
    const b = el('i');
    /* Escala desde 0 y no desde el mínimo de la serie: si el eje
       arrancara en el mínimo, una caída de 3% se vería como un
       derrumbe y la app mentiría sobre la fatiga. */
    b.style.height = `${clamp((r.meanConcVel / best) * 100, 8, 100)}%`;
    /* Sólo la barra nueva se anima. Volver a animarlas todas en cada
       repetición convertía el gráfico en una ola y distraía. */
    if (i < reps.length - 1) b.style.animation = 'none';
    if (i === reps.length - 1) b.classList.add('is-last');
    if (r.quality.saturated || r.quality.romOutlier) b.classList.add('is-bad');
    box.appendChild(b);
  });

  for (let i = reps.length; i < SLOTS_MIN; i++) {
    const g = el('i', 'is-ghost');
    g.style.height = '100%';
    box.appendChild(g);
  }
}

/* ============================================================
   Resumen de la serie
   ============================================================ */

function onSet(e) {
  const s = e.detail;
  keepAwake(false);
  app.lastSet = s;

  if (s.repCount === 0) {
    toast('La serie se cerró sin repeticiones');
    showPhase('setup');
    return;
  }

  /* El cierre hablado. No interrumpe nada porque para acá el atleta ya
     soltó la barra, así que puede ser la frase larga: es la única que
     se dice entera. */
  {
    const vs = s.reps.map((r) => r.meanConcVel);
    const mejor = Math.max(...vs);
    const ultima = vs[vs.length - 1];
    voz.resumen(s.repCount, mejor > 0 ? ((mejor - ultima) / mejor) * 100 : 0);
  }

  $('sumEyebrow').textContent = `${exerciseName(s.exerciseId)} · serie ${s.setIndex}`;

  /* La cabecera se arma con nodos y no con innerHTML: los números van
     en la display y las unidades en la de texto, y así el conjunto se
     lee como un titular en vez de como una línea de datos. */
  const head = $('sumHead');
  head.replaceChildren(
    el('b', null, String(s.repCount)),
    el('span', null, s.repCount === 1 ? 'rep' : 'reps'),
    el('i'),
    el('b', null, fmtKg(s.loadKg)),
    el('span', null, 'kg'),
  );

  drawSetChart(s.reps);

  const vels = s.reps.map((r) => r.meanConcVel);
  const avg = vels.reduce((a, b) => a + b, 0) / vels.length;

  /* La pérdida no es una celda más de una grilla de cuatro iguales: es
     la métrica que decide qué hacer en la próxima serie. Ocupa su
     propio bloque y lleva el color de lo que significa. */
  const box = $('sumStats');
  box.replaceChildren();

  const nivel = s.velocityLoss >= 30 ? ' is-alto' : s.velocityLoss < 15 ? ' is-bajo' : '';
  const key = el('div', `stat--key${nivel}`);
  key.appendChild(el('div', 'stat__v', `${s.velocityLoss.toFixed(0)}%`));
  key.appendChild(el('div', 'stat__l', 'Pérdida de velocidad'));
  box.appendChild(key);

  const col = el('div', 'stats__col');
  for (const st of [
    { v: s.bestMeanVel.toFixed(2), l: 'Mejor m/s' },
    { v: avg.toFixed(2), l: 'Media m/s' },
  ]) {
    const d = el('div', 'stat');
    d.appendChild(el('div', 'stat__v', st.v));
    d.appendChild(el('div', 'stat__l', st.l));
    col.appendChild(d);
  }
  box.appendChild(col);

  $('sumVerdict').innerHTML = verdictFor(s);

  const flags = s.flags.list;
  $('sumWarn').hidden = flags.length === 0;
  if (flags.length) {
    $('sumWarn').textContent =
      'Algunas reps salieron marcadas: ' + flags.map((f) => f.label.toLowerCase()).join(', ') +
      '. Están contadas igual, pero sus velocidades son menos confiables.';
  }

  /* La foto de montaje sólo cuando hay rotación alta. Mostrarla siempre
     la convertiría en decoración que se deja de ver a la segunda serie;
     apareciendo justo cuando el sensor sospecha que está mal puesto, es
     la respuesta al problema y no un adorno. */
  $('sumMount').hidden = !s.flags.highRotation;

  showPhase('summary');
}

/* El párrafo que le dice al atleta qué hacer con lo que acaba de pasar.
   Sin esto la app es un velocímetro; con esto es un entrenador. */
function verdictFor(s) {
  const loss = s.velocityLoss;
  const mvt = MVT[s.exerciseId] ?? MVT[0];
  const last = s.lastRepVel;

  if (last <= mvt * 1.1) {
    return `La última rep salió a <b>${last.toFixed(2)} m/s</b>, prácticamente la velocidad de un máximo. Fuiste al límite: si no era el plan, la próxima cortá antes.`;
  }
  if (loss >= 30) {
    return `Perdiste <b>${loss.toFixed(0)}%</b> de velocidad. Es mucho: acumulaste fatiga que cuesta días recuperar y aporta poco. Con la misma carga, apuntá a cortar cerca del 20%.`;
  }
  if (loss >= 15) {
    return `<b>${loss.toFixed(0)}%</b> de pérdida es un estímulo sólido sin pasarte de fatiga. Mantené la carga.`;
  }
  /* La zona sale de la velocidad medida, no de un múltiplo del umbral.
     Con un múltiplo, una serie de 0,76 m/s (zona potencia) se anunciaba
     como "estás entrenando velocidad", que es otra cosa. */
  const z = zoneFor(s.bestMeanVel);
  if (z.key === 'velocidad' || z.key === 'velocidad-fuerza') {
    return `Se movió muy rápido (<b>${s.bestMeanVel.toFixed(2)} m/s</b> en la mejor rep, zona ${z.label.toLowerCase()}). Con esta carga estás entrenando velocidad, no fuerza: si buscás fuerza, subí el peso.`;
  }
  return `Sólo <b>${loss.toFixed(0)}%</b> de pérdida en zona ${z.label.toLowerCase()}. Te quedaron reps en el tanque: podés subir la carga o agregar repeticiones.`;
}

$('btnNext').addEventListener('click', () => {
  if (app.lastSet) store.add(app.lastSet);
  app.lastSet = null;
  sfx.guardar();
  updateSetupHint();
  showPhase('setup');
});

$('btnDiscard').addEventListener('click', () => {
  app.lastSet = null;
  sfx.tap();
  showPhase('setup');
});

/* --- Gráfico de la serie ------------------------------------ */

function drawSetChart(reps) {
  const svg = $('sumChart');
  const W = 320, H = 175, L = 14, R = 12, T = 14, B = 14;
  svg.replaceChildren();
  if (reps.length === 0) return;

  const vels = reps.map((r) => r.meanConcVel);
  const max = Math.max(...vels) * 1.12;
  const min = 0;
  const x = (i) => reps.length === 1 ? W / 2 : L + (i / (reps.length - 1)) * (W - L - R);
  const y = (v) => H - B - ((v - min) / (max - min)) * (H - T - B);

  /* Degradado bajo la curva en vez de un relleno plano: es lo que le da
     profundidad al gráfico sin agregar ni un elemento más. Va en defs
     porque un `fill` no puede llevar un gradiente en línea. */
  const defs = svgEl('defs');
  const grad = svgEl('linearGradient', { id: 'setFill', x1: '0', y1: '0', x2: '0', y2: '1' });
  /* Se apaga del todo a media altura, no al pie: llegando hasta abajo
     el relleno se leía como un bloque rojo sólido y le robaba
     protagonismo a la línea, que es lo que hay que mirar. */
  grad.appendChild(svgEl('stop', { offset: '0', 'stop-color': '#EE4526', 'stop-opacity': '0.22' }));
  grad.appendChild(svgEl('stop', { offset: '0.6', 'stop-color': '#EE4526', 'stop-opacity': '0' }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  // Eje vertical: le da un borde al gráfico y ancla la lectura a la izquierda.
  svg.appendChild(svgEl('line', {
    x1: L, x2: L, y1: T - 4, y2: H - B,
    stroke: 'rgb(255 255 255 / 0.16)', 'stroke-width': 1,
  }));

  /* Umbral de velocidad mínima como línea de referencia: es lo que le
     da escala al gráfico. Sin ella, una caída del 5% y una del 40% se
     dibujan igual de dramáticas. */
  const mvt = MVT[app.lastSet?.exerciseId] ?? MVT[0];
  if (mvt > min && mvt < max) {
    svg.appendChild(svgEl('line', {
      x1: L, x2: W, y1: y(mvt), y2: y(mvt),
      stroke: 'rgb(255 255 255 / 0.22)', 'stroke-dasharray': '4 5', 'stroke-width': 1,
    }));
  }

  const d = vels.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  svg.appendChild(svgEl('path', {
    class: 'relleno',
    d: `${d} L${x(vels.length - 1).toFixed(1)},${H - B} L${x(0).toFixed(1)},${H - B} Z`,
    fill: 'url(#setFill)', stroke: 'none',
  }));

  /* La curva se dibuja sola de izquierda a derecha. El truco es el
     guionado: se pone un guión tan largo como la línea entera y se
     anima el desplazamiento hasta cero. Hay que medir el largo real
     del trazo, si no la animación arranca cortada o tarda de más. */
  const traza = svgEl('path', {
    class: 'traza',
    d, fill: 'none', stroke: '#EE4526', 'stroke-width': 2.5,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  });
  svg.appendChild(traza);
  const largo = Math.ceil(traza.getTotalLength?.() || 600);
  traza.style.setProperty('--largo', largo);

  const best = Math.max(...vels);
  vels.forEach((v, i) => {
    const c = svgEl('circle', {
      class: 'punto',
      cx: x(i), cy: y(v), r: v === best ? 4.5 : 3.5,
      fill: v === best ? '#fff' : '#EE4526',
    });
    /* Cada punto aparece cuando la línea lo alcanza. */
    c.style.animationDelay = `${0.1 + (i / Math.max(vels.length - 1, 1)) * 0.8}s`;
    svg.appendChild(c);
  });

  $('sumChartLabels').replaceChildren(
    el('span', null, 'rep 1'),
    el('span', null, `umbral ${mvt.toFixed(2)} m/s`),
    el('span', null, `rep ${reps.length}`),
  );
}

/* ============================================================
   Historial
   ============================================================ */

function renderHistory() {
  const sessions = store.sessions();
  const box = $('sessions');
  box.replaceChildren();

  renderHeatmap(sessions);

  if (sessions.length === 0) {
    box.appendChild(el('p', 'empty', 'Todavía no guardaste ninguna serie.'));
    return;
  }

  /* Cada sesión es una tarjeta con su resumen arriba y sus series
     adentro. Antes eran filas sueltas bajo un título y no se veía
     dónde terminaba un día y empezaba el otro. */
  sessions.forEach((sess, i) => {
    const wrap = el('div', 'session');

    const head = el('div', 'session__head');
    const fecha = el('div', 'session__date');
    if (i === 0 && fmtDate(sess.date) === 'Hoy') fecha.appendChild(el('span', 'pip'));
    fecha.appendChild(el('span', null, fmtDate(sess.date)));
    head.appendChild(fecha);
    head.appendChild(el('div', 'session__meta',
      `${sess.sets.length} series · ${sess.reps} reps · ${Math.round(sess.volumeKg)} kg`));
    wrap.appendChild(head);

    for (const s of sess.sets) {
      const row = el('div', 'setrow');

      const izq = el('div');
      izq.appendChild(el('div', 'setrow__name', exerciseName(s.exerciseId)));
      izq.appendChild(el('div', 'setrow__sub', `${fmtKg(s.loadKg)} kg × ${s.repCount}`));
      row.appendChild(izq);

      const loss = el('div', 'setrow__loss' + (s.velocityLoss >= 25 ? ' is-alto' : ''),
        `−${s.velocityLoss.toFixed(0)}%`);
      row.appendChild(loss);

      row.appendChild(sparkline((s.reps || []).map((r) => r.v)));
      wrap.appendChild(row);
    }
    box.appendChild(wrap);
  });
}

function sparkline(vels) {
  const svg = svgEl('svg', { class: 'spark', viewBox: '0 0 54 22', preserveAspectRatio: 'none' });
  if (vels.length < 2) return svg;
  const max = Math.max(...vels), min = Math.min(...vels);
  const span = max - min || 1;
  const d = vels.map((v, i) =>
    `${i ? 'L' : 'M'}${(i / (vels.length - 1)) * 54},${20 - ((v - min) / span) * 18}`).join(' ');
  svg.appendChild(svgEl('path', {
    d, fill: 'none', stroke: 'var(--coral)', 'stroke-width': 1.5,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'vector-effect': 'non-scaling-stroke',
  }));
  return svg;
}

/* 18 semanas: es lo que entra en el ancho de un teléfono sin que los
   cuadrados bajen de 8px, que es donde dejan de verse. */
function renderHeatmap(sessions) {
  const WEEKS = 18;
  const box = $('heatmap');
  box.replaceChildren();

  /* La grilla ocupa un tercio de la pantalla: si está vacía, no se
     muestra. Con dos sesiones no dice nada que la lista no diga mejor. */
  $('heatcard').hidden = sessions.length < 3;
  $('heatCount').textContent = String(sessions.length);

  const byDay = new Map();
  for (const s of sessions) byDay.set(dayKey(s.date), s.reps);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  /* Se arranca en el lunes de hace WEEKS semanas para que cada columna
     sea una semana entera y la grilla no quede corrida. */
  const start = new Date(today);
  start.setDate(start.getDate() - (WEEKS * 7 - 1));
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));

  for (let i = 0; ; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    if (d > today) break;
    const reps = byDay.get(dayKey(d.getTime())) || 0;
    const cell = el('i');
    cell.dataset.l = reps === 0 ? '0' : reps < 20 ? '1' : reps < 45 ? '2' : '3';
    cell.title = `${fmtDate(d.getTime())} — ${reps} reps`;
    box.appendChild(cell);
  }
}

$('btnExport').addEventListener('click', () => {
  const csv = store.toCsv();
  if (csv.split('\n').length < 2) { toast('No hay nada para exportar'); return; }
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = el('a');
  a.href = url;
  a.download = `boost-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
});

$('btnWipe').addEventListener('click', () => {
  if (!confirm('¿Borrar todo el historial? No se puede deshacer.')) return;
  store.clear();
  renderHistory();
  updateSetupHint();
  toast('Historial borrado');
});

/* ============================================================
   Perfil carga-velocidad
   ============================================================ */

buildExercisePicker($('profExercises'), () => app.profExerciseId, (id) => {
  app.profExerciseId = id;
  renderProfile();
});

function renderProfile() {
  const box = $('profBody');
  box.replaceChildren();

  const pts = pointsFromSets(store.all(), app.profExerciseId);
  const fit = fitProfile(pts);

  if (!fit.ok) {
    const p = el('p', 'empty');
    p.textContent = {
      'sin-datos': 'Todavía no hay series guardadas de este ejercicio.',
      'pocos-puntos': 'Con una sola serie no hay recta. Hacen falta al menos dos, con cargas distintas.',
      'sin-rango-de-carga': 'Todas las series son con el mismo peso. Para armar el perfil hacen falta cargas distintas — probá una liviana y una pesada.',
    }[fit.reason];
    box.appendChild(p);
    return;
  }

  const est = estimate1RM(fit, app.profExerciseId);

  /* El número y el gráfico van juntos, dentro de una tarjeta: son una
     sola afirmación —"este es tu máximo y estos son los datos que lo
     dicen"—, y separarlos dejaba el número sin su respaldo a la vista. */
  const card = el('div', 'prof__card');
  /* El cuerpo va en su propio nodo: la tarjeta lleva la franja de acento
     como pseudo-elemento y no puede tener padding propio sin empujarla. */
  const body = el('div', 'prof__body');
  card.appendChild(body);

  if (est) {
    const top = el('div', 'prof__top');
    const n = el('div', 'prof__1rm');
    n.innerHTML = `${Math.round(est.kg)}<span> kg</span>`;
    top.appendChild(n);
    top.appendChild(el('span', `conf conf--${est.confidence}`, `confianza ${est.confidence}`));
    body.appendChild(top);

    /* El rótulo a la izquierda y los números que lo respaldan a la
       derecha, en la misma línea. Un 1RM estimado sin su r² al lado es
       un número inventado con aspecto de dato. */
    const meta = el('div', 'prof__meta');
    meta.appendChild(el('span', 'stat__l', '1RM estimado'));
    const nums = el('span', 'prof__meta-num');
    nums.innerHTML = `r² <b>${fit.r2.toFixed(2)}</b> · <b>${fit.n}</b> series · ` +
                     `de <b>${fmtKg(fit.minLoad)}</b> a <b>${fmtKg(fit.maxLoad)}</b> kg`;
    meta.appendChild(nums);
    body.appendChild(meta);
  } else {
    body.appendChild(el('p', 'empty', 'Los datos no dibujan una recta con sentido: la velocidad no baja al subir la carga. Suele pasar con pocas series o con reps mal contadas.'));
  }

  body.appendChild(drawScatter(pts, fit, est));
  box.appendChild(card);

  if (est && est.confidence !== 'alta') {
    const why = el('p', 'note');
    why.style.marginTop = '-1rem';
    why.textContent = est.extrapolation > 1.3
      ? `La estimación está ${Math.round((est.extrapolation - 1) * 100)}% por encima del peso más alto que levantaste, así que la recta se extrapola lejos. Hacé una serie más pesada y el número se afirma.`
      : 'Con más series a cargas variadas la estimación se afirma.';
    box.appendChild(why);
  }

  /* Qué carga usar hoy para cada zona de entrenamiento. Esto es lo que
     el atleta viene a buscar: un número que puede cargar en la barra. */
  if (est) {
    const tbl = el('div', 'zonetable');
    tbl.appendChild(el('span', 'zonetable__h', 'Zonas objetivo'));
    for (const z of ZONES) {
      const target = z.max === Infinity ? z.min + 0.15 : (z.min + z.max) / 2;
      const kg = fit.loadAt(target);
      /* Por debajo de 20 kg no hay carga que poner: es una barra
         olímpica vacía. Mostrar "12,5 kg" ahí sería un número
         imposible de cargar y le quitaría credibilidad al resto. */
      if (!isFinite(kg) || kg < 20 || kg > est.kg * 1.05) continue;
      const row = el('div', 'zonerow');
      row.appendChild(el('span', null, z.label));
      const b = el('b', null, `${fmtKg(Math.round(kg / 2.5) * 2.5)} kg · ${target.toFixed(2)} m/s`);
      row.appendChild(b);
      tbl.appendChild(row);
    }
    box.appendChild(tbl);

    /* Aviso al pie de la pantalla que da el número más fácil de tomar al
       pie de la letra. El 1RM estimado sale de extrapolar una recta, no de
       haber levantado ese peso, y quien lo cargue en la barra sin criterio
       se puede lastimar. Va acá y no en un cartel de bienvenida que nadie
       lee: al lado del número que podría hacerle creer otra cosa. */
    const pie = el('p', 'legal');
    pie.innerHTML =
      'BOOST es una herramienta de entrenamiento, no un dispositivo médico. ' +
      'El 1RM estimado es una proyección estadística, no un peso que hayas ' +
      'levantado: verificalo progresando de a poco y con quien te asista. ' +
      '<a href="legal.html">Términos, privacidad y seguridad</a>';
    box.appendChild(pie);
  }
}

function drawScatter(pts, fit, est) {
  const W = 320, H = 230, L = 14, R = 8, T = 12, B = 28;
  const svg = svgEl('svg', { class: 'scatter', viewBox: `0 0 ${W} ${H}` });

  const maxLoad = Math.max(est ? est.kg : fit.maxLoad, fit.maxLoad) * 1.08;
  const minLoad = 0;
  const maxVel = Math.max(...pts.map((p) => p.vel), fit.velAt(0)) * 1.08;

  const x = (kg) => L + ((kg - minLoad) / (maxLoad - minLoad)) * (W - L - R);
  const y = (v) => T + (1 - v / maxVel) * (H - T - B);

  const AXIS = 'rgb(255 255 255 / 0.16)';
  svg.appendChild(svgEl('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, stroke: AXIS }));
  svg.appendChild(svgEl('line', { x1: L, x2: L, y1: T, y2: H - B, stroke: AXIS }));

  /* Marcas en el eje vertical. Sin números al lado: el eje ya está
     rotulado por la línea de umbral, y agregar cifras acá llenaría de
     texto un gráfico cuya lectura es la PENDIENTE, no un valor puntual. */
  for (let i = 1; i <= 4; i++) {
    const yy = T + (i / 5) * (H - T - B);
    svg.appendChild(svgEl('line', { x1: L, x2: L + 5, y1: yy, y2: yy, stroke: AXIS }));
  }

  // umbral de 1RM
  const mvt = MVT[app.profExerciseId] ?? MVT[0];
  svg.appendChild(svgEl('line', {
    x1: L, x2: W - R, y1: y(mvt), y2: y(mvt),
    stroke: 'rgb(255 255 255 / 0.24)', 'stroke-dasharray': '4 5',
  }));
  /* El rótulo va a la izquierda: a la derecha se montaba encima del
     círculo del 1RM, que por definición cae en el extremo derecho de la
     recta. Son los dos elementos que marcan lo mismo y competían por el
     mismo pixel. */
  svg.appendChild(text(L + 6, y(mvt) - 7, `1RM ${mvt.toFixed(2)} m/s`));

  // la recta ajustada
  const x0 = minLoad, x1 = est ? Math.min(est.kg * 1.06, maxLoad) : fit.maxLoad;
  const recta = svgEl('line', {
    class: 'recta',
    x1: x(x0), y1: y(fit.velAt(x0)), x2: x(x1), y2: y(Math.max(fit.velAt(x1), 0)),
    stroke: '#EE4526', 'stroke-width': 2.5, 'stroke-linecap': 'round',
  });
  svg.appendChild(recta);
  recta.style.setProperty('--largo', Math.ceil(Math.hypot(x(x1) - x(x0), y(Math.max(fit.velAt(x1), 0)) - y(fit.velAt(x0)))));

  // los puntos, más opacos cuanto más recientes
  const now = Date.now();
  const oldest = Math.min(...pts.map((p) => p.at));
  const span = Math.max(now - oldest, 1);
  pts.forEach((p, i) => {
    const op = (0.32 + 0.68 * (1 - (now - p.at) / span)).toFixed(2);
    const c = svgEl('circle', {
      class: 'punto',
      cx: x(p.loadKg), cy: y(p.vel), r: 4.5,
      fill: p.suspect ? 'none' : '#fff',
      stroke: p.suspect ? '#F2B01E' : 'none',
      'stroke-width': 1.5,
    });
    /* La opacidad final se anima hacia el valor por recencia, no hacia
       1: los puntos viejos tienen que quedar apagados. */
    c.style.setProperty('--op', op);
    c.style.animationName = 'apareceOp';
    c.style.animationDelay = `${0.2 + i * 0.03}s`;
    svg.appendChild(c);
  });

  // Dónde la recta cruza el umbral: ahí está el 1RM estimado.
  if (est) {
    svg.appendChild(svgEl('circle', {
      cx: x(est.kg), cy: y(mvt), r: 6,
      fill: '#070707', stroke: '#EE4526', 'stroke-width': 2.5,
    }));
  }

  svg.appendChild(text(L, H - 9, '0 kg'));
  svg.appendChild(text(W - R, H - 9, `${Math.round(maxLoad)} kg`, 'end'));

  return svg;
}

/* ============================================================
   Utilidades
   ============================================================ */

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
  return n;
}
function text(x, y, s, anchor) {
  const t = svgEl('text', { x, y, class: 'axis' });
  if (anchor) t.setAttribute('text-anchor', anchor);
  t.textContent = s;
  return t;
}

const fmtKg = (kg) => (kg % 1 === 0 ? String(kg) : kg.toFixed(1).replace('.', ','));

function fmtDate(ts) {
  const d = new Date(ts);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  /* Formato corto: "mié 26 ago". El largo ("miércoles, 26 de agosto")
     se parte en dos líneas en un teléfono y desalinea toda la fila. */
  const s = d.toLocaleDateString('es-UY', { weekday: 'short', day: 'numeric', month: 'short' });
  return s.replace(/,/g, '').replace(/\bde\b/g, '').replace(/\s+/g, ' ').trim();
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/* Declarada con `function` y no con `const`: se usa arriba del archivo, en
   el arranque, y una arrow guardada en const todavía no existe en ese
   punto —la zona muerta temporal— así que tiraba un ReferenceError que
   dejaba la app entera en blanco.

   El iPad se detecta aparte porque desde iPadOS 13 se hace pasar por Mac
   en el userAgent; lo delata que un Mac de verdad no tiene pantalla táctil. */
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4200);
}

/* La pantalla no se puede apagar durante la serie: el número grande
   no sirve de nada si el teléfono se bloquea entre repeticiones. */
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* si el navegador no lo permite, no pasa nada grave */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && app.phase === 'live' && !wakeLock) keepAwake(true);
});

/* ============================================================
   Arranque
   ============================================================ */

pintarIconos();
showPhase('connect');
showView('train');
layoutRuler();
updateSetupHint();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
