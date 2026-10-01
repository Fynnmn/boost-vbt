// ─── AUTH ─────────────────────────────────────────────────────────────
// Cuentas con Firebase Auth: email y contraseña, Apple y Google.
// Contrato con las pantallas: cada ingreso devuelve { id, email, name?, isNew }
// (isNew = true → onboarding) o lanza un Error con un mensaje en castellano,
// listo para mostrar.
//
// Sin Firebase configurado (FIREBASE.apiKey = null) queda la simulación de antes.
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification,
  signInWithCredential, signInWithPopup, OAuthProvider, GoogleAuthProvider, signOut, revokeAccessToken
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { isNative, VeloNative, wait } from './core.js';
import { firebase, enabled, api } from './firebase.js';
import { payments } from './payments.js';
import { local } from './local.js';

// Client ID de iOS de Google (consola de Google Cloud del proyecto boost-app).
export const GOOGLE = { iOSClientId: '227856547235-cedldjhue6st1ut57rcjp9bpttf2gt1b.apps.googleusercontent.com' }; // Firebase → app iOS "BOOST iOS" (no es secreto)

const MSG = {
  'auth/email-already-in-use': 'Ya hay una cuenta con ese email. Probá ingresar.',
  'auth/invalid-credential': 'Email o contraseña incorrectos.',
  'auth/wrong-password': 'Email o contraseña incorrectos.',
  'auth/user-not-found': 'Email o contraseña incorrectos.',
  'auth/invalid-email': 'Ese email no es válido.',
  'auth/weak-password': 'La contraseña tiene que tener al menos 8 caracteres.',
  'auth/too-many-requests': 'Demasiados intentos. Esperá unos minutos y probá de nuevo.',
  'auth/network-request-failed': 'Sin conexión. Probá de nuevo cuando tengas señal.',
  'auth/user-disabled': 'Esta cuenta está deshabilitada.',
  'auth/account-exists-with-different-credential': 'Ese email ya entra con otro método (Apple, Google o contraseña).',
  'auth/popup-blocked': 'El navegador bloqueó la ventana de Google. Permití las ventanas emergentes y probá de nuevo.',
  'auth/unauthorized-domain': 'Google todavía no está habilitado en esta página. Ingresá con email.',
  'apple/web': 'Apple solo funciona en la app de iPhone. Acá ingresá con email o Google.'
};
const fail = e => {
  const err = new Error(MSG[e && e.code] || 'No pudimos ingresar. Probá de nuevo.');
  err.code = e && e.code; err.cause = e;
  throw err;
};

// Cancelar el sheet de Apple o de Google no es un error: se devuelve null
// y la pantalla se queda donde estaba (afterAuth ignora null).
const cancelled = e => /cancel|popup-closed|1001|12501/i.test(String((e && (e.code || e.message)) || ''));

// Nuevo = todavía no terminó el onboarding (no hay perfil guardado).
// Se mira el perfil y no "cuenta recién creada" a propósito: el que creó la
// cuenta y cerró la app a mitad del onboarding lo tiene que retomar.
async function toUser(user, name) {
  const { db } = firebase();
  let isNew = true;
  try { isNew = !(await getDoc(doc(db, 'users', user.uid))).exists(); } catch {}
  await local.claim(user.uid);
  await payments.configure(user.uid);
  return { id: user.uid, email: user.email, name: name || user.displayName || null, isNew };
}

async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const nonce = () => [...crypto.getRandomValues(new Uint8Array(24))].map(x => x.toString(16).padStart(2, '0')).join('');

// Sheet nativo de Apple → credencial de Firebase. Devuelve también el
// authorizationCode, que hace falta para revocar el token al borrar la cuenta.
async function appleCredential() {
  const raw = nonce();
  const r = await VeloNative.signInWithApple({ nonce: await sha256(raw) });
  const cred = new OAuthProvider('apple.com').credential({ idToken: r.identityToken, rawNonce: raw });
  return { cred, code: r.authorizationCode, name: [r.givenName, r.familyName].filter(Boolean).join(' ') || null };
}

let googleReady = false;
async function googleCredential() {
  if (!googleReady) { await SocialLogin.initialize({ google: { iOSClientId: GOOGLE.iOSClientId } }); googleReady = true; }
  const { result } = await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
  if (!result || !result.idToken) throw new Error('Google no devolvió identidad');
  return { cred: GoogleAuthProvider.credential(result.idToken), name: result.profile && result.profile.name };
}

