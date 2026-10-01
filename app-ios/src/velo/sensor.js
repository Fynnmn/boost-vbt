// ─── SENSOR BLUETOOTH ─────────────────────────────────────────────────
// Habla el protocolo real del firmware (firmware/docs/PROTOCOL.md, esquema 1).
// El parseo no se copia: se importa de app/js/protocol.js, que es el espejo
// del firmware. Si cambia el protocolo, cambia ahí y esto se entera solo.
//
// Con SENSOR.enabled = false la sesión en vivo usa la simulación del prototipo.
//
// Estados (sensor.state()): 'off' sin sensor · 'connecting' · 'on' listo para medir
// · 'lost' se cortó. Nada se da por hecho: conectado es recién cuando terminaron las
// suscripciones, y una serie arranca recién cuando el sensor aceptó el comando.
import { BleClient } from '@capacitor-community/bluetooth-le';
import { isNative } from './core.js';
import {
  UUID, OP, STATE, EXERCISES, parseRepResult, parseStatus, encodeSetStart, encodeSimple, encodeSetTime
} from '../../../app/js/protocol.js';

export const SENSOR = { enabled: true };

// Nombre del ejercicio en el diseño → id del firmware. Lo que no está va como Genérico (0).
const exId = name => (EXERCISES.find(e => e.name.toLowerCase() === String(name || '').toLowerCase()) || { id: 0 }).id;
const stateId = name => Number(Object.keys(STATE).find(k => STATE[k] === name));

let ready = false, dev = null, state = 'off', onRep = null, onLost = null, ctx = null, lastStatus = null, statusWaiters = [];
const listeners = new Set();
const setState = s => { if (s === state) return; state = s; for (const f of listeners) try { f(s); } catch {} };
const init = async () => { if (!ready) { await BleClient.initialize(); ready = true; } };
const dv = u8 => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
// Control va con respuesta: arrancar y cerrar la serie no se pueden perder (igual que app/js/ble.js).
const send = u8 => {
  if (!dev) return Promise.reject(new Error('El sensor no está conectado.'));
  return BleClient.write(dev.id, UUID.vbtService, UUID.control, dv(u8));
};
const onStatus = v => {
  const s = parseStatus(v);
  if (!s) return;
  lastStatus = s;
  statusWaiters = statusWaiters.filter(w => !w(s));
};
// Espera un Status que cumpla `ok` (o null si no llega en `ms`).
const waitStatus = (ok, ms) => new Promise(res => {
  const t = setTimeout(() => { statusWaiters = statusWaiters.filter(w => w !== f); res(null); }, ms);
  const f = s => { if (!ok(s)) return false; clearTimeout(t); res(s); return true; };
  statusWaiters.push(f);
});

// Se cortó (sensor apagado, lejos, batería): se limpia todo lo viejo y, si había una
// serie en curso, se le avisa a la pantalla para que no siga "midiendo".
function lost() {
  dev = null; lastStatus = null;
  const cb = onLost; onRep = null; onLost = null;
  setState('lost');
  if (cb) try { cb(); } catch {}
}

