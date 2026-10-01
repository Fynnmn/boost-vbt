/* ============================================================
   sfx.js — sonido de la interfaz.

   SINTETIZADO, NO GRABADO. No hay ni un archivo de audio: todo se
   genera con Web Audio en el momento. Tres razones, y ninguna es
   preferencia estética:

   1. Peso. Un set de ocho efectos en mp3 son varios cientos de
      kilobytes; esto son 4 KB de código. La app entera pesa menos que
      un solo sonido decente.
   2. La política de seguridad de la app declara `connect-src 'self'`:
      no puede traer audio de ningún CDN. Sintetizar es la única forma
      de tener sonido sin aflojar esa regla.
   3. Los parámetros son datos. El sonido de una repetición cambia de
      altura según la velocidad medida — con archivos habría que grabar
      veinte variantes; acá es una multiplicación.

   QUÉ HACE QUE SUENE CARO Y NO A JUGUETE:

   · Ondas seno y triangulares, nunca cuadradas ni de sierra. La onda
     cuadrada es el sonido del zumbador de un microondas.
   · Envolvente con ataque de milisegundos y caída exponencial. Un
     corte recto produce el "clic" seco de las alarmas baratas.
   · Alturas de una escala pentatónica mayor. Cualquier combinación de
     dos notas de esa escala suena consonante, así que dos sonidos que
     se pisen nunca chocan.
   · Cada golpe lleva un armónico por encima, más bajo y más corto, que
     es lo que da cuerpo. Una sinusoide sola suena a test de audiometría.
   · Volumen bajo de fábrica. Un sonido de interfaz que se hace notar
     ya perdió.
   ============================================================ */

/* Pentatónica mayor de Do, en hercios. La usan desde los gamelanes
   hasta las alertas de los teléfonos porque no tiene intervalos
   disonantes: no hay forma de elegir dos notas que suenen mal juntas. */
const NOTA = {
  do:  523.25,
  re:  587.33,
  mi:  659.25,
  sol: 783.99,
  la:  880.00,
  do2: 1046.50,
  re2: 1174.66,
  mi2: 1318.51,
  sol2: 1567.98,
};

const PREF = 'boost.sonido';

let ctx = null;
let master = null;
let habilitado = leerPref();

function leerPref() {
  try { return localStorage.getItem(PREF) !== 'off'; }
  catch { return true; }
}

/* El contexto de audio se crea recién con el primer gesto del usuario.
   Los navegadores no permiten sonar antes de que alguien toque algo, y
   un contexto creado en la carga queda en estado `suspended` para
   siempre en algunos casos. */
function motor() {
  if (!habilitado) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.24;   // techo general, deliberadamente bajo
      master.connect(ctx.destination);
    } catch { return null; }
  }
  /* Tras volver de segundo plano el contexto queda suspendido y todo
     enmudece sin avisar. */
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/* Un golpe: una nota con su armónico, con envolvente exponencial.
   freq  Hz de la fundamental
   dur   segundos hasta el silencio
   vol   0-1 relativo al techo general
   tipo  forma de onda de la fundamental
   sube  desliza la altura hacia arriba (>1) o abajo (<1) durante el golpe */
function golpe(freq, { dur = 0.16, vol = 0.5, tipo = 'sine', retardo = 0, sube = 1, brillo = 0.28 } = {}) {
  const c = motor();
  if (!c) return;

  const t0 = c.currentTime + retardo;
  const g = c.createGain();
  g.connect(master);

  /* Ataque de 6 ms: lo bastante rápido para sentirse instantáneo, lo
     bastante suave para no producir el chasquido de un corte en seco. */
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  const osc = c.createOscillator();
  osc.type = tipo;
  osc.frequency.setValueAtTime(freq, t0);
  if (sube !== 1) osc.frequency.exponentialRampToValueAtTime(freq * sube, t0 + dur);
  osc.connect(g);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);

  /* El armónico. Una octava arriba, mucho más bajo y más corto: es lo
     que hace que el golpe tenga cuerpo en vez de sonar a pitido. */
  if (brillo > 0) {
    const g2 = c.createGain();
    g2.connect(master);
    g2.gain.setValueAtTime(0.0001, t0);
    g2.gain.exponentialRampToValueAtTime(vol * brillo, t0 + 0.004);
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.55);

    const osc2 = c.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, t0);
    if (sube !== 1) osc2.frequency.exponentialRampToValueAtTime(freq * 2 * sube, t0 + dur * 0.55);
    osc2.connect(g2);
    osc2.start(t0);
    osc2.stop(t0 + dur * 0.55 + 0.02);
  }
}

/* ============================================================
   El repertorio.
   ============================================================ */

