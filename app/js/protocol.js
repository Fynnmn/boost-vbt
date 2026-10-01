/* ============================================================
   protocol.js — implementación del contrato BLE del sensor.

   ESPEJO EXACTO de firmware/docs/PROTOCOL.md, esquema versión 1.
   Si tocás algo acá, tiene que cambiar también en el firmware
   (src/ble/protocol.h) y en tools/decode.py. Los tres o ninguno.

   Todo little-endian. Todas las magnitudes viajan como enteros
   (mm/s, mm, ms, kg×10) — nunca float en el aire. Las funciones
   de este archivo son puras: entra un DataView, sale un objeto.
   No tocan el DOM ni la radio, así que se pueden testear solas.
   ============================================================ */

export const SCHEMA_VERSION = 1;

const BASE = (xx) => `7d4e1a${xx}-9b3f-4c62-a5d8-6e1f2c3b4a59`;

export const UUID = {
  vbtService: BASE('00'),
  repResult:  BASE('01'),
  setSummary: BASE('02'),
  control:    BASE('03'),
  config:     BASE('04'),
  status:     BASE('05'),
  rawStream:  BASE('06'),
  logDump:    BASE('07'),
  battery:    0x180f,
  deviceInfo: 0x180a,
};

/* --- Opcodes de Control ------------------------------------ */
export const OP = {
  SET_START: 0x01,
  SET_STOP: 0x02,
  SLEEP: 0x03,
  MODE_LOGGER: 0x04,
  MODE_RAWSTREAM: 0x05,
  SET_TIME: 0x06,
  LOG_ERASE: 0x07,
  LOG_DUMP: 0x08,
  CALIB_ODR: 0x09,
  FACTORY_RESET: 0x0a,
  LOG_LIST: 0x0b,
};

/* Valores especiales de `count` en el encabezado de lote. Con MTU 247 entran
   19 muestras, así que de 20 para arriba queda libre para señalizar sin
   agrandar el encabezado ni subir el SCHEMA_VERSION. */
export const BATCH_SESSION_HDR = 0xfe;
export const BATCH_END = 0xff;

/* --- Ejercicios -------------------------------------------- */
export const EXERCISES = [
  { id: 1, name: 'Press banca',    short: 'Banca' },
  { id: 2, name: 'Sentadilla',     short: 'Sentadilla' },
  { id: 3, name: 'Peso muerto',    short: 'Muerto' },
  { id: 4, name: 'Press militar',  short: 'Militar' },
  { id: 5, name: 'Remo con barra', short: 'Remo' },
  { id: 6, name: 'Hip thrust',     short: 'Hip' },
  { id: 0, name: 'Genérico',       short: 'Genérico' },
];
export const exerciseName = (id) =>
  (EXERCISES.find((e) => e.id === id) || EXERCISES[EXERCISES.length - 1]).name;

/* --- Estados del sensor ------------------------------------ */
export const STATE = {
  0: 'SLEEP', 1: 'ADVERTISING', 2: 'CONNECTED_IDLE', 3: 'RECORDING',
  4: 'LOGGER', 5: 'TRAVEL', 6: 'ERROR', 7: 'CALIBRATING',
};
/* Un estado que no conocemos NO es un error: el firmware puede agregar
   valores al enum sin subir SCHEMA_VERSION (así entró CALIBRATING). */
export const stateName = (v) => STATE[v] || `DESCONOCIDO(${v})`;

/* --- quality_flags de RepResult ---------------------------- */
export const QUALITY = [
  { bit: 0, key: 'saturated',     label: 'Saturado',       help: 'El acelerómetro llegó al fondo de escala. La rep no es confiable.' },
  { bit: 1, key: 'weakZupt',      label: 'Sin reposo',     help: 'No hubo un instante de quietud claro antes de la rep: la velocidad puede tener deriva.' },
  { bit: 2, key: 'romOutlier',    label: 'Recorrido raro', help: 'El recorrido difiere mucho del de las otras reps de la serie.' },
  { bit: 3, key: 'highRotation',  label: 'Rotación',       help: 'El giroscopio detectó rotación importante. El sensor puede estar mal montado.' },
  { bit: 4, key: 'lowConfidence', label: 'Al límite',      help: 'Contada, pero cerca del umbral de detección.' },
];

export function decodeQuality(bits) {
  const out = { raw: bits, any: false, list: [] };
  for (const q of QUALITY) {
    const on = (bits & (1 << q.bit)) !== 0;
    out[q.key] = on;
    if (on) { out.any = true; out.list.push(q); }
  }
  return out;
}

