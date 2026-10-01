// ─── NOVA (IA) ────────────────────────────────────────────────────────
// La clave de la IA NUNCA va en la app: la app llama al Worker
// (backend/worker, POST /nova/ask) con el token de Firebase, y el Worker
// verifica que el usuario tenga Pro o Élite antes de llamar a Claude.
// Sin servidor configurado (FIREBASE.api = null) responde con los textos del prototipo.
import { wait } from './core.js';
import { sendEmailVerification } from 'firebase/auth';
import { FIREBASE, api, firebase } from './firebase.js';

const OFFLINE = 'No pude conectarme. Probá de nuevo en un rato.';
let verifySent = false; // un mail de confirmación por sesión, no uno por mensaje

export const nova = {
  // Devuelve { text, k }  (k = chip opcional debajo del mensaje, ej. '100 kg · serie 1')
  // edit = cuántas preguntas se borraron del final al editar una (el servidor recorta su copia).
  async ask(question, { fallback, k, history, edit = 0 } = {}) {
    if (!FIREBASE.api) { await wait(300); return { text: fallback || '', k }; }
    try {
      // El Worker usa su propia copia del chat; de esto solo mira si la conversación es nueva.
      const h = (history || []).slice(-20).map(m => ({ me: m.from === 'me', t: String(m.t || '') }));
      const send = fresh => api('/nova/ask', { fresh, body: { question, history: h, edit } });
      let j;
      try { j = await send(false); }
      catch (e) {
        if (e.code !== 'verify') throw e;
        // ¿Ya tocó el link del mail? Firebase recién se entera al recargar el usuario.
        const u = firebase().auth.currentUser;
        await u.reload().catch(() => {});
        if (!u.emailVerified) {
          if (!verifySent) { verifySent = true; firebase().auth.languageCode = 'es-419'; sendEmailVerification(u).catch(() => {}); }
          return { text: `Antes de arrancar, confirmá tu email: te mandé un link a ${u.email}. Tocalo y volvé a escribirme.` };
        }
        j = await send(true);
      }
      return { text: j.text, k: j.chip || undefined };
    } catch (e) {
      console.warn('[VELO nova]', e);
      if (e && e.status === 429) return { text: 'Vamos más despacio: esperá un minuto y seguimos.' };
      if (e && e.message === 'Sin sesión') return { text: 'Para hablar conmigo necesitás una cuenta. Cerrá sesión en Perfil y creá una con tu email.' };
      return { text: OFFLINE };
    }
  },

  // Rutina nueva: Nova revisa la que armaron las reglas y explica el porqué (texto o null).
  // Sin servidor o sin conexión, null: la rutina igual se guarda con la explicación de las reglas.
  async routine(plan) {
    if (!FIREBASE.api) return null;
    try { const j = await api('/nova/routine', { body: { plan } }); return (j && j.text) || null; }
    catch (e) { console.warn('[VELO nova rutina]', e); return null; }
  }
};
