// ─── FIREBASE ─────────────────────────────────────────────────────────
// Cuentas (Auth) y datos (Firestore) del proyecto `boost-app`.
// Es un proyecto aparte del de la landing (`boost-vbt-landing`): no se mezclan
// reglas, cuotas ni la lista de espera con los datos de los atletas.
//
// Con FIREBASE.apiKey = null todo queda simulado, igual que antes: sirve para
// ver el diseño en el navegador sin tocar la nube.
// La config de Firebase es pública por diseño; lo que protege los datos son
// las reglas de backend/firestore.rules.
import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, browserPopupRedirectResolver, connectAuthEmulator } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { initializeFirestore, persistentLocalCache, connectFirestoreEmulator } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider, getToken } from 'firebase/app-check';

export const FIREBASE = {
  apiKey: 'AIzaSyBmgkmoVJRNUCFuO8paT9DWGQ7Oxttv-4s',
  authDomain: 'boost-vbt-app.firebaseapp.com',
  projectId: 'boost-vbt-app',
  appId: '1:227856547235:web:08ffa7a0436839f1016e16',
  // Servidor propio (Cloudflare Worker, backend/worker): Nova y borrar la cuenta.
  api: 'https://api.getboost.fit',
  // App Check en la web: clave de SITIO de reCAPTCHA v3 (es pública). Con null no se usa.
  // En el iPhone va App Attest (cuando haya cuenta de Apple Developer).
  recaptchaSiteKey: null,
  // Para probar contra los emuladores locales (npm run emu en backend/):
  // abrir http://localhost:5173/?emu, o localStorage['velo.emu'] = '1'.
  // Solo en http://localhost: en el iPhone el origen es capacitor://localhost y no entra.
  emulator: typeof location !== 'undefined' && location.protocol === 'http:' && location.hostname === 'localhost'
    && (/[?&]emu\b/.test(location.search) || localStorage.getItem('velo.emu') === '1')
};

// El link demo (window.VELO_DEMO) nunca se conecta, aunque haya claves cargadas.
export const enabled = () => typeof window !== 'undefined' && !window.VELO_DEMO && (!!FIREBASE.apiKey || FIREBASE.emulator);

let fb = null;
export function firebase() {
  if (fb) return fb;
  // En la web (app.getboost.fit) la ventana de Google sale de nuestro propio dominio:
  // functions/__/auth la reenvía a firebaseapp.com. Con otro dominio, Brave y Safari
  // bloquean el almacenamiento entre sitios y la ventana queda cargando.
  const webDomain = !Capacitor.isNativePlatform() && location.protocol === 'https:' ? location.host : null;
  const app = initializeApp(FIREBASE.emulator ? { apiKey: 'demo', projectId: 'demo-boost', appId: 'demo' }
    : { ...FIREBASE, authDomain: webDomain || FIREBASE.authDomain });
  // initializeAuth y no getAuth: getAuth arrastra el manejo de popups, que dentro
  // del WebView de Capacitor no existe y rompe el arranque.
  // En el navegador (beta web) sí se suma, para el ingreso con Google por ventana.
  const auth = initializeAuth(app, { persistence: indexedDBLocalPersistence,
    ...(Capacitor.isNativePlatform() ? {} : { popupRedirectResolver: browserPopupRedirectResolver }) });
  // Caché persistente: en el gimnasio la señal es mala. Las escrituras quedan en
  // cola en el teléfono y suben solas cuando vuelve la conexión.
  const db = initializeFirestore(app, { localCache: persistentLocalCache() });
  if (FIREBASE.emulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  // App Check: el Worker puede exigir que el pedido venga de esta app y no de un script.
  let appCheck = null;
  if (!FIREBASE.emulator && !Capacitor.isNativePlatform() && FIREBASE.recaptchaSiteKey) {
    try { appCheck = initializeAppCheck(app, { provider: new ReCaptchaV3Provider(FIREBASE.recaptchaSiteKey), isTokenAutoRefreshEnabled: true }); }
    catch (e) { console.warn('[VELO appcheck]', e); }
  }
  return (fb = { app, auth, db, appCheck });
}

// Llamada autenticada al Worker.
// Si falla, el Error trae status y code (ej. 403 'verify' = falta confirmar el email).
// fresh = pedir un token nuevo (después de confirmar el email, el viejo no lo sabe).
export async function api(path, { method = 'POST', body, fresh = false } = {}) {
  if (!FIREBASE.api) throw new Error('Sin servidor configurado');
  const { auth, appCheck } = firebase();
  const u = auth.currentUser;
  if (!u) throw new Error('Sin sesión');
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await u.getIdToken(fresh)) };
  if (appCheck) { try { headers['X-Firebase-AppCheck'] = (await getToken(appCheck, false)).token; } catch (e) { console.warn('[VELO appcheck]', e); } }
  const res = await fetch(FIREBASE.api + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw Object.assign(new Error(path + ' ' + res.status), { status: res.status, code: j.code });
  }
  return res.status === 204 ? null : res.json();
}
