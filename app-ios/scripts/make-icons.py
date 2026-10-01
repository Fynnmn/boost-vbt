# Ícono de BOOST (fondo naranja, montaña blanca, flecha negra) dibujado como vector,
# calcado del logo original de 1254 px. Genera los PNG de la app web (PWA) en web-icons/.
# Correr: python scripts/make-icons.py   (necesita Pillow)
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'web-icons'
ORANGE, WHITE, BLACK = (236, 61, 29), (250, 250, 250), (22, 26, 32)
BASE = 1254  # coordenadas del logo original

MOUNTAIN = [(123, 952), (441, 546), (506, 623), (697, 373), (975, 705), (843, 733),
            (712, 623), (505, 808), (430, 760)]
ARROW = [(132, 1017), (417, 849), (525, 927), (690, 824), (797, 893), (947, 791), (898, 745),
         (1130, 685), (1065, 903), (1008, 850), (799, 991), (690, 913), (525, 1018), (413, 937),
         (132, 1038)]


def icon(size, pad=0.0):
    """pad = margen extra alrededor del dibujo (para íconos 'maskable', que Android recorta en círculo)."""
    ss = 4  # supersampling: bordes suaves
    big = size * ss
    im = Image.new('RGB', (big, big), ORANGE)
    d = ImageDraw.Draw(im)
    # El dibujo original no está centrado del todo: se centra su caja.
    pts = MOUNTAIN + ARROW
    x0, x1 = min(p[0] for p in pts), max(p[0] for p in pts)
    y0, y1 = min(p[1] for p in pts), max(p[1] for p in pts)
    scale = big / BASE * (1 - 2 * pad)
    ox = (big - (x1 - x0) * scale) / 2 - x0 * scale
    oy = (big - (y1 - y0) * scale) / 2 - y0 * scale
    tr = lambda poly: [(ox + x * scale, oy + y * scale) for x, y in poly]
    d.polygon(tr(MOUNTAIN), fill=WHITE)
    d.polygon(tr(ARROW), fill=BLACK)
    return im.resize((size, size), Image.LANCZOS)


OUT.mkdir(exist_ok=True)
for name, size, pad in [('icon-192.png', 192, 0.02), ('icon-512.png', 512, 0.02),
                        ('icon-maskable-512.png', 512, 0.12), ('apple-touch-icon.png', 180, 0.04),
                        ('apple-touch-icon-152.png', 152, 0.04), ('apple-touch-icon-167.png', 167, 0.04),
                        ('favicon-32.png', 32, 0.0), ('icon-1024.png', 1024, 0.02)]:
    icon(size, pad).save(OUT / name, optimize=True)
# favicon.ico en la raíz: algunos navegadores lo piden igual aunque haya <link rel="icon">.
icon(48, 0.0).save(OUT / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
print('íconos en', OUT)
