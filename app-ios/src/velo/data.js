// ─── DATOS ────────────────────────────────────────────────────────────
// Perfil, series medidas, soporte y exportación.
//
// Primero el teléfono, después la nube. Todo se guarda al instante en
// Preferences (la app lee de ahí) y además se escribe en Firestore, que lo
// deja en cola si no hay señal y lo sube cuando vuelve. Al ingresar en un
// teléfono nuevo, loadProfile() baja el perfil y el historial.
//
// Firestore (reglas en backend/firestore.rules):
//   users/{uid}                perfil
//   users/{uid}/sets/{setId}   una serie medida
//   support/{id}               mensajes de "Escribinos" (solo se crean)
import { doc, getDoc, setDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNative, wait } from './core.js';
import { firebase, enabled } from './firebase.js';
import { local, K } from './local.js';
import { LEGAL_V } from './legal.js';
import { sensor } from './sensor.js';

export const SUPPORT_EMAIL = 'boost.vbt@gmail.com';

// consentV / aiConsentV: versión de los términos (legal.js) que aceptó, y si dio permiso para Nova (IA).
const PROFILE_FIELDS = ['name', 'role', 'bw', 'hgt', 'age', 'goals', 'level', 'exs', 'custom', 'loads', 'week', 'unit', 'remind', 'consentV', 'aiConsentV', 'routine', 'routines'];
const pick = p => Object.fromEntries(PROFILE_FIELDS.filter(k => p[k] !== undefined).map(k => [k, p[k]]));

const uid = () => (enabled() && firebase().auth.currentUser) ? firebase().auth.currentUser.uid : null;
// La nube nunca bloquea la pantalla: si falla, queda la copia local.
const cloud = (what, fn) => { const id = uid(); if (id) fn(id).catch(e => console.warn('[VELO nube] ' + what, e)); };
// Id armado en el teléfono: si la misma serie se sube dos veces, pisa en vez de duplicar.
const setId = s => s.at + '-' + Math.random().toString(36).slice(2, 8);

