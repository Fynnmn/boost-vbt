// Copia local en el teléfono (Preferences). Es lo que lee la app primero:
// el historial y el perfil tienen que estar aunque no haya señal.
import { Preferences } from '@capacitor/preferences';

export const K = { profile: 'velo.profile', sets: 'velo.sets', owner: 'velo.owner', pulled: 'velo.pulled' };

const subs = new Set();
const notify = () => subs.forEach(f => { try { f(); } catch (e) { console.warn(e); } });

export const local = {
  // real.js se suscribe para redibujar cuando cambian las series.
  subscribe(f) { subs.add(f); return () => subs.delete(f); },
  async get(k) {
    const { value } = await Preferences.get({ key: k });
    try { return value ? JSON.parse(value) : null; } catch { return null; }
  },
  async set(k, v) { await Preferences.set({ key: k, value: JSON.stringify(v) }); if (k === K.sets) notify(); },
  // La copia local es de una sola cuenta: si entra otra en este teléfono (sin haber
  // cerrado sesión antes), se borra lo del anterior antes de mostrar nada.
  async claim(uid) {
    if (!uid) return;
    // Marca para el skeleton de arranque (index.js): hay sesión en este teléfono.
    try { localStorage.setItem('velo.hadSession', '1'); } catch {}
    const prev = await this.get(K.owner);
    if (prev && prev !== uid) await this.clear();
    if (prev !== uid) await this.set(K.owner, uid);
  },
  // Al cerrar sesión o borrar la cuenta: el que entre después en este
  // teléfono no puede ver el historial del anterior.
  async clear() {
    await Promise.all(Object.values(K).map(key => Preferences.remove({ key })));
    localStorage.removeItem('velo.sensor');
    localStorage.removeItem('velo.hadSession');
    notify();
  }
};
