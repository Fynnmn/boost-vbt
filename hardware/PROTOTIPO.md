# BOOST — el prototipo

> **Fuente única de cómo es el sensor por fuera.** Actualizado el 22/9/2026.
> Si otro documento, prompt o pieza dice otra cosa, gana este.

![Vistas y medidas](../marca/imagenes/producto/dimensiones.png)

## Medidas

**57 × 31 × 17 mm** (largo × alto × espesor).

Todas las medidas anteriores quedan anuladas: `50 × 30 × 18`, `55 × 30 × 18`,
`58 × 31 × 17` y la carcasa paramétrica de `42 × 28 × 18` mm. No volver a
escribir ninguna.

## Cómo es

- **Forma:** rectángulo con las esquinas y los cantos redondeados, tipo pastilla.
- **Material y acabado:** negro mate con textura granulada (impresión 3D).
- **Frente:** el logotipo, la montaña blanca con la flecha naranja que sube,
  impreso en **multimaterial** y con relieve. No es un sticker ni una serigrafía.
- **Dorso:** liso, sin logo. Es la cara que apoya contra el eje de la barra.
- **Carcasa en dos piezas:** la junta se ve en la cara superior.
- **Sin pantalla, sin LED, sin botones.** Nada que brille ni se apriete.
- **Se fija con imanes al eje de la barra**, no a la manga.

## Archivos

| Archivo | Qué es |
|---|---|
| `carcasa/BOOST.3mf` | Proyecto de Bambu Studio. **El bueno es la placa 1, «prototipo actual»**: objeto 51 = cuerpo, objeto 40 = tapa. Las otras placas no son de BOOST |
| `../marca/imagenes/producto/dimensiones.png` | Ficha con las cinco vistas y las medidas |
| `../marca/imagenes/producto/foto-frente.png` | Foto del prototipo impreso, de frente |
| `../marca/imagenes/producto/foto-mesa.png` | Foto del prototipo impreso, en tres cuartos |
| `../marca/imagenes/producto/foto-en-la-mano.png` | Foto en la mano, para mostrar la escala |

Para cualquier imagen o video generado con IA, estas fotos son la referencia
de identidad del producto. Un render inventado que no coincide con el aparato
real es publicidad engañosa el día que se publique la foto verdadera.

## Qué falta confirmar con la placa en la mano (6/10/2026)

La carcasa paramétrica anterior tenía calculado el interior (batería, repisa
del PCB, bolsillos de los imanes, ventana del USB-C). Este modelo todavía no se
midió por dentro contra los componentes reales. Antes del primer armado,
verificar con calibre que entren la XIAO nRF52840 Sense, la batería (formato
402535, espesor máximo según `MATERIALES.md`) y los dos imanes de bloque de
20 × 10 × 2 mm.
