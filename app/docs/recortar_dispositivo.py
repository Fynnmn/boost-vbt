"""Recorta el fondo del render del dispositivo para poder usarlo sobre negro.

POR QUE NO UN UMBRAL DE LUMINANCIA: el logo del sensor es blanco. Un umbral
por brillo lo borraria junto con el fondo y quedaria un agujero en la tapa.

La solucion es un relleno por inundacion desde las cuatro esquinas: el fondo
esta conectado con el borde de la imagen y el blanco del logo esta encerrado
dentro del cuerpo negro, asi que la inundacion nunca lo alcanza.

La sombra bajo el objeto se descarta a proposito: sobre fondo negro no aporta
nada y solo deja una mancha gris flotando.

Uso:  python docs/recortar_dispositivo.py
"""
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

# Rutas relativas a este archivo (app/docs/).
ORIGEN = "../../landing/assets/dispositivo.webp"
DESTINO = "../assets/dispositivo.png"

# Cuanto puede alejarse un pixel del color de la esquina y seguir siendo fondo.
# 42 sobre 255 aguanta el degradado suave del fondo y la sombra clara sin
# empezar a comerse el borde del objeto.
TOLERANCIA = 42


def recortar(path_origen: str, path_destino: str) -> None:
    img = Image.open(path_origen).convert("RGB")
    a = np.asarray(img).astype(np.int16)
    h, w, _ = a.shape

    # Color de referencia: la mediana de las cuatro esquinas, que es fondo puro.
    esquinas = np.array(
        [a[0, 0], a[0, w - 1], a[h - 1, 0], a[h - 1, w - 1]], dtype=np.int16
    )
    fondo = np.median(esquinas, axis=0)

    # Candidatos: todo lo que se parece al color del fondo. Todavia incluye
    # cualquier zona clara del interior del objeto — la inundacion las descarta.
    parecido = np.max(np.abs(a - fondo), axis=2) <= TOLERANCIA

    # Inundacion desde el borde, iterativa (recursiva desborda la pila en 1100px).
    es_fondo = np.zeros((h, w), dtype=bool)
    cola = deque()
    for x in range(w):
        for y in (0, h - 1):
            if parecido[y, x] and not es_fondo[y, x]:
                es_fondo[y, x] = True
                cola.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if parecido[y, x] and not es_fondo[y, x]:
                es_fondo[y, x] = True
                cola.append((y, x))

    while cola:
        y, x = cola.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and parecido[ny, nx] and not es_fondo[ny, nx]:
                es_fondo[ny, nx] = True
                cola.append((ny, nx))

    alpha = np.where(es_fondo, 0, 255).astype(np.uint8)

    salida = Image.fromarray(np.dstack([np.asarray(img), alpha]), "RGBA")
    # Un desenfoque de medio pixel en el alfa: sin el, el borde queda dentado
    # porque la inundacion decide por pixel entero, sin medias tintas.
    canal = salida.getchannel("A").filter(ImageFilter.GaussianBlur(0.6))
    salida.putalpha(canal)

    # Recorte al contenido, con un margen de respiro.
    caja = salida.getbbox()
    if caja:
        salida = salida.crop(caja)

    salida.save(path_destino)
    print(f"{path_destino}  {salida.width}x{salida.height}  "
          f"fondo={tuple(int(v) for v in fondo)}  "
          f"recortado={round(100 * es_fondo.mean(), 1)}%")


if __name__ == "__main__":
    import os

    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    recortar(ORIGEN, DESTINO)
