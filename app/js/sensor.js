/* ============================================================
   sensor.js — la capa que la interfaz usa.

   Toma un transporte (SimSensor o BleSensor), parsea los bytes con
   protocol.js y emite eventos ya en unidades humanas: m/s, metros,
   kilos. Arriba de esto nadie vuelve a ver un byte.

   También junta las repeticiones de la serie en curso. El firmware
   manda una notificación por rep y un resumen al final, pero el
   resumen NO trae las reps — son 20 bytes. Quien tiene la lista
   completa es la app, y por eso la guarda acá.
   ============================================================ */

import {
  parseRepResult, parseSetSummary, parseStatus,
  encodeSetStart, encodeSimple, encodeSetTime, OP,
  encodeConfigWrite, encodeConfigReadRequest,
  encodeLogDump, parseLogBatch, SESION_ABIERTA,
} from './protocol.js';
import { PARAM_POR_NOMBRE } from './params.js';

export class Sensor extends EventTarget {
  constructor(transport) {
    super();
    this.t = transport;
    this.status = null;
    this.reps = [];          // reps de la serie en curso
    this.currentSet = null;  // { exerciseId, loadKg, startedAt }
    this._volcado = null;    // descarga del log en curso, si la hay

    transport.addEventListener('connection', (e) => {
      if (!e.detail.connected) {
        this.reps = [];
        this.currentSet = null;
        /* Una descarga en curso muere acá y no cuando venza el reloj: son
           veinte segundos de pantalla cargando por algo que ya se sabe. */
        this._volcado?.cortar?.('Se perdió la conexión durante la descarga.');
      }
      this._emit('connection', e.detail);
    });

    transport.addEventListener('bytes', (e) => this._onBytes(e.detail));
  }

  get connected() { return this.t.connected; }
  get simulated() { return this.t.simulated; }
  get name() { return this.t.name; }

  async connect() {
    await this.t.connect();
    /* Sincronizar el reloj apenas conecta: es lo que permite etiquetar
       las sesiones del log interno con una fecha real. */
    try { await this.t.write(encodeSetTime(Math.floor(Date.now() / 1000))); }
    catch { /* si falla no importa: no bloquea entrenar */ }
    return this;
  }

  disconnect() { return this.t.disconnect(); }

  async startSet(exerciseId, loadKg) {
    this.reps = [];
    this.currentSet = { exerciseId, loadKg, startedAt: Date.now() };
    await this.t.write(encodeSetStart(exerciseId, loadKg));
    this._emit('setstart', this.currentSet);
  }

  async stopSet() {
    await this.t.write(encodeSimple(OP.SET_STOP));
  }

  async sleep() {
    await this.t.write(encodeSimple(OP.SLEEP));
  }

  /* --- Ajustes del sensor ------------------------------------

     Los rangos se comprueban acá ADEMÁS de en el firmware. No es
     redundante: acá sirve para dar un mensaje que se entienda antes de
     gastar un viaje BLE, y allá es el control de verdad, porque cualquiera
     puede escribir bytes arbitrarios sin pasar por esta app. */

  /** Lee un parámetro por nombre. Devuelve el número crudo del protocolo. */
  async leerAjuste(nombre) {
    const spec = PARAM_POR_NOMBRE.get(nombre);
    if (!spec) throw new Error(`parámetro desconocido: ${nombre}`);

    const resp = await this.t.readConfig(encodeConfigReadRequest(spec.id));
    const d = new DataView(resp.buffer ?? resp);
    /* Que la respuesta sea del parámetro que se pidió: si dos lecturas se
       pisan, el valor llega bien formado pero es de otro ajuste, y se
       mostraría como si fuera el correcto. */
    if (d.getUint8(1) !== spec.id) {
      throw new Error('el sensor respondió otro parámetro');
    }
    return d.getUint32(4, true);
  }

  /** Escribe un parámetro. Lanza con un mensaje legible si no se puede. */
  async escribirAjuste(nombre, valor) {
    const spec = PARAM_POR_NOMBRE.get(nombre);
    if (!spec) throw new Error(`parámetro desconocido: ${nombre}`);
    if (!spec.escribible) throw new Error('Este ajuste no se puede cambiar.');
    if (!Number.isFinite(valor)) throw new Error('Valor inválido.');

    const v = Math.round(valor);
    if (v < spec.min || v > spec.max) {
      throw new Error(`Tiene que estar entre ${spec.min} y ${spec.max}.`);
    }

    try {
      await this.t.writeConfig(encodeConfigWrite(spec.id, spec.tipo, v));
    } catch (err) {
      /* El firmware rechaza devolviendo un error GATT, y el navegador lo
         entrega como "GATT operation failed for unknown reason" o parecido.
         Mostrar eso tal cual no le dice nada a nadie: el motivo casi siempre
         es que el valor deja una ventana vacía contra su par mínimo/máximo,
         que es lo único que la app no puede comprobar sola. */
      const crudo = String(err?.message || '');
      if (/GATT|unknown reason|NotSupported/i.test(crudo)) {
        throw new Error('El sensor rechazó el valor. Suele ser porque queda ' +
          'cruzado con su par (un mínimo por encima del máximo).');
      }
      throw err;
    }
    return v;
  }

