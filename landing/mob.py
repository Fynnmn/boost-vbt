"""QA mobile de la landing BOOST.

Uso:
  python mob.py shots            capturas full-page por ancho
  python mob.py sec <#id>        capturas de una seccion por ancho
  python mob.py overflow         detector REAL de desborde (sin overflow-x:clip)
  python mob.py alturas          alto real de cada seccion a 390px
  python mob.py hero             el hero muestra producto (no negro liso)

Detalle importante: `overflow` quita el `overflow-x: clip` del body antes de
medir. Con el clip puesto cualquier desborde queda invisible y el chequeo da
falso negativo -es exactamente por eso que el desborde del titular a 320px
nunca habia aparecido-.
"""
import sys, asyncio
from playwright.async_api import async_playwright

URL = "http://127.0.0.1:5179/"
OUT = r"C:\Users\maxim\AppData\Local\Temp\claude\C--Users-maxim-Documents-claude-skills\5d4b209d-1f97-4077-92c8-93496923a1ac\scratchpad"
# PARES ancho x alto, no anchos sueltos. La matriz anterior corria todo a
# 844px de alto: con eso el bloque `@media (max-height: 700px)` NUNCA se
# activaba y el apaisado no se probaba nunca, asi que los dos bugs mas
# graves del hero (foto anclada al tercio negro de arriba, y foto vertical
# recortada a una franja en horizontal) pasaron limpios por el QA.
VIEWPORTS = [
    (320, 568, "iPhoneSE1"),
    (360, 640, "Android640"),
    (375, 667, "iPhoneSE2"),
    (360, 740, "Android740"),
    (390, 844, "iPhone14"),
    (430, 932, "iPhone15PM"),
    (844, 390, "cel-acostado"),
    (932, 430, "cel-acostado-gr"),
    (768, 1024, "tablet-vert"),
    (834, 1194, "iPadPro11-vert"),
    (1023, 768, "tablet-acostada"),
]
ANCHOS = [v[0] for v in VIEWPORTS]
SECCIONES = ["#hero", "#problema", "#dispositivo", "#metodo", "#metricas", "#estado", "#acceso"]


async def nueva(b, w, h=844):
    pg = await b.new_page(viewport={"width": w, "height": h}, device_scale_factor=1,
                          is_mobile=(w < 768), has_touch=(w < 768))
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console:" + m.text) if m.type == "error" else None)
    # `load` + espera fija en vez de networkidle: el servidor de pruebas es
    # de un solo hilo y con muchos pedidos en paralelo networkidle no llega
    # nunca a cumplirse y el chequeo entero muere por timeout.
    #
    # Y se REINTENTA si la hoja de estilos no llego a aplicarse: el servidor
    # local corta conexiones de vez en cuando, y una pagina sin CSS mide
    # 2248px de ancho y se reporta como "DESBORDE". Un falso positivo asi
    # es peor que no tener el chequeo: entrena a ignorarlo.
    for intento in range(3):
        await pg.goto(URL, wait_until="load")
        await pg.wait_for_timeout(1800)
        conCSS = await pg.evaluate(
            "() => getComputedStyle(document.body).overflowX === 'clip'")
        if conCSS:
            break
        errs.clear()
        await pg.wait_for_timeout(600)
    else:
        raise RuntimeError("el CSS no cargo despues de 3 intentos")
    return pg, errs


async def shots(b):
    for w, h, nombre in VIEWPORTS:
        pg, errs = await nueva(b, w, h)
        await pg.evaluate("""() => {
            document.querySelectorAll('.reveal').forEach(e => e.classList.add('is-in'));
        }""")
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=f"{OUT}/m{nombre}_full.png", full_page=True)
        print(f"{nombre:16s} {w}x{h}  errores: {errs[:3] if errs else 'ninguno'}")
        await pg.close()


async def sec(b, sel):
    for w, h, nombre in VIEWPORTS:
        pg, _ = await nueva(b, w, h)
        await pg.evaluate("""() => {
            document.querySelectorAll('.reveal').forEach(e => e.classList.add('is-in'));
        }""")
        try:
            el = await pg.query_selector(sel)
            await el.scroll_into_view_if_needed()
            await pg.wait_for_timeout(900)
            await el.screenshot(path=f"{OUT}/s{nombre}_{sel[1:]}.png")
            print(f"{nombre:16s} {w}x{h}  {sel} ok")
        except Exception as e:
            print(f"{nombre:16s} {w}x{h}  {sel} ERROR {e}")
        await pg.close()


