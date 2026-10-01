// Deslizar sobre algo que flota encima de una lista mueve la lista igual.
// Caso real: en Nova, la caja de escribir ("Preguntale a Nova…" + sugerencias) está
// encima del tercio de abajo del chat; si el dedo arrancaba ahí, el gesto se lo quedaba
// la caja (que no tiene scroll) y el chat no bajaba. Si lo que tocás ya tiene scroll
// propio, no se hace nada: lo maneja el navegador como siempre.
const canScroll = el => {
  const o = getComputedStyle(el).overflowY;
  return (o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight + 1;
};
// La pantalla está escalada con zoom (native.css): el dedo se mide en px de la página.
const scale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--velo-s')) || 1;

export function initTouchScroll() {
  let g = null, raf = 0;
  addEventListener('touchstart', e => {
    cancelAnimationFrame(raf); g = null;
    if (e.touches.length !== 1) return;
    for (let p = e.target; p && p !== document.body; p = p.parentElement) if (canScroll(p)) return;
    const t = e.touches[0];
    const el = document.elementsFromPoint(t.clientX, t.clientY).find(canScroll);
    if (el) g = { el, x: t.clientX, y: t.clientY, top: el.scrollTop, on: false, last: t.clientY, at: performance.now(), v: 0 };
  }, { passive: true, capture: true });

  addEventListener('touchmove', e => {
    if (!g) return;
    const t = e.touches[0], dy = t.clientY - g.y, dx = t.clientX - g.x;
    if (!g.on) { if (Math.abs(dy) < 6 || Math.abs(dy) < Math.abs(dx)) return; g.on = true; }
    const now = performance.now(), s = scale();
    g.v = 0.8 * g.v + 0.2 * ((t.clientY - g.last) / Math.max(1, now - g.at)) / s; // px/ms
    g.last = t.clientY; g.at = now;
    g.el.scrollTop = g.top - dy / s;
  }, { passive: true, capture: true });

  addEventListener('touchend', () => {
    if (!g || !g.on) { g = null; return; }
    // Inercia, como el scroll normal del iPhone.
    const el = g.el; let v = g.v, prev = performance.now(); g = null;
    const step = now => {
      const dt = now - prev; prev = now;
      el.scrollTop -= v * dt; v *= Math.pow(0.995, dt);
      if (Math.abs(v) > 0.02) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }, { capture: true });
}
