// ─── NOTIFICACIONES ───────────────────────────────────────────────────
// Locales (sin servidor). Para avisos de Nova / resumen semanal desde el servidor
// agregá @capacitor/push-notifications y el capability Push en el Bundle ID.
import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';
import { isNative } from './core.js';

const REST_ID = 9001;
let restEnd = 0, bound = false;

function bind() {
  if (bound || !isNative()) return; bound = true;
  // El temporizador de descanso de la pantalla sigue mandando; la notificación
  // solo aparece si saliste de la app o bloqueaste el teléfono.
  App.addListener('appStateChange', async ({ isActive }) => {
    if (isActive) return LocalNotifications.cancel({ notifications: [{ id: REST_ID }] }).catch(() => {});
    if (restEnd > Date.now() + 1000) await LocalNotifications.schedule({ notifications: [{
      id: REST_ID, title: 'Descanso terminado', body: 'Arrancá la próxima serie.', schedule: { at: new Date(restEnd) }
    }] }).catch(() => {});
  });
}

export const notify = {
  async requestPermission() {
    if (!isNative()) return true;
    const r = await LocalNotifications.requestPermissions();
    return r.display === 'granted';
  },
  restDone(seconds) { bind(); restEnd = Date.now() + seconds * 1000; }
};
