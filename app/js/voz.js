/* ============================================================
   voz.js — el número, dicho en voz alta.

   POR QUÉ EXISTE. El tono de `sfx.js` dice si la repetición fue más
   lenta que la anterior, pero no dice CUÁNTO. Con auriculares puestos
   —que es como entrena la mayoría— el número puede llegar sin soltar
   la barra ni girar la cabeza hacia el teléfono. Es la única forma de
   que el dato sirva DURANTE la serie y no después de terminarla, que
   es cuando ya no se puede hacer nada con él.

   SIN ARCHIVOS Y SIN RED. Usa `speechSynthesis`, que ya viene en el
   navegador. No descarga voces, no llama a ninguna API de terceros y
   no obliga a aflojar el `connect-src 'self'` de la app. Costo cero
   por reproducción y funciona en modo avión. La alternativa —una API
   de voz en la nube— habría metido latencia de red en el único
   momento donde la latencia importa, y una cuenta que pagar por cada
   repetición que alguien levante.

   ------------------------------------------------------------
   LAS CUATRO DECISIONES QUE HACEN QUE FUNCIONE

   1. SE DICE EL NÚMERO CORTO, NO LA MAGNITUD.
      "cincuenta y ocho", no "cero coma cincuenta y ocho metros por
      segundo". Una repetición de press de banca dura entre uno y
      cuatro segundos; la frase larga tarda casi tres y todavía está
      hablando cuando el atleta ya bajó la barra otra vez. Es también
      como lo canta un entrenador al costado del banco: el "cero coma"
      se da por entendido.

   2. LO NUEVO PISA A LO VIEJO.
      Si llega otra repetición mientras está hablando, se corta y se
      dice la nueva. Un número atrasado es peor que ningún número:
      el atleta corrige contra un dato que ya no es el suyo.

   3. EL AVISO DE CORTE INTERRUMPE AL NÚMERO.
      Cuando la pérdida cruza el umbral, esa vez no se dice la
      velocidad: se dice que hay que cortar. Es la única decisión que
      el producto existe para tomar, y decirla junto con el número la
      entierra.

   4. SE HABLA UNA SOLA VEZ POR EVENTO.
      El "listo" del final de la calibración y el aviso de corte se
      emiten una vez por serie. Una app que repite es una app que se
      apaga.

   ------------------------------------------------------------
   TRAMPAS DEL API, TODAS PISADAS AL MENOS UNA VEZ

   · `getVoices()` DEVUELVE VACÍO AL PRINCIPIO. La lista llega
     asíncrona. Si se elige la voz en la carga del módulo, la primera
     frase sale con la voz por defecto del sistema — en un teléfono
     configurado en inglés, "cincuenta y ocho" se lee en inglés y no
     se entiende nada. Por eso se escucha `voiceschanged` y se vuelve
     a elegir cada vez.

   · `cancel()` Y `speak()` EN EL MISMO TICK: la frase no suena, en el
     Chrome de Android. Hay que dejar pasar un tick entre las dos.

   · EL NAVEGADOR NO HABLA SIN UN GESTO PREVIO del usuario. Por eso
     `preparar()` se llama desde el click de "Comenzar serie", que es
     un gesto real, y emite una frase muda para dejar el motor abierto.

   · SI LA `SpeechSynthesisUtterance` NO QUEDA REFERENCIADA, el
     recolector de basura se la lleva a mitad de frase en algunas
     versiones de Chrome. Se guardan en `enVuelo` hasta que terminan.

   ------------------------------------------------------------
   LO QUE TODAVÍA NO SE PROBÓ, y hay que probar el 6/10/2026 con la
   placa: los auriculares Bluetooth y el sensor comparten la radio del
   teléfono. A2DP y BLE conviven bien en Android moderno, pero no está
   verificado en este proyecto — si aparecen cortes de audio o caídas
   del sensor cuando los dos están conectados, es acá donde hay que
   mirar primero, no en el firmware.
   ============================================================ */

const PREF = 'boost.voz';

/* ============================================================
   Números en palabras.

   Se cubre de 0 a 999 centésimas, o sea de 0,00 a 9,99 m/s: mucho más
   de lo que da un movimiento de barra, pero el rango completo sale de
   la misma función y no hay que decidir dónde cortar.

   Es la única parte con lógica de verdad, y por eso es la única que
   está testeada (`test/test.mjs`).
   ============================================================ */

const UNI = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const DIEZ = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
/* Los veinti- van pegados y tres llevan tilde. Es la única
   irregularidad del rango, así que va como tabla y no como regla. */
