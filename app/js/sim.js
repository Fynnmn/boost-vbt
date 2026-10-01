/* ============================================================
   sim.js — sensor simulado.

   POR QUÉ EXISTE: el firmware está escrito pero nunca corrió en la
   placa, y la placa todavía no se compró. Sin esto, la app no se
   podría escribir ni probar hasta que llegue el hardware.

   El simulador NO es un mock de conveniencia: emite exactamente los
   mismos bytes que emitiría el firmware, y la app los parsea con el
   mismo protocol.js. Cuando aparezca el sensor real, se cambia una
   clase por la otra y nada más. Si el simulador emitiera objetos ya
   parseados, el parser quedaría sin ejercitar y el primer día con la
   placa sería el primer día que corre.

   La física es la de la literatura de VBT: la velocidad media
   concéntrica cae linealmente con el % del 1RM, y dentro de la serie
   decae hacia el umbral de velocidad mínima a medida que se acumula
   fatiga. Los números salen parecidos a los reales, pero son un
   modelo — NO son evidencia sobre el gimnasio.
   ============================================================ */

import { SCHEMA_VERSION, OP } from './protocol.js';
import { PARAMS, PARAM_POR_ID } from './params.js';
import { BATCH_SESSION_HDR, BATCH_END } from './protocol.js';

/* Perfil por ejercicio.
   v1rm  = velocidad media concéntrica con la que se mueve un 1RM
   vLow  = velocidad con una carga liviana (30% del 1RM)
   rom   = recorrido típico de la barra, en metros
   Los v1rm son los valores que reporta la literatura de VBT. */
const PROFILE = {
  1: { v1rm: 0.17, vLow: 1.20, rom: 0.42, name: 'banca'      },
  2: { v1rm: 0.30, vLow: 1.35, rom: 0.55, name: 'sentadilla' },
  3: { v1rm: 0.15, vLow: 0.95, rom: 0.60, name: 'muerto'     },
  4: { v1rm: 0.19, vLow: 1.15, rom: 0.50, name: 'militar'    },
  5: { v1rm: 0.30, vLow: 1.30, rom: 0.35, name: 'remo'       },
  6: { v1rm: 0.25, vLow: 1.10, rom: 0.30, name: 'hip'        },
  0: { v1rm: 0.20, vLow: 1.20, rom: 0.45, name: 'genérico'   },
};

/* 1RM supuestos del atleta simulado. Sólo sirven para que la carga
   que ingresás produzca velocidades verosímiles. */
const ASSUMED_1RM = { 1: 100, 2: 140, 3: 170, 4: 65, 5: 90, 6: 160, 0: 100 };

