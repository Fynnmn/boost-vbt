"""Extrae el simbolo de BOOST del favicon para usarlo sobre fondo oscuro.

POR QUE: el `logo.svg` de la landing es una aproximacion dibujada a mano —una
montana de nueve vertices y una linea quebrada— que no coincide con el logo
real del producto. En chico se lee como un garabato. El logo de verdad es el
que esta impreso en la tapa del sensor y en el favicon: dos picos y una flecha.

El favicon viene con fondo coral, montana blanca y flecha negra. Acá se
invierte a lo que necesita la app: fondo transparente, montana blanca y
flecha coral.

La clasificacion es por cercania de color en vez de por umbrales sueltos: cada
pixel se asigna al color de referencia mas parecido, y el alfa sale de cuanto
se aleja del fondo. Asi los bordes suavizados del PNG original no quedan con
un halo coral alrededor.

Uso:  python docs/extraer_simbolo.py
"""
import os

import numpy as np
from PIL import Image

ORIGEN = "../assets/favicon.png"
DESTINO = "../assets/simbolo.png"

CORAL = (238, 69, 38)


def extraer(path_origen: str, path_destino: str) -> None:
    rgba = Image.open(path_origen).convert("RGBA")
    a = np.asarray(rgba.convert("RGB")).astype(np.float32)
    alfa_original = np.asarray(rgba.getchannel("A"))
    h, w, _ = a.shape

    # El fondo se muestrea en el borde izquierdo a media altura, NO en la
    # esquina: el icono tiene las esquinas redondeadas y transparentes, y
    # `convert("RGB")` las devuelve negras. Tomando la esquina, el negro
    # pasaba a ser el color de fondo y el coral se clasificaba como flecha
    # — salia el cuadrado entero pintado.
    fondo = a[h // 2, 6]
    blanco = np.array([255.0, 255.0, 255.0])
    negro = np.array([20.0, 24.0, 28.0])

    d_fondo = np.linalg.norm(a - fondo, axis=2)
    d_blanco = np.linalg.norm(a - blanco, axis=2)
    d_negro = np.linalg.norm(a - negro, axis=2)

    # A que se parece mas cada pixel.
    apilado = np.stack([d_fondo, d_blanco, d_negro], axis=0)
    clase = np.argmin(apilado, axis=0)  # 0 fondo, 1 montana, 2 flecha

    salida = np.zeros((h, w, 4), dtype=np.uint8)
    salida[clase == 1] = (255, 255, 255, 255)
    salida[clase == 2] = (*CORAL, 255)

    # Borde suave: en la franja donde el pixel esta a medio camino entre el
    # fondo y la figura, el alfa acompana esa distancia en vez de saltar de
    # 0 a 255. Sin esto el simbolo queda con escalones a tamano chico.
    borde = (clase != 0) & (d_fondo < 90)
    salida[..., 3] = np.where(borde, (d_fondo / 90 * 255).astype(np.uint8), salida[..., 3])

    # Lo que ya era transparente en el original (las esquinas del icono) se
    # mantiene transparente pase lo que pase con la clasificacion.
    salida[..., 3] = np.minimum(salida[..., 3], alfa_original)

    # Los pixeles casi invisibles del borde del icono original se descartan.
    # No se ven, pero cuentan para getbbox() y dejaban el simbolo con un
    # marco de aire que lo hacia parecer mas chico de lo que es.
    salida[..., 3] = np.where(salida[..., 3] < 10, 0, salida[..., 3])

    im = Image.fromarray(salida, "RGBA")
    caja = im.getbbox()
    if caja:
        im = im.crop(caja)

    # 320px de ancho: en la barra superior se dibuja a 34 CSS px, asi que
    # sobra resolucion incluso en pantallas de densidad 3x.
    ancho = 320
    im = im.resize((ancho, round(im.height * ancho / im.width)), Image.LANCZOS)
    im.save(path_destino, optimize=True)

    print(f"{path_destino}  {im.width}x{im.height}  "
          f"{os.path.getsize(path_destino) / 1024:.0f} KB")


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    extraer(ORIGEN, DESTINO)
