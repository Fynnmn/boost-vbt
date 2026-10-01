/* ============================================================
   imu.js — grabación con el IMU del teléfono.

   POR QUÉ EXISTE: el firmware mide 94,7% de precisión contra señal
   SINTÉTICA, generada por el mismo razonamiento que escribió el
   detector. Es circular, y no dice nada sobre movimiento humano real.
   La placa recién llega el 6 de octubre de 2026.

   Un celular atado a la barra tiene acelerómetro y giroscopio. No es el
   sensor, pero produce señal HUMANA: rebote en el pecho, temblor cerca
   del fallo, pausas irregulares, la barra que se ladea. Todo lo que la
   sintética no tiene.

   Lo que se graba acá sale en el MISMO formato `.vbt` del firmware
   (firmware/docs/DATASET.md), así que lo leen sin cambios `replay.exe`
   y `metrics.py`. Se marca con `origen = 2` para que nadie lo confunda
   nunca con una grabación del sensor.

   LÍMITES, dichos de frente:
   · ~60 Hz contra los 208 Hz del LSM6DS3TR-C.
   · Otro chip, otro ruido, otra deriva.
   · Un teléfono atado pesa y se mueve distinto que 40 g con imanes.
   Sirve para saber si el detector CUENTA BIEN, no para validar las
   velocidades. Esa validación necesita la placa.
   ============================================================ */

/* Escalas del header. Se declaran las del sensor real para que el
   archivo lo lean las mismas herramientas sin tocar nada; el rango
   verdadero del teléfono es otro y está anotado en DATASET.md. */
const ACC_FS_G = 8;
const GYR_FS_DPS = 1000;
const ACC_LSB = 0.000244;     // g por cuenta, a ±8 g
const GYR_LSB = 0.035;        // dps por cuenta, a ±1000 dps
const G = 9.80665;            // m/s² por g

export const ORIGEN_TELEFONO = 2;

/* iOS 13+ exige pedir permiso desde un gesto del usuario. Android no
   pide nada pero sí exige HTTPS. */
export function necesitaPermiso() {
  return typeof DeviceMotionEvent !== 'undefined' &&
    typeof DeviceMotionEvent.requestPermission === 'function';
}

export function haySoporte() {
  return typeof DeviceMotionEvent !== 'undefined';
}