export const sfx = {
  get activo() { return habilitado; },

  alternar() {
    habilitado = !habilitado;
    try { localStorage.setItem(PREF, habilitado ? 'on' : 'off'); } catch {}
    if (habilitado) this.tap();
    return habilitado;
  },

  /* Toque genérico: chips, pestañas. Corto y discreto. */
  tap() {
    golpe(NOTA.sol, { dur: 0.075, vol: 0.30, brillo: 0.18 });
  },

  /* Subir carga. La altura sube con el peso: un detalle chico que hace
     que apretar cinco veces "+" se sienta como una progresión y no como
     cinco clics iguales. Se recorre la escala en vez de deslizar la
     frecuencia, para que nunca caiga entre dos notas. */
  pesoArriba(paso = 0) {
    const escala = [NOTA.do2, NOTA.re2, NOTA.mi2, NOTA.sol2];
    golpe(escala[Math.min(paso, escala.length - 1)], { dur: 0.09, vol: 0.34, brillo: 0.22 });
  },

  pesoAbajo(paso = 0) {
    const escala = [NOTA.la, NOTA.sol, NOTA.mi, NOTA.re];
    golpe(escala[Math.min(paso, escala.length - 1)], { dur: 0.09, vol: 0.30, brillo: 0.18 });
  },

  /* Arrastrar la regla: un tic por cada 2,5 kg. Muy bajo y muy corto,
     como el trinquete de un dial de metal. */
  tic() {
    golpe(NOTA.mi2, { dur: 0.035, vol: 0.13, brillo: 0.10 });
  },

  /* Sensor conectado: dos notas ascendentes. */
  conectado() {
    golpe(NOTA.do, { dur: 0.16, vol: 0.42 });
    golpe(NOTA.sol, { dur: 0.30, vol: 0.42, retardo: 0.09 });
  },

  desconectado() {
    golpe(NOTA.sol, { dur: 0.14, vol: 0.30 });
    golpe(NOTA.do, { dur: 0.28, vol: 0.30, retardo: 0.08 });
  },

  /* Comenzar serie: arpegio de tres notas. Es el momento con más peso
     de la app, así que es el sonido más largo y más presente. */
  comenzar() {
    golpe(NOTA.do, { dur: 0.18, vol: 0.40 });
    golpe(NOTA.mi, { dur: 0.20, vol: 0.40, retardo: 0.075 });
    golpe(NOTA.sol, { dur: 0.42, vol: 0.44, retardo: 0.15 });
  },

  /* Fin de la calibración: el sensor está listo. Discreto, porque llega
     cuando el atleta ya está montando la barra. */
  listo() {
    golpe(NOTA.sol, { dur: 0.13, vol: 0.26, brillo: 0.2 });
    golpe(NOTA.do2, { dur: 0.22, vol: 0.26, retardo: 0.07 });
  },

  /* REPETICIÓN CONTADA — el sonido que de verdad sirve.
     La altura sale de la velocidad medida: rápido suena agudo, lento
     suena grave. Con el teléfono apoyado a dos metros, el atleta
     ESCUCHA la fatiga sin mirar la pantalla, que es exactamente lo que
     no puede hacer con la barra sobre el pecho.
     La velocidad se mapea contra la mejor rep de la serie, no contra un
     valor absoluto: lo que importa es cuánto cayó respecto de lo que
     este atleta hizo hoy, no cuántos m/s son. */
  rep(vel, mejor) {
    const escala = [NOTA.do, NOTA.re, NOTA.mi, NOTA.sol, NOTA.la, NOTA.do2, NOTA.re2];
    const ratio = mejor > 0 ? Math.min(1, vel / mejor) : 1;
    /* 0,60 de la mejor rep o menos cae en la nota más grave: por debajo
       de esa pérdida la serie ya está para cortar y no hace falta más
       resolución. */
    const t = Math.max(0, (ratio - 0.6) / 0.4);
    const i = Math.round(t * (escala.length - 1));
    golpe(escala[i], { dur: 0.13, vol: 0.36, brillo: 0.26 });
  },

  /* Repetición marcada como poco confiable: la misma nota pero con un
     batido corto, para que se distinga sin sonar a error. */
  repDudosa() {
    golpe(NOTA.re, { dur: 0.1, vol: 0.28, tipo: 'triangle', brillo: 0.12 });
    golpe(NOTA.re * 0.98, { dur: 0.14, vol: 0.24, tipo: 'triangle', retardo: 0.03, brillo: 0 });
  },

  /* Terminar serie: descendente, cierra. */
  terminar() {
    golpe(NOTA.la, { dur: 0.16, vol: 0.36 });
    golpe(NOTA.mi, { dur: 0.34, vol: 0.36, retardo: 0.085 });
  },

  /* Guardado: acorde cálido de tres notas a la vez. */
  guardar() {
    golpe(NOTA.do, { dur: 0.40, vol: 0.30 });
    golpe(NOTA.mi, { dur: 0.40, vol: 0.24, retardo: 0.015 });
    golpe(NOTA.sol, { dur: 0.44, vol: 0.20, retardo: 0.03 });
  },

  /* Aviso. Dos notas iguales seguidas: llama la atención sin el tono
     acusador de un intervalo descendente. */
  aviso() {
    golpe(NOTA.re2, { dur: 0.1, vol: 0.30, tipo: 'triangle', brillo: 0.15 });
    golpe(NOTA.re2, { dur: 0.16, vol: 0.26, tipo: 'triangle', retardo: 0.13, brillo: 0.15 });
  },
};
