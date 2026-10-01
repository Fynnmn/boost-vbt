// ─── VOZ (manos libres) ───────────────────────────────────────────────
// En el iPhone usa AVSpeechSynthesizer (VeloNativePlugin.swift): voz en español,
// sale por los auriculares y baja la música mientras habla (si "Bajar música" está activo).
import { isNative, VeloNative } from './core.js';

let seq = 0, bound = false;
const cbs = {};
function bind() {
  if (bound) return; bound = true;
  VeloNative.addListener('speechStart', e => { const c = cbs[e.id]; if (c && c.onstart) c.onstart(); });
  VeloNative.addListener('speechEnd', e => { const c = cbs[e.id]; delete cbs[e.id]; if (c && c.onend) c.onend(); });
}

export const voice = {
  isNative: () => isNative(),
  // rate del prototipo: 1 = normal (1,15 por defecto). AVSpeech: 0,5 = normal.
  speak(text, { queue = false, rate = 1.15, duck = true, onstart, onend } = {}) {
    bind();
    const id = String(++seq);
    cbs[id] = { onstart, onend };
    VeloNative.speak({ id, text, lang: 'es-419', queue, duck, rate: Math.max(0.3, Math.min(0.7, 0.5 * rate)) })
      .catch(() => { delete cbs[id]; if (onend) onend(); });
  },
  stop() { VeloNative.stopSpeaking().catch(() => {}); }
};
