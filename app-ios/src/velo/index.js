// Capa nativa de VELO. Las pantallas (design/VELOPhone.dc.html) llaman a window.VELO.*
// Si window.VELO no existe (prototipo en el navegador), las pantallas usan su simulación.
import { initShell, isNative, native } from './core.js';
import { auth } from './auth.js';
import { data } from './data.js';
import { payments } from './payments.js';
import { nova } from './nova.js';
import { sensor } from './sensor.js';
import { voice } from './voice.js';
import { notify } from './notify.js';
import { live } from './live.js';
import { real } from './real.js';
import { haptics } from './haptics.js';
import { initTouchScroll } from './touchscroll.js';
import { local } from './local.js';
import { chipAction } from './action.js';
import * as routine from './routine.js';

initShell();
initTouchScroll();
// En la web no hay "Continuar con Apple": Apple lo habilita solo con la cuenta paga de
// Apple Developer. Se esconde el botón (native.css) y Google ocupa todo el ancho.
if (!isNative()) document.documentElement.classList.add('velo-web');

// Skeleton de arranque: si en este teléfono ya había una sesión, mientras Firebase la
// restaura se ve la silueta de Inicio en vez de la bienvenida (parecía que había que
// registrarse de nuevo). Tope de 8 s por si algo se cuelga: ahí aparece la bienvenida.
const SESSION_HINT = 'velo.hadSession';
let hint = false;
try { hint = !!localStorage.getItem(SESSION_HINT); } catch {}
window.__veloBooting = hint;
const bootDone = app => { if (!window.__veloBooting) return; window.__veloBooting = false; app.setState({}); };

// Cada vez que se carga el perfil de la cuenta (arranque o ingreso), las
// pantallas recalculan el plan del día y el saludo de Nova con los datos nuevos.
const loadProfile = data.loadProfile.bind(data);
data.loadProfile = async () => {
  const p = await loadProfile();
  // El diseño hace setState(p) apenas vuelve esta promesa; el plan se arma después.
  setTimeout(() => real.profileLoaded(p || {}), 0);
  return p;
};

// Pantalla nueva → barra de estado (core.js) y datos reales (real.js).
const onScreen = native.onScreen.bind(native);
native.onScreen = s => { onScreen(s); real.onScreen(s); };

// Se llama una vez cuando la app montó (componentDidMount).
async function boot(app) {
  const cap = setTimeout(() => bootDone(app), 8000);
  try {
    await real.attach(app);
    const u = await auth.current();
    // Con sesión, se sale de la bienvenida (o del login, si tocó "Ingresar" mientras cargaba).
    const leave = to => { if (['welcome', 'auth'].includes(app.state.screen)) app.go(to); };
    if (u) {
      await local.claim(u.id);
      // Primero la copia del teléfono: entra al instante aunque no haya señal. Antes se
      // esperaba a bajar perfil y series de la nube, y con señal lenta la bienvenida
      // quedaba varios segundos: parecía que había que registrarse de nuevo.
      const cached = await data.cachedProfile();
      if (cached) { app.setState(cached); leave('home'); setTimeout(() => real.profileLoaded(cached), 0); }
      const p = await data.loadProfile();
      if (p) app.setState(p);
      // Con cuenta pero sin perfil = dejó el onboarding por la mitad: lo retoma.
      if (!cached && p) leave('home');
      else if (!cached) {
        // A mitad del registro: se retoma el borrador (si Safari recargó la pestaña).
        const d = real.draft(u.id);
        if (d) { app.setState(d.p); leave(d.screen); } else leave('name');
      }
    } else { try { localStorage.removeItem(SESSION_HINT); } catch {} }
    clearTimeout(cap); bootDone(app);
    await payments.configure(u && u.id);
    const st = await payments.status();
    if (st && st.active) app.setState({ pro: true, plan: st.plan });
    sensor.reconnect();
  } catch (e) { console.warn('[VELO boot]', e); }
  clearTimeout(cap); bootDone(app);
}

window.VELO = { isNative, native, boot, auth, data, payments, nova, sensor, voice, notify, live, real, haptics, chipAction, routine };