async def overflow(b):
    for w, h, nombre in VIEWPORTS + [(1024, 768, "desktop-min")]:
        pg, errs = await nueva(b, w, h)
        # Sacar el clip: con el clip puesto el desborde es invisible y no se mide.
        await pg.add_style_tag(content="body { overflow-x: visible !important; }")
        await pg.evaluate("""() => {
            document.querySelectorAll('.reveal').forEach(e => e.classList.add('is-in'));
        }""")
        await pg.wait_for_timeout(700)
        res = await pg.evaluate("""(vw) => {
            // Un elemento que desborda pero vive dentro de un ancestro que
            // recorta (overflow hidden/clip/auto) NO es un bug: es el caso del
            // ticker (marquee infinito) y de las burbujas de la escena. Solo
            // interesa lo que realmente empuja el ancho del documento.
            const recortado = (el) => {
                for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
                    const o = getComputedStyle(p).overflowX;
                    if (o === 'hidden' || o === 'clip' || o === 'auto' || o === 'scroll') return true;
                }
                return false;
            };
            const malos = [];
            document.querySelectorAll('body *').forEach(el => {
                const r = el.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) return;
                const cs = getComputedStyle(el);
                if (cs.position === 'fixed') return;
                if (recortado(el)) return;
                if (r.right > vw + 1 || r.left < -1) {
                    malos.push({
                        t: el.tagName.toLowerCase() + '.' + (el.className.toString().slice(0,42) || '-'),
                        l: Math.round(r.left), r: Math.round(r.right)
                    });
                }
            });
            return { docW: document.documentElement.scrollWidth, malos: malos.slice(0, 14) };
        }""", w)
        estado = "OK" if res["docW"] <= w and not res["malos"] else "DESBORDE"
        print(f"\n{w}px  docW={res['docW']}  {estado}  errores: {errs[:2] if errs else 'ninguno'}")
        for m in res["malos"]:
            print(f"    {m['t']}  left={m['l']} right={m['r']}")
        await pg.close()


async def alturas(b):
    pg, _ = await nueva(b, 390)
    for s in SECCIONES:
        try:
            h = await pg.eval_on_selector(s, "el => Math.round(el.getBoundingClientRect().height)")
            print(f"{s:14s} {h}px")
        except Exception:
            print(f"{s:14s} no existe")
    total = await pg.evaluate("document.documentElement.scrollHeight")
    print(f"{'TOTAL':14s} {total}px")
    await pg.close()


async def hero(b):
    """Comprueba que el hero muestra ALGO en cada viewport: que carga una
    imagen, y que la franja visible no es negro liso. Un hero negro pasaba
    todos los chequeos anteriores porque ninguno miraba el brillo."""
    for w, h, nombre in VIEWPORTS:
        pg, _ = await nueva(b, w, h)
        r = await pg.evaluate("""() => {
            const bg = document.querySelector('#heroBg');
            const cs = getComputedStyle(bg);
            const img = cs.backgroundImage;
            return {
              cual: img.includes('hero-mob') ? 'mobil' : (img.includes('hero.webp') ? 'escritorio' : 'NINGUNA'),
              size: cs.backgroundSize, pos: cs.backgroundPosition, repeat: cs.backgroundRepeat,
            };
        }""")
        # brillo real de la mitad inferior del hero, sobre la captura
        import io as _io
        from PIL import Image
        shot = await pg.locator("#hero").screenshot()
        im = Image.open(_io.BytesIO(shot)).convert("L")
        ancho, alto = im.size
        abajo = im.crop((0, int(alto * 0.55), ancho, alto))
        import numpy as _np
        arr = _np.array(abajo)
        brillo, pico = arr.mean(), _np.percentile(arr, 99)
        veredicto = "OK" if (r["cual"] != "NINGUNA" and pico > 70) else "HERO APAGADO"
        print(f"{nombre:16s} {w}x{h}  {r['cual']:10s} {r['size']:11s} {r['pos']:14s} "
              f"brillo={brillo:5.1f} pico={pico:5.1f}  {veredicto}")
        await pg.close()


async def main():
    modo = sys.argv[1] if len(sys.argv) > 1 else "shots"
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", args=[
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        if modo == "shots":
            await shots(b)
        elif modo == "sec":
            await sec(b, sys.argv[2])
        elif modo == "overflow":
            await overflow(b)
        elif modo == "alturas":
            await alturas(b)
        elif modo == "hero":
            await hero(b)
        await b.close()

asyncio.run(main())