  /**
   * Todos los de una lista, en serie.
   *
   * `alLlegar` se llama con cada valor apenas se recibe. Leer 22 parámetros
   * por BLE es más de un segundo, y sin ir pintando la pantalla queda llena
   * de guiones como si se hubiera colgado.
   */
  async leerAjustes(nombres, alLlegar) {
    const out = new Map();
    for (const n of nombres) {
      /* En serie y no en paralelo a propósito: leer es escribir-y-después-leer,
         y dos lecturas simultáneas sobre la misma característica se pisan. */
      let v = null;
      try {
        v = await this.leerAjuste(n);
      } catch {
        v = null;           // se marca como desconocido, no se inventa un cero
      }
      out.set(n, v);
      alLlegar?.(n, v);
    }
    return out;
  }

  /* --- Volcado del log interno --------------------------------

     El sensor manda todo por notificaciones y no hay forma de pedir "el
     lote 7 de nuevo": lo que se pierde, se perdió. Por eso se cuentan los
     `seq` y al final se compara el total contra el que declara el sensor.
     Un archivo corto que se presenta como completo envenena el dataset sin
     dejar rastro. */

  _recibirLote(data) {
    const v = this._volcado;
    if (!v) return;

    const lote = parseLogBatch(data);
    if (!lote) { v.malos++; return; }

    /* Los seq son consecutivos y arrancan donde arranquen: lo que importa
       es que no haya huecos, no el valor absoluto. */
    if (v.ultimoSeq != null) {
      const salto = (lote.seq - v.ultimoSeq) & 0xffff;
      if (salto !== 1) v.perdidos += Math.max(0, salto - 1);
    }
    v.ultimoSeq = lote.seq;

    if (lote.tipo === 'header') {
      if (v.modo === 'indice') {
        v.sesiones.push(lote.sesion);
      } else {
        v.header = lote.header;
        v.sesion = lote.sesion;
      }
      v.avisar?.(v);
      return;
    }

    if (lote.tipo === 'muestras') {
      v.trozos.push(lote.muestras);
      v.recibidas += lote.count;
      v.avisar?.(v);
      return;
    }

    // fin
    v.declarado = lote.total;
    v.terminar();
  }

  /** Borra el log entero. El sensor lo hace de a un sector, tarda. */
  async borrarLog() {
    if (this._volcado) throw new Error('Hay una descarga en curso.');
    await this.t.write(encodeSimple(OP.LOG_ERASE));
  }

  /** Enumera las sesiones grabadas en el sensor. */
  async listarSesiones({ timeoutMs = 8000 } = {}) {
    const v = await this._volcar(encodeSimple(OP.LOG_LIST), 'indice', null, timeoutMs);
    return v.sesiones;
  }

  /**
   * Descarga una sesión y devuelve un `.vbt` listo para guardar.
   *
   * `alAvanzar` recibe el progreso: un volcado son megabytes por BLE y sin
   * eso la pantalla queda muda varios minutos.
   */
  async descargarSesion(indice, { alAvanzar, timeoutMs = 20000 } = {}) {
    const v = await this._volcar(encodeLogDump(indice), 'sesion', alAvanzar, timeoutMs);

    if (!v.header) throw new Error('El sensor no mandó el encabezado de la sesión.');

    const completo = v.perdidos === 0 && v.malos === 0 &&
      v.recibidas === v.declarado &&
      v.declarado === v.sesion.muestras;

    /* El header viene tal cual del sensor y es exactamente el header de un
       `.vbt` (docs/DATASET.md), así que copiarlo es lo correcto... salvo en
       un campo. Si se perdió un lote, `sample_count` diría 2400 con 2381
       muestras adentro, y un archivo cuyo header no describe su propio
       contenido es una trampa: toda herramienta que lo lea confía en ese
       número. Se corrige a lo que de verdad hay, y cuántas dijo el sensor
       queda en el `.json` que acompaña. */
    const header = new Uint8Array(v.header);
    if (!completo) {
      new DataView(header.buffer).setUint32(12, v.recibidas, true);
    }

    const blob = new Blob([header, ...v.trozos], { type: 'application/octet-stream' });

    return {
      blob,
      sesion: v.sesion,
      recibidas: v.recibidas,
      declarado: v.declarado,
      perdidos: v.perdidos,
      malos: v.malos,
      completo,
    };
  }