/* --- flags de Status --------------------------------------- */
export function decodeStatusFlags(bits) {
  return {
    raw: bits,
    imuOk:             (bits & 0x01) !== 0,
    charging:          (bits & 0x02) !== 0,
    logFull:           (bits & 0x04) !== 0,
    saturatedRecently: (bits & 0x08) !== 0,
    configDirty:       (bits & 0x10) !== 0,
    calibrated:        (bits & 0x20) !== 0,
  };
}

export const ERRORS = {
  0: null,
  1: 'El IMU no responde por I2C',
  2: 'WHO_AM_I incorrecto',
  3: 'Overrun del FIFO',
  4: 'Memoria de log llena',
  5: 'La memoria QSPI no responde',
  6: 'El sensor no entendió un comando',
  7: 'Parámetro de configuración desconocido',
  8: 'Falló la negociación de MTU',
  9: 'Batería crítica, apagando',
};
export const errorText = (code) => ERRORS[code] ?? `Error ${code}`;

/* ============================================================
   Parsers. Devuelven null si la versión de esquema no es la
   nuestra — el contrato dice descartar en silencio, no romper.
   ============================================================ */

const view = (buf) =>
  buf instanceof DataView
    ? buf
    : new DataView(buf.buffer ?? buf, buf.byteOffset ?? 0, buf.byteLength);

export function parseRepResult(input) {
  const d = view(input);
  if (d.byteLength < 20 || d.getUint8(0) !== SCHEMA_VERSION) return null;
  return {
    kind: 'rep',
    repIndex:    d.getUint8(1),
    meanConcVel: d.getUint16(2, true) / 1000,   // m/s
    meanPropVel: d.getUint16(4, true) / 1000,
    peakVel:     d.getUint16(6, true) / 1000,
    rom:         d.getUint16(8, true) / 1000,   // m
    concMs:      d.getUint16(10, true),
    eccMs:       d.getUint16(12, true),
    pauseMs:     d.getUint16(14, true),
    quality:     decodeQuality(d.getUint8(16)),
    peakVelPos:  d.getUint8(17),                // % del ROM
    setIndex:    d.getUint8(18),
  };
}

export function parseSetSummary(input) {
  const d = view(input);
  if (d.byteLength < 20 || d.getUint8(0) !== SCHEMA_VERSION) return null;
  return {
    kind: 'set',
    setIndex:     d.getUint8(1),
    repCount:     d.getUint8(2),
    exerciseId:   d.getUint8(3),
    bestMeanVel:  d.getUint16(4, true) / 1000,
    firstRepVel:  d.getUint16(6, true) / 1000,
    lastRepVel:   d.getUint16(8, true) / 1000,
    velocityLoss: d.getUint16(10, true) / 10,   // %
    loadKg:       d.getUint16(12, true) / 10,
    durationMs:   d.getUint32(14, true),
    flags:        decodeQuality(d.getUint8(18)),
  };
}

export function parseStatus(input) {
  const d = view(input);
  if (d.byteLength < 20 || d.getUint8(0) !== SCHEMA_VERSION) return null;
  const fw = d.getUint16(16, true);
  const err = d.getUint8(18);
  return {
    kind: 'status',
    state:        d.getUint8(1),
    stateName:    stateName(d.getUint8(1)),
    batteryPct:   d.getUint8(2),
    flags:        decodeStatusFlags(d.getUint8(3)),
    batteryMv:    d.getUint16(4, true),
    repCount:     d.getUint8(6),
    exerciseId:   d.getUint8(7),
    uptimeS:      d.getUint32(8, true),
    logFreeBytes: d.getUint32(12, true),
    fwVersion:    `${fw >> 8}.${fw & 0xff}`,
    lastError:    err,
    errorText:    errorText(err),
  };
}

/* ============================================================
   Encoders de Control.
   ============================================================ */

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function encodeSetStart(exerciseId, loadKg) {
  const b = new DataView(new ArrayBuffer(5));
  b.setUint8(0, SCHEMA_VERSION);
  b.setUint8(1, OP.SET_START);
  b.setUint8(2, exerciseId & 0xff);
  b.setUint16(3, Math.round(clamp(loadKg, 0, 6553.5) * 10), true);
  return new Uint8Array(b.buffer);
}

export function encodeSimple(opcode) {
  return new Uint8Array([SCHEMA_VERSION, opcode]);
}

export function encodeSetTime(unixSeconds) {
  const b = new DataView(new ArrayBuffer(6));
  b.setUint8(0, SCHEMA_VERSION);
  b.setUint8(1, OP.SET_TIME);
  b.setUint32(2, unixSeconds >>> 0, true);
  return new Uint8Array(b.buffer);
}

