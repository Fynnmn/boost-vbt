// ─── SESIÓN EN VIVO: Dynamic Island + pantalla bloqueada ──────────────
// Manda el estado a la Live Activity (ios-native/VeloLiveActivity). Solo iPhone, iOS 16.2+.
import { isNative, VeloNative } from './core.js';
import { sensor } from './sensor.js';

let cur = null;
const push = () => { if (cur && isNative()) VeloNative.liveUpdate(cur).catch(() => {}); };

export const live = {
  start({ exercise, load, cut, sets, setNo = 1 }) {
    cur = { exercise, load, cut, sets, setNo, v: 0, rep: 0, loss: 0, bars: [], rest: 0, nextLoad: 0 };
    sensor.setContext({ exercise, load });
    if (!isNative()) return;
    VeloNative.keepAwake({ on: true }).catch(() => {});
    VeloNative.liveStart(cur).catch(() => {});
  },
  // En cada rep: { v, rep, loss, bars, setNo, load, cut }. Al terminar la serie: { rest, nextLoad }.
  update(p) {
    if (!cur) return;
    Object.assign(cur, p);
    // La próxima serie arranca con la carga recomendada: el sensor la guarda en su log.
    if (p.nextLoad || p.load) sensor.setContext({ exercise: cur.exercise, load: p.nextLoad || p.load });
    if (p.rest == null) cur.rest = 0;
    push();
  },
  end() {
    cur = null;
    if (!isNative()) return;
    VeloNative.keepAwake({ on: false }).catch(() => {});
    VeloNative.liveEnd().catch(() => {});
  }
};