export async function pedirPermiso() {
  if (!necesitaPermiso()) return true;
  try {
    return (await DeviceMotionEvent.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

const clampI16 = (v) => Math.max(-32768, Math.min(32767, Math.round(v)));

export class GrabadorIMU extends EventTarget {
  constructor() {
    super();
    this.grabando = false;
    this.muestras = [];        // {ax,ay,az,gx,gy,gz} ya en cuentas
    this.t0 = 0;
    this.tUltima = 0;
    this._onMotion = this._onMotion.bind(this);
  }

  get cantidad() { return this.muestras.length; }

  /** Hz reales alcanzados. El teléfono no garantiza una tasa fija. */
  get odr() {
    const dur = (this.tUltima - this.t0) / 1000;
    return dur > 0.5 ? this.muestras.length / dur : 0;
  }

  get duracionS() { return (this.tUltima - this.t0) / 1000; }

  async iniciar() {
    if (!haySoporte()) throw new Error('Este dispositivo no expone el acelerómetro al navegador.');
    if (!(await pedirPermiso())) throw new Error('Sin permiso para usar el acelerómetro.');

    this.muestras = [];
    this.t0 = 0;
    this.tUltima = 0;
    this.grabando = true;
    window.addEventListener('devicemotion', this._onMotion);
  }

  detener() {
    this.grabando = false;
    window.removeEventListener('devicemotion', this._onMotion);
  }

  _onMotion(e) {
    if (!this.grabando) return;

    /* accelerationIncludingGravity y NO acceleration: un IMU crudo mide
       la gravedad, y el algoritmo del firmware la usa para saber cuándo
       la barra está quieta (el ZUPT). Con la versión sin gravedad, esa
       detección no tendría de dónde agarrarse. */
    const a = e.accelerationIncludingGravity;
    const r = e.rotationRate;
    if (!a || a.x == null) return;

    const t = performance.now();
    if (!this.t0) this.t0 = t;
    this.tUltima = t;

    this.muestras.push({
      ax: clampI16((a.x / G) / ACC_LSB),
      ay: clampI16((a.y / G) / ACC_LSB),
      az: clampI16((a.z / G) / ACC_LSB),
      gx: clampI16((r?.alpha ?? 0) / GYR_LSB),
      gy: clampI16((r?.beta ?? 0) / GYR_LSB),
      gz: clampI16((r?.gamma ?? 0) / GYR_LSB),
    });

    /* Se avisa cada 15 muestras, no en cada una: a 60 Hz, repintar la
       pantalla en cada evento gasta batería y no se nota. */
    if (this.muestras.length % 15 === 0) {
      this.dispatchEvent(new CustomEvent('progreso', {
        detail: { n: this.muestras.length, odr: this.odr, dur: this.duracionS },
      }));
    }
  }

  /**
   * Arma el `.vbt` binario. Header de 32 bytes, little-endian, con los
   * offsets EXACTOS de firmware/docs/DATASET.md — si alguno se corre,
   * replay.exe lee basura sin quejarse.
   */
  aVbt({ exerciseId = 1, loadKg = 0 } = {}) {
    const n = this.muestras.length;
    const buf = new ArrayBuffer(32 + n * 12);
    const d = new DataView(buf);

    d.setUint8(0, 0x56); d.setUint8(1, 0x42); d.setUint8(2, 0x54); d.setUint8(3, 0x31); // "VBT1"
    d.setUint16(4, 1, true);                          // versión del formato
    d.setUint16(6, Math.round(this.odr), true);       // ODR REAL, no la nominal
    d.setUint8(8, ACC_FS_G);
    d.setUint16(9, GYR_FS_DPS, true);
    d.setUint8(11, exerciseId & 0xff);
    d.setUint32(12, n, true);
    d.setUint32(16, Math.floor(Date.now() / 1000), true);
    d.setUint16(20, Math.round(Math.max(0, Math.min(6553.5, loadKg)) * 10), true);
    d.setUint8(22, ORIGEN_TELEFONO);
    // 23..31 quedan en cero (reservado)

    let o = 32;
    for (const m of this.muestras) {
      d.setInt16(o, m.ax, true);
      d.setInt16(o + 2, m.ay, true);
      d.setInt16(o + 4, m.az, true);
      d.setInt16(o + 6, m.gx, true);
      d.setInt16(o + 8, m.gy, true);
      d.setInt16(o + 10, m.gz, true);
      o += 12;
    }
    return new Blob([buf], { type: 'application/octet-stream' });
  }

  /**
   * La metadata. DATASET.md lo dice sin vueltas: sin esto, una grabación
   * es casi inútil seis meses después.
   */
  aJson({ exerciseId = 1, loadKg = 0, repsReales = null, nota = '' } = {}) {
    return new Blob([JSON.stringify({
      origen: 'telefono',
      origen_codigo: ORIGEN_TELEFONO,
      dispositivo: navigator.userAgent,
      ejercicio_id: exerciseId,
      carga_kg: loadKg,
      reps_reales: repsReales,
      muestras: this.muestras.length,
      odr_real_hz: Math.round(this.odr * 10) / 10,
      duracion_s: Math.round(this.duracionS * 10) / 10,
      fecha: new Date().toISOString(),
      nota,
      advertencia: 'Grabado con el IMU de un telefono, no con el sensor. ' +
        'Frecuencia y ruido distintos. No mezclar con las grabaciones del ' +
        'sensor al medir precision. Ver firmware/docs/DATASET.md.',
    }, null, 2)], { type: 'application/json' });
  }
}