export const data = {
  onChange: f => local.subscribe(f),

  // Copia local del perfil (sin red). Es de esta misma cuenta: al cerrar sesión se borra.
  cachedProfile: () => local.get(K.profile),

  // Perfil: { name, role, bw, hgt, age, goals, level, exs, custom, loads, week, unit, remind }
  async loadProfile() {
    const id = uid();
    if (id) {
      try {
        const { db } = firebase();
        const snap = await getDoc(doc(db, 'users', id));
        if (snap.exists()) {
          const p = pick(snap.data());
          await local.set(K.profile, p);
          await this.pullSets(id);
          return p;
        }
      } catch (e) { console.warn('[VELO nube] perfil', e); }
    }
    return local.get(K.profile);
  },

  async saveProfile(p) {
    // Guardar el perfil = terminó el registro, donde aceptó términos y datos de salud.
    // Se mezcla con la copia local: lo que no manda esta pantalla (ej. la rutina) no se pierde.
    const clean = { ...pick((await local.get(K.profile)) || {}), ...pick(p), consentV: LEGAL_V };
    await local.set(K.profile, clean);
    cloud('perfil', id => setDoc(doc(firebase().db, 'users', id), { ...clean, updatedAt: serverTimestamp() }, { merge: true }));
  },

  // Serie: { exercise, load, setNo, reps: [m/s…], at }
  async saveSet(s) {
    // Sin sensor de verdad (navegador), las reps son la simulación del prototipo: no se
    // guardan, si no ensucian el historial, la fatiga y lo que dice Nova.
    if (!sensor.isReal()) return;
    const row = { id: setId(s), exercise: String(s.exercise), load: +s.load || 0, setNo: +s.setNo || 1, reps: (s.reps || []).map(Number), at: +s.at || Date.now() };
    const all = (await local.get(K.sets)) || [];
    all.push(row);
    await local.set(K.sets, all);
    cloud('serie', id => setDoc(doc(firebase().db, 'users', id, 'sets', row.id), row));
  },

  async listSets() { return (await local.get(K.sets)) || []; },

  // Baja el historial de la nube y lo junta con el local (por id, sin duplicar).
  // Firestore cobra una lectura por documento: antes se bajaba TODO el historial cada vez
  // que se abría la app (un atleta con 2000 series = 2000 lecturas por apertura). Ahora
  // solo lo nuevo desde la última vez; todo de nuevo una vez por mes (por si subió
  // tarde, con fecha vieja, una serie hecha en otro teléfono sin señal).
  async pullSets(id = uid()) {
    if (!id) return;
    const mark = (await local.get(K.pulled)) || {};
    const now = Date.now(), full = mark.uid !== id || !mark.full || now - mark.full > 30 * 864e5;
    const col = collection(firebase().db, 'users', id, 'sets');
    const snap = await getDocs(full ? col : query(col, where('at', '>', (mark.at || 0) - 10 * 60e3)));
    const byId = new Map(((await local.get(K.sets)) || []).map(s => [s.id, s]));
    snap.forEach(d => byId.set(d.id, { ...d.data(), id: d.id }));
    await local.set(K.sets, [...byId.values()].sort((a, b) => a.at - b.at));
    await local.set(K.pulled, { uid: id, at: now, full: full ? now : mark.full });
  },

  async sendSupport({ topic, message, email }) {
    if (!enabled()) { await wait(300); return console.info('[VELO soporte]', { to: SUPPORT_EMAIL, topic, email, message }); }
    const u = firebase().auth.currentUser;
    if (!u) throw new Error('Iniciá sesión para escribirnos.');
    // Anti spam (backend/firestore.rules): hasta 3 mensajes por día, con id {uid}_{día}_{n},
    // y el email tiene que ser el de la cuenta; si escribió otro de contacto, va en el texto.
    const other = email && email.trim() !== u.email ? `\n\nContacto: ${String(email).trim().slice(0, 200)}` : '';
    // Lo que promete la pantalla: modelo del teléfono y versión del sensor, para ayudar más rápido.
    const st = sensor.status();
    const device = (navigator.userAgent.match(/\(([^)]+)\)/) || [])[1] || navigator.userAgent;
    const info = `\n\n— ${isNative() ? 'App iPhone' : 'Web'} · ${device.slice(0, 120)} · ${st ? 'sensor fw ' + st.fwVersion : 'sin sensor conectado'}`;
    const row = {
      uid: u.uid, ...(u.email ? { email: u.email } : {}),
      topic: String(topic || '').slice(0, 100), message: (String(message || '') + other + info).slice(0, 5000),
      createdAt: serverTimestamp()
    };
    // Si ya tocó el link del mail, la sesión vieja todavía dice "sin confirmar" (hasta 1 h):
    // se recarga el usuario y se pide un token nuevo antes de escribir.
    // Lo que mira la base es el token, no el usuario: puede decir "sin confirmar" aunque
    // el usuario ya lo esté (el token dura 1 h). Se revisa el token y se renueva si hace falta.
    if (!(await u.getIdTokenResult()).claims.email_verified && u.providerData.some(p => p.providerId === 'password')) {
      await u.reload().catch(() => {});
      if (u.emailVerified) await u.getIdToken(true);
    }
    const day = Math.floor(Date.now() / 864e5);
    for (let n = 1; n <= 3; n++) {
      try { return await setDoc(doc(firebase().db, 'support', `${u.uid}_${day}_${n}`), row); }
      catch (e) { if (e.code !== 'permission-denied') throw e; }
    }
    throw new Error(u.emailVerified || !u.providerData.some(p => p.providerId === 'password')
      ? `Por hoy ya nos mandaste 3 mensajes. Si es urgente: ${SUPPORT_EMAIL}`
      : 'Confirmá tu email (te mandamos un link) para poder escribirnos.');
  },

  // range: 0 último mes · 1 tres meses · 2 todo   format: 'csv' | 'json'
  async exportFile({ range, format }) {
    const days = [30, 90, 36500][range] ?? 30, from = Date.now() - days * 864e5;
    const rows = (await this.listSets()).filter(s => s.at >= from);
    const body = format === 'json'
      ? JSON.stringify(rows, null, 2)
      : 'fecha,ejercicio,serie,carga_kg,rep,velocidad_ms\n' + rows.flatMap(s => s.reps.map((v, i) => [new Date(s.at).toISOString(), s.exercise, s.setNo, s.load, i + 1, v].join(','))).join('\n');
    const name = 'boost-' + ['ultimo-mes', '3-meses', 'todo'][range] + '-' + new Date().toISOString().slice(0, 10) + '.' + format;
    // En el navegador (también Safari del iPhone): descarga el archivo.
    if (!isNative()) {
      const url = URL.createObjectURL(new Blob([body], { type: format === 'json' ? 'application/json' : 'text/csv' }));
      const link = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return;
    }
    const { uri } = await Filesystem.writeFile({ path: name, data: body, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ files: [uri] });
  }
};