const mock = (email, isNew) => ({ id: 'mock-' + btoa(email).slice(0, 10), email, isNew });
const MOCK_KEY = 'velo.session';
const saveMock = u => { localStorage.setItem(MOCK_KEY, JSON.stringify(u)); return u; };

// Firebase restaura la sesión de forma asíncrona: hay que esperar el primer aviso.
const ready = () => new Promise(res => { const off = firebase().auth.onAuthStateChanged(u => { off(); res(u); }); });

export const auth = {
  async current() {
    if (!enabled()) { try { return JSON.parse(localStorage.getItem(MOCK_KEY) || 'null'); } catch { return null; } }
    const u = await ready();
    return u ? { id: u.uid, email: u.email, name: u.displayName } : null;
  },

  // JWT de Firebase para el Worker (Nova, borrar cuenta). Se renueva solo.
  async token() {
    if (!enabled()) return null;
    const u = firebase().auth.currentUser;
    return u ? u.getIdToken() : null;
  },

  async signUpEmail(email, password) {
    if (!enabled()) { await wait(600); return saveMock(mock(email, true)); }
    try {
      const { user } = await createUserWithEmailAndPassword(firebase().auth, email.trim(), password);
      // Mail para confirmar la cuenta: Nova y "Escribinos" lo piden (anti cuentas truchas).
      firebase().auth.languageCode = 'es-419';
      sendEmailVerification(user).catch(e => console.warn('[VELO auth] verificación', e));
      await local.claim(user.uid);
      await payments.configure(user.uid);
      return { id: user.uid, email: user.email, isNew: true };
    } catch (e) { fail(e); }
  },

  async signInEmail(email, password) {
    if (!enabled()) { await wait(600); return saveMock(mock(email, false)); }
    try { return await toUser((await signInWithEmailAndPassword(firebase().auth, email.trim(), password)).user); }
    catch (e) { fail(e); }
  },

  async resetPassword(email) {
    if (!enabled()) return wait(300);
    // No se avisa si el email no existe: sería decirle a cualquiera qué emails tienen cuenta.
    firebase().auth.languageCode = 'es-419';
    await sendPasswordResetEmail(firebase().auth, email.trim()).catch(e => { if (e.code === 'auth/network-request-failed') fail(e); });
  },

  async signInApple() {
    if (!enabled()) { await wait(400); return saveMock(mock('apple@demo', true)); }
    // En el navegador (beta web) no hay sheet de Apple: hace falta la app.
    if (!isNative()) fail({ code: 'apple/web' });
    try {
      const { cred, name } = await appleCredential();
      // Apple manda el nombre SOLO la primera vez: se devuelve para que el
      // onboarding lo proponga.
      return await toUser((await signInWithCredential(firebase().auth, cred)).user, name);
    } catch (e) { if (cancelled(e)) return null; fail(e); }
  },

  async signInGoogle() {
    if (!enabled()) { await wait(400); return saveMock(mock('google@demo', true)); }
    try {
      // En el navegador (beta web), la ventana de Google de Firebase.
      if (!isNative()) return await toUser((await signInWithPopup(firebase().auth, new GoogleAuthProvider())).user);
      const { cred, name } = await googleCredential();
      return await toUser((await signInWithCredential(firebase().auth, cred)).user, name);
    } catch (e) { if (cancelled(e)) return null; fail(e); }
  },

  async signOut() {
    await local.clear();
    await payments.logOut();
    if (!enabled()) return localStorage.removeItem(MOCK_KEY);
    if (isNative()) SocialLogin.logout({ provider: 'google' }).catch(() => {});
    await signOut(firebase().auth);
  },

  // App Store lo exige: borrar la cuenta y TODOS sus datos desde la app.
  // El borrado lo hace el servidor (backend/worker) y no el teléfono, porque
  // Firebase le pide al teléfono un ingreso reciente para borrar la cuenta y
  // la pantalla no tiene dónde volver a pedir la contraseña.
  // Si entró con Apple, además hay que revocar su token (regla 5.1.1(v)):
  // eso pide un código nuevo, así que aparece el sheet de Apple una vez más.
  async deleteAccount() {
    if (!enabled()) { await local.clear(); return localStorage.removeItem(MOCK_KEY); }
    const { auth: a } = firebase();
    const u = a.currentUser;
    if (!u) return;
    if (isNative() && u.providerData.some(p => p.providerId === 'apple.com')) {
      try { const { code } = await appleCredential(); if (code) await revokeAccessToken(a, code); }
      catch (e) { console.warn('[VELO auth] revocar Apple', e); }
    }
    await api('/account', { method: 'DELETE' });
    await local.clear();
    await payments.logOut();
    await signOut(a).catch(() => {});
  }
};