/* Config es clave-valor a propósito: agregar un parámetro nuevo no
   sube SCHEMA_VERSION. type: 0=u8 1=u16 2=i16 3=u32 4=float */
export function encodeConfigWrite(paramId, type, value) {
  const b = new DataView(new ArrayBuffer(8));
  b.setUint8(0, SCHEMA_VERSION);
  b.setUint8(1, paramId & 0xff);
  b.setUint8(2, type & 0xff);
  b.setUint8(3, 0);
  switch (type) {
    case 0: b.setUint8(4, value); break;
    case 1: b.setUint16(4, value, true); break;
    case 2: b.setInt16(4, value, true); break;
    case 3: b.setUint32(4, value >>> 0, true); break;
    case 4: b.setFloat32(4, value, true); break;
    default: throw new Error(`param_type ${type} desconocido`);
  }
  return new Uint8Array(b.buffer);
}

/* Para leer un parámetro: se escribe el param_id con type 0xFF y
   después se lee la característica. (PROTOCOL.md, sección Config.) */
export function encodeConfigReadRequest(paramId) {
  const b = new DataView(new ArrayBuffer(8));
  b.setUint8(0, SCHEMA_VERSION);
  b.setUint8(1, paramId & 0xff);
  b.setUint8(2, 0xff);
  return new Uint8Array(b.buffer);
}


/* ------------------------------------------------------------------
   Volcado del log interno

   RawStream y LogDump comparten el mismo encabezado de lote, así que
   esto parsea los dos. Ocho bytes: schema, count, seq (u16), t0_us (u32).
   ------------------------------------------------------------------ */

export function encodeLogDump(sessionIndex) {
  const b = new DataView(new ArrayBuffer(4));
  b.setUint8(0, SCHEMA_VERSION);
  b.setUint8(1, OP.LOG_DUMP);
  b.setUint16(2, sessionIndex & 0xffff, true);
  return new Uint8Array(b.buffer);
}

/**
 * Parsea un lote de LogDump.
 *
 * Devuelve `null` si el schema no coincide o si el lote está truncado. No se
 * intenta adivinar: un lote a medio leer produciría muestras inventadas, y en
 * un dataset eso no se nota hasta mucho después.
 */
export function parseLogBatch(data) {
  const d = data instanceof DataView ? data : new DataView(data.buffer ?? data);
  if (d.byteLength < 8) return null;
  if (d.getUint8(0) !== SCHEMA_VERSION) return null;

  const count = d.getUint8(1);
  const seq = d.getUint16(2, true);

  if (count === BATCH_END) {
    /* En el cierre, t0_us NO es un timestamp: lleva el total que el sensor
       dice haber mandado, para poder comparar contra lo recibido. */
    return { tipo: 'fin', seq, total: d.getUint32(4, true) };
  }

  if (count === BATCH_SESSION_HDR) {
    if (d.byteLength < 8 + 32) return null;
    const header = new Uint8Array(d.buffer.slice(d.byteOffset + 8, d.byteOffset + 40));
    return { tipo: 'header', seq, header, sesion: parseSessionHeader(header) };
  }

  const esperado = 8 + count * 12;
  if (d.byteLength < esperado) return null;
  const muestras = new Uint8Array(
    d.buffer.slice(d.byteOffset + 8, d.byteOffset + esperado));
  return { tipo: 'muestras', seq, count, muestras };
}

/** El header de 32 bytes, que es EXACTAMENTE el header de un archivo .vbt. */
export function parseSessionHeader(bytes) {
  const d = new DataView(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, 32);
  const magic = String.fromCharCode(d.getUint8(0), d.getUint8(1),
                                    d.getUint8(2), d.getUint8(3));
  return {
    magic,
    valido: magic === 'VBT1',
    version: d.getUint16(4, true),
    odrHz: d.getUint16(6, true),
    accelFsG: d.getUint8(8),
    gyroFsDps: d.getUint16(9, true),
    exerciseId: d.getUint8(11),
    muestras: d.getUint32(12, true),
    t0Unix: d.getUint32(16, true),
    loadKg: d.getUint16(20, true) / 10,
    origen: d.getUint8(22),
  };
}

/* Una sesión abierta tiene sample_count en 0xFFFFFFFF: se cortó la energía en
   el medio de la grabación. El firmware se niega a volcarla, y la app tiene
   que poder decir por qué en vez de mostrar un número absurdo. */
export const SESION_ABIERTA = 0xffffffff;