const rnd = (a, b) => a + Math.random() * (b - a);
const gauss = () => {
  /* Box-Muller. Con ruido uniforme las series salen demasiado prolijas
     y los gráficos mienten sobre lo que se va a ver de verdad. */
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

export class SimSensor extends EventTarget {
  constructor() {
    super();
    this.name = 'VBT-51M';        // el sufijo delata que es simulado
    this.simulated = true;
    this.connected = false;
    this._state = 0;              // SLEEP
    this._batteryPct = 87;
    this._setIndex = 0;
    this._reps = [];
    this._timer = null;
    this._statusTimer = null;
    this._t0 = 0;
    this._bootedAt = Date.now();
    this._exerciseId = 1;
    this._loadKg = 0;
    this._calibrated = true;
    this._configDirty = false;

    /* Los ajustes arrancan en los defaults de la tabla del firmware. El
       simulador valida IGUAL que el sensor a proposito: si aceptara cosas
       que el firmware rechaza, probar la pantalla contra el simulador daria
       confianza falsa y el error aparecería recién con el hardware en la
       mano. */
    this._config = new Map(PARAMS.map((p) => [p.id, p.def]));

    /* Tres sesiones falsas en el log, para poder recorrer la pantalla de
       descarga sin la placa. La tercera quedó ABIERTA a propósito: es el caso
       que de verdad pasa cuando se acaba la batería en medio de una serie, y
       el que hay que poder ver antes de que ocurra en el gimnasio. */
    this._seqVolcado = 0;
    this._sesiones = [
      { exerciseId: 1, loadKg: 82.5, muestras: 2400, t0: 1788900000, abierta: false },
      { exerciseId: 2, loadKg: 120,  muestras: 3100, t0: 1788986400, abierta: false },
      { exerciseId: 3, loadKg: 140,  muestras: 0,    t0: 1789072800, abierta: true },
    ];
  }

  /* --- Volcado del log interno ------------------------------ */

  /** Arma los 32 bytes del header de sesión, idénticos a los del firmware. */
  _headerDeSesion(s) {
    const b = new DataView(new ArrayBuffer(32));
    b.setUint8(0, 0x56); b.setUint8(1, 0x42); b.setUint8(2, 0x54); b.setUint8(3, 0x31);
    b.setUint16(4, 1, true);
    b.setUint16(6, 208, true);
    b.setUint8(8, 8);
    b.setUint16(9, 1000, true);
    b.setUint8(11, s.exerciseId);
    /* Una sesión abierta declara 0xFFFFFFFF: se cortó la energía en el medio. */
    b.setUint32(12, s.abierta ? 0xffffffff : s.muestras, true);
    b.setUint32(16, s.t0, true);
    b.setUint16(20, Math.round(s.loadKg * 10), true);
    b.setUint8(22, 0);                       // origen: sensor real
    return new Uint8Array(b.buffer);
  }

  _loteHeader(header32) {
    const b = new Uint8Array(8 + 32);
    const d = new DataView(b.buffer);
    d.setUint8(0, SCHEMA_VERSION);
    d.setUint8(1, BATCH_SESSION_HDR);
    d.setUint16(2, this._seqVolcado++, true);
    b.set(header32, 8);
    return b;
  }

  _loteFin(total) {
    const d = new DataView(new ArrayBuffer(8));
    d.setUint8(0, SCHEMA_VERSION);
    d.setUint8(1, BATCH_END);
    d.setUint16(2, this._seqVolcado++, true);
    d.setUint32(4, total, true);
    return new Uint8Array(d.buffer);
  }

  async _volcarIndice() {
    this._seqVolcado = 0;
    for (const s of this._sesiones) {
      await sleep(rnd(10, 30));
      this._emit('bytes', { char: 'logdump', data: this._loteHeader(this._headerDeSesion(s)) });
    }
    await sleep(rnd(10, 30));
    this._emit('bytes', { char: 'logdump', data: this._loteFin(this._sesiones.length) });
  }

  async _volcarSesion(indice) {
    const s = this._sesiones[indice];
    /* El firmware responde con un error y no manda NADA. Si el simulador
       mandara algo igual, la app se probaría contra un caso que no existe. */
    if (!s || s.abierta) {
      this._lastError = 5;                   // QSPI
      this._pushStatus();
      return;
    }

    this._seqVolcado = 0;
    this._emit('bytes', { char: 'logdump', data: this._loteHeader(this._headerDeSesion(s)) });

    const POR_LOTE = 19;                     // lo que entra con MTU 247
    let enviadas = 0;
    while (enviadas < s.muestras) {
      const n = Math.min(POR_LOTE, s.muestras - enviadas);
      const b = new Uint8Array(8 + n * 12);
      const d = new DataView(b.buffer);
      d.setUint8(0, SCHEMA_VERSION);
      d.setUint8(1, n);
      d.setUint16(2, this._seqVolcado++, true);
      /* Una senoide, para que el archivo descargado no sea ruido plano y se
         note enseguida si las muestras llegan mezcladas. */
      for (let i = 0; i < n; i++) {
        const t = (enviadas + i) / 208;
        const f = Math.sin(t * 2 * Math.PI * 0.5);
        d.setInt16(8 + i * 12, Math.round(400 * f), true);
        d.setInt16(8 + i * 12 + 2, Math.round(200 * f), true);
        d.setInt16(8 + i * 12 + 4, Math.round(4098 + 1200 * f), true);
        d.setInt16(8 + i * 12 + 6, Math.round(60 * f), true);
        d.setInt16(8 + i * 12 + 8, Math.round(40 * f), true);
        d.setInt16(8 + i * 12 + 10, Math.round(20 * f), true);
      }
      this._emit('bytes', { char: 'logdump', data: b });
      enviadas += n;
      /* Una pausa cada tantos lotes: por BLE real esto tarda minutos, y sin
         algo de latencia la pantalla de progreso nunca se probaría de verdad. */
      if (this._seqVolcado % 8 === 0) await sleep(1);
    }

    this._emit('bytes', { char: 'logdump', data: this._loteFin(enviadas) });
  }

  /* --- ciclo de conexión ---------------------------------- */

  async connect() {
    await sleep(rnd(400, 900));   // el escaneo BLE real tarda algo
    this.connected = true;
    this._state = 2;              // CONNECTED_IDLE
    this._emit('connection', { connected: true, name: this.name, simulated: true });
    this._pushStatus();
    /* El firmware notifica Status cada 10 s mientras está conectado. */
    this._statusTimer = setInterval(() => this._pushStatus(), 10000);
    return this;
  }

  async disconnect() {
    clearInterval(this._statusTimer);
    clearTimeout(this._timer);
    this._statusTimer = this._timer = null;
    this.connected = false;
    this._state = 1;
    this._emit('connection', { connected: false, simulated: true });
  }

  /* --- Config: mismas reglas que el firmware --------------- */

  async writeConfig(bytes) {
    const d = new DataView(bytes.buffer ?? bytes);
    if (d.getUint8(0) !== SCHEMA_VERSION) throw new Error('schema distinto');

    const id = d.getUint8(1);
    const tipo = d.getUint8(2);
    const spec = PARAM_POR_ID.get(id);
    if (!spec) throw new Error('parámetro desconocido');

    if (tipo === 0xff) return;              // pedido de lectura: no escribe
    if (tipo !== spec.tipo) throw new Error('tipo equivocado');
    if (!spec.escribible) throw new Error('parámetro de sólo lectura');

    let v = d.getUint32(4, true);
    if (spec.tipo === 0) v &= 0xff;
    else if (spec.tipo === 1) v &= 0xffff;
    if (v < spec.min || v > spec.max) throw new Error('fuera de rango');

    /* Los cruces que ningun rango individual atrapa: min y max pueden ser
       validos por separado y dejar una ventana vacia. */
    const par = {
      REP_MIN_ROM_MM: ['REP_MAX_ROM_MM', 'menor'],
      REP_MAX_ROM_MM: ['REP_MIN_ROM_MM', 'mayor'],
      REP_MIN_DUR_MS: ['REP_MAX_DUR_MS', 'menor'],
      REP_MAX_DUR_MS: ['REP_MIN_DUR_MS', 'mayor'],
    }[spec.nombre];
    if (par) {
      const otro = PARAMS.find((p) => p.nombre === par[0]);
      const vOtro = this._config.get(otro.id);
      if (par[1] === 'menor' ? v >= vOtro : v <= vOtro) {
        /* El mismo texto que arma sensor.js para el sensor real: si el
           simulador dijera otra cosa, probar acá no prepararía para lo que
           se ve con el hardware en la mano. */
        throw new Error('El sensor rechazó el valor. Suele ser porque queda ' +
          'cruzado con su par (un mínimo por encima del máximo).');
      }
    }

    this._config.set(id, v);
    /* Los del IMU no llegan al chip hasta el proximo cambio de modo. */
    if (id >= 0x10 && id <= 0x21) this._configDirty = true;
    this._pushStatus();
  }

  async readConfig(bytesPedido) {
    const d = new DataView(bytesPedido.buffer ?? bytesPedido);
    const id = d.getUint8(1);
    const spec = PARAM_POR_ID.get(id);
    if (!spec) throw new Error('parámetro desconocido');

    await sleep(rnd(8, 25));                // el ida y vuelta BLE no es gratis
    const out = new DataView(new ArrayBuffer(8));
    out.setUint8(0, SCHEMA_VERSION);
    out.setUint8(1, id);
    out.setUint8(2, spec.tipo);
    out.setUint32(4, this._config.get(id) >>> 0, true);
    return new Uint8Array(out.buffer);
  }

  /* --- Control: mismos opcodes que el firmware ------------- */

  async write(bytes) {
    const d = new DataView(bytes.buffer ?? bytes);
    if (d.getUint8(0) !== SCHEMA_VERSION) return;   // se descarta en silencio
    const op = d.getUint8(1);
    switch (op) {
      case OP.SET_START:
        this._startSet(d.getUint8(2), d.getUint16(3, true) / 10);
        break;
      case OP.SET_STOP:
        this._stopSet();
        break;
      case OP.SLEEP:
        this._state = 0;
        this._pushStatus();
        break;
      /* Comandos que el firmware acepta y que acá no cambian nada
         visible. Igual hay que reconocerlos: si cayeran en el default,
         el simulador reportaría "comando desconocido" en cada conexión
         y la app mostraría un error que no existe. */
      case OP.LOG_LIST:
        this._lastError = 0;
        this._volcarIndice();
        break;
      case OP.LOG_DUMP:
        this._lastError = 0;
        this._volcarSesion(d.getUint16(2, true));
        break;
      case OP.LOG_ERASE:
        this._sesiones = [];
        this._lastError = 0;
        this._pushStatus();
        break;
      case OP.SET_TIME:
      case OP.MODE_LOGGER:
      case OP.MODE_RAWSTREAM:
      case OP.CALIB_ODR:
        this._lastError = 0;
        break;
      default:
        /* Opcode desconocido: se ignora y se informa en last_error.
           Nunca se cuelga. (PROTOCOL.md) */
        this._lastError = 6;
        this._pushStatus();
    }
  }

  /* --- generación de la serie ------------------------------ */

  _startSet(exerciseId, loadKg) {
    this._exerciseId = exerciseId;
    this._loadKg = loadKg;
    this._setIndex = (this._setIndex + 1) & 0xff;
    this._reps = [];
    this._t0 = Date.now();
    this._lastError = 0;

    /* CALIBRATING: el sensor mide su propio offset en los segundos que
       la barra queda apoyada antes del primer levantamiento. Es lo que
       pasa de verdad tras apretar "Comenzar serie" — no es cosmético. */
    this._state = 7;
    this._pushStatus();

    const calibMs = rnd(1200, 1800);
    /* Una de cada doce series arranca sin que llegue a calibrar: el
       atleta levantó enseguida. Esas reps salen con WEAK_ZUPT y la app
       tiene que mostrarlas con advertencia, no esconderlas. */
    this._calibrated = Math.random() > 1 / 12;

    this._timer = setTimeout(() => {
      this._state = 3;            // RECORDING
      this._pushStatus();
      this._scheduleRep(rnd(900, 1600));
    }, this._calibrated ? calibMs : rnd(300, 600));
  }

  _scheduleRep(delayMs) {
    this._timer = setTimeout(() => this._emitRep(), delayMs);
  }

  _emitRep() {
    if (this._state !== 3) return;

    const p = PROFILE[this._exerciseId] || PROFILE[0];
    const oneRm = ASSUMED_1RM[this._exerciseId] || 100;
    const pct = clamp01(this._loadKg / oneRm);

    /* Recta carga-velocidad: v = vLow + (v1rm - vLow) * (pct - 0.3)/0.7 */
    const v1 = Math.max(
      p.v1rm * 0.9,
      p.vLow + (p.v1rm - p.vLow) * ((pct - 0.3) / 0.7)
    );

    /* Reps hasta el fallo con esa carga, por Epley invertido. Marca el
       ritmo al que la fatiga hace caer la velocidad. */
    const maxReps = Math.max(2, Math.min(30, 30 * (1 / Math.max(pct, 0.35) - 1)));

    const n = this._reps.length + 1;
    const fatigue = Math.pow((n - 1) / maxReps, 1.5);
    let vel = v1 + (p.v1rm - v1) * fatigue;
    vel += gauss() * 0.022;                       // variación entre reps
    vel = Math.max(0.06, vel);

    const rom = p.rom * (1 + gauss() * 0.05);
    const concMs = Math.round((rom / vel) * 1000);
    const eccMs = Math.round(concMs * rnd(1.3, 2.2));
    const pauseMs = this._exerciseId === 1 ? Math.round(rnd(80, 700)) : Math.round(rnd(0, 250));
    const peak = vel * rnd(1.5, 1.9);
    const peakPos = Math.round(rnd(28, 52));

    let flags = 0;
    if (!this._calibrated) flags |= 1 << 1;                      // WEAK_ZUPT
    if (peak > 2.6) flags |= 1 << 0;                             // SATURATED
    if (Math.abs(rom - p.rom) / p.rom > 0.13) flags |= 1 << 2;   // ROM_OUTLIER
    if (Math.random() < 0.04) flags |= 1 << 3;                   // HIGH_ROTATION
    if (vel < p.v1rm * 1.05) flags |= 1 << 4;                    // LOW_CONFIDENCE

    const rep = { n, vel, rom, concMs, eccMs, pauseMs, peak, peakPos, flags };
    this._reps.push(rep);
    this._emit('bytes', { char: 'rep', data: encodeRepResult(rep, this._setIndex) });
    this._pushStatus();

    /* La serie se corta sola cuando el atleta ya no puede: cerca del
       umbral de velocidad mínima la probabilidad de fallar sube. */
    const nearFailure = (vel - p.v1rm) / Math.max(v1 - p.v1rm, 0.01);
    const stop = n >= 30 || (nearFailure < 0.22 && Math.random() < 0.45);
    if (stop) {
      /* No cierra la serie de golpe: el firmware espera el timeout de
         inactividad o el SET_STOP de la app. Acá deja la serie abierta
         y quieta, que es lo que pasa de verdad. */
      return;
    }
    this._scheduleRep(rnd(2200, 4200) + eccMs + concMs);
  }

  _stopSet() {
    clearTimeout(this._timer);
    this._timer = null;
    const reps = this._reps;
    const durationMs = Date.now() - this._t0;

    if (reps.length > 0) {
      const vels = reps.map((r) => r.vel);
      const best = Math.max(...vels);
      const summary = {
        setIndex: this._setIndex,
        repCount: reps.length,
        exerciseId: this._exerciseId,
        best,
        first: vels[0],
        last: vels[vels.length - 1],
        /* Contra la MEJOR rep, no contra la primera: si la primera salió
           mal no arrastra el cálculo entero. (PROTOCOL.md) */
        lossPct: ((best - vels[vels.length - 1]) / best) * 100,
        loadKg: this._loadKg,
        durationMs,
        flags: reps.reduce((a, r) => a | r.flags, 0),
      };
      this._emit('bytes', { char: 'set', data: encodeSetSummary(summary) });
    }

    this._state = 2;
    this._batteryPct = Math.max(1, this._batteryPct - (Math.random() < 0.3 ? 1 : 0));
    this._pushStatus();
  }

  /* --- Status --------------------------------------------- */

  _pushStatus() {
    const flags =
      0x01 |                                    // IMU_OK
      (this._configDirty ? 0x10 : 0) |          // CONFIG_DIRTY
      (this._calibrated ? 0x20 : 0);            // CALIBRATED
    const bytes = encodeStatus({
      state: this._state,
      batteryPct: this._batteryPct,
      flags,
      batteryMv: 3300 + Math.round((this._batteryPct / 100) * 900),
      repCount: this._reps.length,
      exerciseId: this._exerciseId,
      uptimeS: Math.round((Date.now() - this._bootedAt) / 1000),
      logFreeBytes: 8 * 1024 * 1024,
      fwVersion: (0 << 8) | 9,
      lastError: this._lastError || 0,
    });
    this._emit('bytes', { char: 'status', data: bytes });
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

/* ============================================================
   Encoders — el simulador escribe los mismos bytes que el firmware.
   ============================================================ */

const mm = (metersPerSec) => Math.round(clamp(metersPerSec, 0, 65.5) * 1000);

function encodeRepResult(r, setIndex) {
  const d = new DataView(new ArrayBuffer(20));
  d.setUint8(0, SCHEMA_VERSION);
  d.setUint8(1, r.n & 0xff);
  d.setUint16(2, mm(r.vel), true);
  d.setUint16(4, mm(r.vel * 1.06), true);   // propulsiva: algo mayor que la media
  d.setUint16(6, mm(r.peak), true);
  d.setUint16(8, mm(r.rom), true);
  d.setUint16(10, Math.min(65535, r.concMs), true);
  d.setUint16(12, Math.min(65535, r.eccMs), true);
  d.setUint16(14, Math.min(65535, r.pauseMs), true);
  d.setUint8(16, r.flags);
  d.setUint8(17, r.peakPos);
  d.setUint8(18, setIndex);
  return new Uint8Array(d.buffer);
}

function encodeSetSummary(s) {
  const d = new DataView(new ArrayBuffer(20));
  d.setUint8(0, SCHEMA_VERSION);
  d.setUint8(1, s.setIndex);
  d.setUint8(2, Math.min(255, s.repCount));
  d.setUint8(3, s.exerciseId);
  d.setUint16(4, mm(s.best), true);
  d.setUint16(6, mm(s.first), true);
  d.setUint16(8, mm(s.last), true);
  d.setUint16(10, Math.round(clamp(s.lossPct, 0, 6553.5) * 10), true);
  d.setUint16(12, Math.round(clamp(s.loadKg, 0, 6553.5) * 10), true);
  d.setUint32(14, s.durationMs >>> 0, true);
  d.setUint8(18, s.flags);
  return new Uint8Array(d.buffer);
}

function encodeStatus(s) {
  const d = new DataView(new ArrayBuffer(20));
  d.setUint8(0, SCHEMA_VERSION);
  d.setUint8(1, s.state);
  d.setUint8(2, s.batteryPct);
  d.setUint8(3, s.flags);
  d.setUint16(4, s.batteryMv, true);
  d.setUint8(6, Math.min(255, s.repCount));
  d.setUint8(7, s.exerciseId);
  d.setUint32(8, s.uptimeS >>> 0, true);
  d.setUint32(12, s.logFreeBytes >>> 0, true);
  d.setUint16(16, s.fwVersion, true);
  d.setUint8(18, s.lastError);
  return new Uint8Array(d.buffer);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v) => clamp(v, 0, 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
