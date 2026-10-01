/* ============================================================
   ble.js — transporte Web Bluetooth contra el sensor real.

   Expone la MISMA interfaz que SimSensor (connect / disconnect /
   write, y eventos 'connection' y 'bytes'), así que el resto de la
   app no sabe ni le importa cuál de los dos está enchufado.

   Los eventos 'bytes' llevan bytes crudos, sin parsear, igual que el
   simulador. El parseo pasa una sola vez, en sensor.js, con el mismo
   código en los dos caminos.

   LÍMITES DE LA PLATAFORMA — no son bugs de la app:
   · Web Bluetooth existe en Chrome/Edge de Android, Windows, macOS y
     Linux. NO existe en Safari ni en ningún navegador de iOS.
   · Requiere HTTPS (o localhost) y un gesto del usuario para abrir el
     selector de dispositivos. No se puede reconectar solo al cargar.
   ============================================================ */

import { UUID } from './protocol.js';

export const bleSupported = () =>
  typeof navigator !== 'undefined' && !!navigator.bluetooth;

export class BleSensor extends EventTarget {
  constructor() {
    super();
    this.simulated = false;
    this.connected = false;
    this.name = null;
    this._device = null;
    this._chars = {};
    this._onDisconnect = this._onDisconnect.bind(this);
  }

  async connect() {
    if (!bleSupported()) {
      throw new Error(
        'Este navegador no tiene Web Bluetooth. Usá Chrome en Android, Windows o Mac.'
      );
    }

    /* Dos filtros: por servicio (el firmware pone el UUID en el scan
       response justamente para esto) y por prefijo de nombre, como red
       si la placa quedó anunciando sin scan response. Sin filtros, el
       usuario vería todos los auriculares del gimnasio. */
    this._device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [UUID.vbtService] }, { namePrefix: 'VBT-' }],
      optionalServices: [UUID.vbtService, UUID.battery, UUID.deviceInfo],
    });

    this.name = this._device.name || 'VBT';
    this._device.addEventListener('gattserverdisconnected', this._onDisconnect);

    const server = await this._device.gatt.connect();
    const svc = await server.getPrimaryService(UUID.vbtService);

    this._chars.control = await svc.getCharacteristic(UUID.control);
    this._chars.config  = await svc.getCharacteristic(UUID.config);

    await this._subscribe(svc, UUID.status,     'status');
    await this._subscribe(svc, UUID.repResult,  'rep');
    await this._subscribe(svc, UUID.setSummary, 'set');
    /* El volcado del log interno. Se suscribe siempre y no sólo al pedirlo:
       suscribirse es una escritura al descriptor y tarda, y si se hiciera
       recién al mandar LOG_DUMP los primeros lotes llegarían antes de que
       nadie esté escuchando — el header entre ellos, que es el que no se
       puede perder. */
    await this._subscribe(svc, UUID.logDump, 'logdump');

    this.connected = true;
    this._emit('connection', { connected: true, name: this.name, simulated: false });
    return this;
  }

  async _subscribe(svc, uuid, tag) {
    const ch = await svc.getCharacteristic(uuid);
    ch.addEventListener('characteristicvaluechanged', (ev) => {
      this._emit('bytes', { char: tag, data: ev.target.value });
    });
    await ch.startNotifications();
    this._chars[tag] = ch;
  }

  async write(bytes) {
    if (!this._chars.control) throw new Error('Sensor no conectado');
    /* WithoutResponse es más rápido pero no confirma. Control lleva
       comandos que no se pueden perder (arrancar y cerrar la serie),
       así que va con respuesta. */
    await this._chars.control.writeValueWithResponse(bytes);
  }

  async writeConfig(bytes) {
    if (!this._chars.config) throw new Error('Sensor no conectado');
    await this._chars.config.writeValueWithResponse(bytes);
  }

  /* Leer un parámetro son DOS operaciones: se escribe el param_id con el tipo
     especial de lectura y recién después se lee la característica, que para
     entonces tiene el valor. Va junto en un método porque separarlo invita a
     que dos lecturas se pisen: la segunda escritura llegaría antes de que la
     primera terminara de leer y devolvería el parámetro equivocado. */
  async readConfig(bytesPedido) {
    if (!this._chars.config) throw new Error('Sensor no conectado');
    await this._chars.config.writeValueWithResponse(bytesPedido);
    const v = await this._chars.config.readValue();
    return new Uint8Array(v.buffer.slice(0));
  }

  async disconnect() {
    if (this._device?.gatt?.connected) this._device.gatt.disconnect();
    else this._onDisconnect();
  }

  _onDisconnect() {
    this.connected = false;
    this._emit('connection', { connected: false, simulated: false });
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