const VEINTI = ['veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];

/**
 * Un entero en palabras, en español. 0 – 999.
 * @param {number} n
 * @returns {string}
 */
export function enPalabras(n) {
  n = Math.round(Number(n));
  if (!Number.isFinite(n) || n < 0) return '';
  if (n > 999) n = 999;

  if (n < 10) return UNI[n];
  if (n < 20) return DIEZ[n - 10];
  if (n < 30) return VEINTI[n - 20];
  if (n < 100) {
    const d = Math.floor(n / 10), u = n % 10;
    return u === 0 ? DECENAS[d] : `${DECENAS[d]} y ${UNI[u]}`;
  }

  const c = Math.floor(n / 100), r = n % 100;
  if (r === 0) return UNI[c];
  /* 1,05 se dice "uno cero cinco" y no "uno cinco", que se entendería
     como 1,50. El cero explícito es la única forma de que el decimal
     no se pierda al hablar. */
  if (r < 10) return `${UNI[c]} cero ${UNI[r]}`;
  return `${UNI[c]} ${enPalabras(r)}`;
}

/** La velocidad de una repetición, en la forma corta que canta un entrenador. */
export function fraseRep(vel) {
  return enPalabras(vel * 100);
}

/** El aviso de corte. Reemplaza al número en la repetición que cruza el umbral. */
export function fraseCorte(perdidaPct) {
  return `Pérdida ${enPalabras(perdidaPct)} por ciento. Buen momento para cortar.`;
}

/** El cierre de la serie, cuando el atleta ya soltó la barra. */
export function fraseResumen(reps, perdidaPct) {
  const n = enPalabras(reps);
  const palabra = reps === 1 ? 'repetición' : 'repeticiones';
  if (!(perdidaPct > 0)) return `${n} ${palabra}.`;
  return `${n} ${palabra}. Pérdida ${enPalabras(perdidaPct)} por ciento.`;
}

/* ============================================================
   El motor.
   ============================================================ */

let habilitado = leerPref();
let vozEs = null;
let escuchando = false;
let avisadoCorte = false;
const enVuelo = new Set();

function leerPref() {
  try { return localStorage.getItem(PREF) === 'on'; }
  catch { return false; }
}

/* Arranca APAGADA, al revés que el sonido. Una app que se pone a
   hablar sola la primera vez que la abrís, en un gimnasio y con el
   volumen del teléfono donde haya quedado, es una app que se
   desinstala. Se prende a propósito. */

function soportado() {
  return typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof window.SpeechSynthesisUtterance === 'function';
}

function elegirVoz() {
  if (!soportado()) return null;
  let vs = [];
  try { vs = window.speechSynthesis.getVoices() || []; } catch { return null; }
  if (!vs.length) return null;
  /* De la más local a la más genérica. El rioplatense primero: dice
     los números con la entonación con la que el usuario los espera. */
  const orden = ['es-uy', 'es-ar', 'es-419', 'es-us', 'es-mx', 'es-cl', 'es-es', 'es'];
  for (const p of orden) {
    const v = vs.find((v) => (v.lang || '').toLowerCase().replace('_', '-').startsWith(p));
    if (v) return v;
  }
  return null;
}

function decir(texto, { interrumpe = true } = {}) {
  if (!habilitado || !soportado() || !texto) return;

  const u = new window.SpeechSynthesisUtterance(texto);
  if (vozEs) { u.voice = vozEs; u.lang = vozEs.lang; }
  else u.lang = 'es-ES';
  /* 1,15 es rápido sin sonar acelerado. A 1 la frase de tres palabras
     se come medio segundo más, que es justo lo que no sobra. */
  u.rate = 1.15;
  u.pitch = 1;
  u.volume = 1;

  enVuelo.add(u);
  const soltar = () => enVuelo.delete(u);
  u.addEventListener('end', soltar);
  u.addEventListener('error', soltar);

  try {
    if (interrumpe) {
      window.speechSynthesis.cancel();
      setTimeout(() => { try { window.speechSynthesis.speak(u); } catch {} }, 0);
    } else {
      window.speechSynthesis.speak(u);
    }
  } catch { soltar(); }
}

export const voz = {
  get activo() { return habilitado; },
  get disponible() { return soportado(); },

  /** Se llama desde un gesto real del usuario, o el navegador no habla. */
  preparar() {
    if (!soportado()) return;
    vozEs = elegirVoz();
    if (!escuchando) {
      escuchando = true;
      try {
        window.speechSynthesis.addEventListener('voiceschanged', () => { vozEs = elegirVoz(); });
      } catch {}
    }
    if (!habilitado) return;
    /* Frase muda dentro del gesto: deja el motor abierto para que la
       primera de verdad no se pierda. */
    try { window.speechSynthesis.speak(new window.SpeechSynthesisUtterance(' ')); } catch {}
  },

  alternar() {
    habilitado = !habilitado;
    try { localStorage.setItem(PREF, habilitado ? 'on' : 'off'); } catch {}
    if (habilitado) {
      this.preparar();
      /* Confirma hablando, y no con un cartel: así el usuario sabe
         ANTES de empezar la serie si el audio le está saliendo por los
         auriculares o por el parlante del teléfono. Es la única prueba
         que importa y dura un segundo. */
      decir('Manos libres activado.');
    } else {
      this.callar();
    }
    return habilitado;
  },

  callar() {
    if (!soportado()) return;
    try { window.speechSynthesis.cancel(); } catch {}
    enVuelo.clear();
  },

  /** Al empezar una serie: se rearma el aviso de corte. */
  serieNueva() {
    avisadoCorte = false;
  },

  /** Terminó la calibración y puede levantar. */
  listo() {
    decir('Listo.');
  },

  /**
   * Una repetición contada.
   * Si la pérdida cruzó el umbral por primera vez, esta repetición
   * dice el aviso en lugar del número.
   */
  rep(vel, perdidaPct = 0, umbral = 20) {
    if (!habilitado) return;
    if (!avisadoCorte && perdidaPct >= umbral) {
      avisadoCorte = true;
      decir(fraseCorte(perdidaPct));
      return;
    }
    decir(fraseRep(vel));
  },

  /** Cierre de la serie. No interrumpe: para acá ya nadie está levantando. */
  resumen(reps, perdidaPct) {
    if (!habilitado) return;
    decir(fraseResumen(reps, perdidaPct), { interrumpe: false });
  },
};