  /** La metadata que acompaña al `.vbt`, igual que en el grabador de teléfono. */
  metadataDeVolcado(r, nota = '') {
    return new Blob([JSON.stringify({
      origen: 'sensor',
      origen_codigo: r.sesion.origen,
      ejercicio_id: r.sesion.exerciseId,
      carga_kg: r.sesion.loadKg,
      muestras: r.recibidas,
      odr_hz: r.sesion.odrHz,
      duracion_s: Math.round((r.recibidas / r.sesion.odrHz) * 10) / 10,
      fecha: new Date(r.sesion.t0Unix * 1000).toISOString(),
      descarga_completa: r.completo,
      /* Lo que el sensor dijo tener, para poder ver de un vistazo cuánto se
         perdió sin tener que abrir el binario. */
      muestras_declaradas_por_el_sensor: r.declarado,
      lotes_perdidos: r.perdidos,
      lotes_ilegibles: r.malos,
      nota,
      ...(r.completo ? {} : {
        advertencia: 'La descarga perdio lotes por BLE. El sample_count del ' +
          'header se corrigio a las muestras que de verdad estan en el archivo, ' +
          'asi que el .vbt es consistente, pero le FALTAN datos del medio. ' +
          'No usar para medir precision sin revisarlo.',
      }),
    }, null, 2)], { type: 'application/json' });
  }

  _volcar(comando, modo, alAvanzar, timeoutMs) {
    if (this._volcado) throw new Error('Ya hay una descarga en curso.');

    return new Promise((resolve, reject) => {
      let reloj = null;

      const limpiar = () => {
        clearTimeout(reloj);
        this._volcado = null;
      };

      const v = {
        modo,
        avisar: alAvanzar,
        header: null,
        sesion: null,
        sesiones: [],
        trozos: [],
        recibidas: 0,
        declarado: 0,
        perdidos: 0,
        malos: 0,
        ultimoSeq: null,
        terminar: () => { limpiar(); resolve(v); },
        cortar: (msg) => { limpiar(); reject(new Error(msg)); },
      };

      /* El sensor puede quedarse mudo: se desconectó, la flash falló, el
         volcado ni arrancó. Sin este reloj la promesa nunca se resuelve y la
         pantalla se queda cargando para siempre, que es como se ve un
         cuelgue. Se reinicia con cada lote: lo que no puede pasar es que
         deje de llegar nada, no que tarde. */
      const reiniciarReloj = () => {
        clearTimeout(reloj);
        reloj = setTimeout(() => {
          limpiar();
          reject(new Error('El sensor dejó de responder durante la descarga.'));
        }, timeoutMs);
      };
      v.reiniciar = reiniciarReloj;

      this._volcado = v;
      reiniciarReloj();

      this.t.write(comando).catch((err) => { limpiar(); reject(err); });
    });
  }

  _onBytes({ char, data }) {
    if (char === 'logdump') {
      this._volcado?.reiniciar();
      this._recibirLote(data);
      return;
    }
    if (char === 'status') {
      const s = parseStatus(data);
      if (!s) return;                       // versión desconocida: se descarta
      const prev = this.status;
      this.status = s;
      this._emit('status', s);
      if (!prev || prev.state !== s.state) this._emit('state', s);
      return;
    }

    if (char === 'rep') {
      const r = parseRepResult(data);
      if (!r) return;
      /* Las notificaciones BLE pueden llegar fuera de orden o repetidas.
         rep_index es 1-based dentro de la serie, así que sirve de clave:
         si ya tengo esa rep, la piso en vez de contarla dos veces. */
      const i = this.reps.findIndex((x) => x.repIndex === r.repIndex);
      if (i >= 0) this.reps[i] = r; else this.reps.push(r);
      this.reps.sort((a, b) => a.repIndex - b.repIndex);
      this._emit('rep', { rep: r, reps: this.reps });
      return;
    }

    if (char === 'set') {
      const s = parseSetSummary(data);
      if (!s) return;
      const full = {
        ...s,
        startedAt: this.currentSet?.startedAt ?? Date.now() - s.durationMs,
        reps: this.reps.slice(),
      };
      this.currentSet = null;
      this._emit('set', full);
    }
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