export const sensor = {
  isReal: () => isNative() && SENSOR.enabled,

  // Pantalla de permisos → dispara el permiso de Bluetooth de iOS.
  async requestPermission() {
    if (!isNative()) return true;
    try { await init(); return await BleClient.isEnabled(); } catch { return false; }
  },

  // Busca sensores y devuelve { id, name, rssi, shortId, others }. Si está cerca el que ya
  // estaba emparejado en este teléfono, ese; si no, el de mejor señal. `others` = cuántos
  // más hay cerca: la pantalla muestra el ID para confirmar que es el tuyo (no el de otro atleta).
  // El firmware pone el servicio en el scan response y se anuncia como VBT-XXXX.
  async scan(timeoutMs = 20000) {
    await init();
    const saved = this.saved();
    return new Promise((resolve, reject) => {
      const seen = new Map();
      let done = false, settle = null;
      const finish = () => {
        if (done) return; done = true; clearTimeout(settle); clearTimeout(limit);
        BleClient.stopLEScan().catch(() => {});
        const all = [...seen.values()];
        if (!all.length) return reject(new Error('No se encontró el sensor'));
        const pick = all.find(d => saved && d.id === saved.id) || all.sort((a, b) => b.rssi - a.rssi)[0];
        resolve({ ...pick, others: all.length - 1 });
      };
      BleClient.requestLEScan({ services: [UUID.vbtService] }, r => {
        if (done) return;
        const name = r.device.name || r.localName || 'VBT';
        seen.set(r.device.deviceId, { id: r.device.deviceId, name, rssi: r.rssi, shortId: name.replace(/^VBT-/, '') });
        if (saved && r.device.deviceId === saved.id) return finish();
        // Después del primero, 2,5 s más para ver si hay otros cerca.
        if (!settle) settle = setTimeout(finish, 2500);
      }).catch(e => { done = true; clearTimeout(limit); reject(e); });
      const limit = setTimeout(finish, timeoutMs);
    });
  },

  // Conexión de todo o nada: si falla cualquier paso, se desconecta y no queda "conectado" a medias.
  async connect(d) {
    await init();
    setState('connecting');
    try {
      await BleClient.connect(d.id, () => { if (dev && dev.id === d.id) lost(); });
      await BleClient.startNotifications(d.id, UUID.vbtService, UUID.status, onStatus);
      await BleClient.startNotifications(d.id, UUID.vbtService, UUID.repResult, v => {
        const r = parseRepResult(v);
        // Velocidad media concéntrica, la misma que usa la PWA.
        if (r && onRep) onRep(r.meanConcVel, r);
      });
    } catch (e) {
      await BleClient.stopNotifications(d.id, UUID.vbtService, UUID.status).catch(() => {});
      await BleClient.stopNotifications(d.id, UUID.vbtService, UUID.repResult).catch(() => {});
      await BleClient.disconnect(d.id).catch(() => {});
      dev = null; lastStatus = null;
      setState('off');
      throw e;
    }
    dev = d;
    localStorage.setItem('velo.sensor', JSON.stringify({ id: d.id, name: d.name, shortId: d.shortId }));
    setState('on');
    // El reloj del sensor arranca en cero: sin esto los logs no tienen fecha.
    await send(encodeSetTime(Math.floor(Date.now() / 1000))).catch(() => {});
  },

  async reconnect() {
    if (!this.isReal() || dev || state === 'connecting') return !!dev;
    const saved = this.saved();
    if (!saved) return false;
    try { await this.connect(saved); return true; } catch { setState(saved ? 'lost' : 'off'); return false; }
  },

  // El firmware se calibra solo al arrancar cada serie (con la barra quieta): no hay
  // comando. Acá se prepara: sensor conectado y midiendo bien. No se promete una
  // calibración que no pasó; la confirmación real llega en cada serie (flag CALIBRATED).
  async calibrate() {
    if (!dev) throw new Error('El sensor no está conectado. Prendelo y acercalo al teléfono.');
    const s = lastStatus || await waitStatus(() => true, 3000);
    if (s && !s.flags.imuOk) throw new Error('El sensor avisa que no puede medir el movimiento. Apagalo y prendelo de nuevo.');
    if (s && s.stateName === 'ERROR') throw new Error('El sensor reporta un error: ' + s.errorText);
    return { ready: true, battery: s ? s.batteryPct : null };
  },

  // Estado del sensor (batería, firmware, calibrado). null si no llegó ninguno.
  status: () => lastStatus,
  state: () => state,
  onState(f) { listeners.add(f); return () => listeners.delete(f); },
  connected: () => !!dev,
  // El último sensor emparejado en este teléfono ({ id, name, shortId }) o null.
  saved() { try { return JSON.parse(localStorage.getItem('velo.sensor') || 'null'); } catch { return null; } },

  // Lo llama live.start() antes de la serie: el sensor necesita ejercicio y carga.
  setContext(c) { ctx = c; },

  // Arranca la serie y resuelve cuando el sensor la aceptó. Si no hay sensor, intenta
  // reconectar una vez; si el comando falla o el sensor contesta con error, rechaza
  // (la pantalla vuelve atrás y lo explica). cbLost: se cortó a mitad de la serie.
  async startSet(cb, cbLost) {
    if (!dev) await this.reconnect();
    if (!dev) throw new Error('El sensor no está conectado. Prendelo, acercalo al teléfono y tocá de nuevo.');
    const answer = waitStatus(s => [stateId('RECORDING'), stateId('CALIBRATING'), stateId('ERROR')].includes(s.state), 2500);
    onRep = cb; onLost = cbLost || null;
    try {
      await send(encodeSetStart(exId(ctx && ctx.exercise), (ctx && ctx.load) || 0));
    } catch (e) {
      onRep = null; onLost = null;
      console.warn('[VELO sensor]', e);
      throw new Error('El sensor no recibió la orden de empezar. Acercalo al teléfono y probá de nuevo.');
    }
    // El comando va con respuesta (el sensor lo recibió). Si además manda su estado, se mira:
    // un ERROR no deja arrancar. Si no manda nada en 2,5 s, alcanza con la respuesta.
    const s = await answer;
    if (s && s.stateName === 'ERROR') { onRep = null; onLost = null; throw new Error('El sensor no pudo empezar: ' + s.errorText); }
    return { calibrating: !!s && s.stateName === 'CALIBRATING' };
  },
  stopSet() {
    if (!onRep) return;
    onRep = null; onLost = null;
    send(encodeSimple(OP.SET_STOP)).catch(() => {});
  },

  async forget() {
    const id = dev && dev.id;
    dev = null; lastStatus = null; onRep = null; onLost = null; localStorage.removeItem('velo.sensor');
    if (id) await BleClient.disconnect(id).catch(() => {});
    setState('off');
  }
};
