# Formato del dataset

Tres piezas por grabación, con el mismo nombre base:

```
dataset/raw/2026-09-20_banca/set_01.vbt     muestras crudas
dataset/raw/2026-09-20_banca/set_01.json    metadata de la serie
dataset/labels/set_01.labels.json           ground truth (reps reales)
```

Lo escriben `tools/synth.py` (señal sintética), `tools/dump_log.py` (descarga del QSPI por USB) y **la app** — desde <https://app.getboost.fit/log> por Bluetooth, que es la ruta normal: no hace falta desarmar nada ni llevar la computadora al gimnasio.

Una descarga por BLE puede perder lotes y no hay retransmisión. Cuando pasa, la app corrige el `sample_count` del header a lo que de verdad quedó en el archivo y le agrega `_INCOMPLETO` al nombre. El archivo es consistente y se puede abrir, **pero le faltan datos del medio**: el `.json` que lo acompaña dice cuántas muestras declaró el sensor. No usarlo para medir precisión sin revisarlo primero.

Los leen `test/host/replay_main.cpp` y `tools/metrics.py`.

## Archivo `.vbt`

Header de 32 bytes, little-endian, seguido de las muestras.

| Offset | Tipo | Campo |
|---|---|---|
| 0 | `char[4]` | magic, `"VBT1"` |
| 4 | `u16` | versión del formato (1) |
| 6 | `u16` | ODR real en Hz |
| 8 | `u8` | fondo de escala del acelerómetro, en g |
| 9 | `u16` | fondo de escala del giroscopio, en dps |
| 11 | `u8` | `exercise_id` (ver PROTOCOL.md) |
| 12 | `u32` | cantidad de muestras |
| 16 | `u32` | timestamp unix del inicio |
| 20 | `u16` | carga, kg × 10 |
| 22 | `u8` | origen: 0 = sensor real, 1 = sintético, **2 = IMU de un teléfono** |
| 23 | `u8[9]` | reservado, en cero |

Después vienen `sample_count` muestras de 12 bytes: seis `i16` en el orden **`ax, ay, az, gx, gy, gz`**.

Es el mismo orden de `vbt_sample_t` en `protocol.h`, y **no** el orden en que salen del FIFO del IMU (que entrega giroscopio primero). El driver ya normaliza al leer; el archivo siempre guarda el orden canónico.

Valores crudos, sin convertir. Las escalas están en el header. Un eje en ±32767 es saturación.

### Sobre `origen = 2` (teléfono)

Existe porque el sensor no llegaba hasta octubre de 2026 y había que empezar a
juntar señal humana real antes. La app tiene un modo de grabación que usa el
acelerómetro y el giroscopio del celular atado a la barra y escribe este mismo
formato.

**Estas grabaciones NO son equivalentes a las del sensor y no hay que
mezclarlas al medir.** Las diferencias que importan:

- **Frecuencia:** ~60 Hz contra los 208 Hz del LSM6DS3TR-C. El campo `ODR real`
  del header dice la que se logró de verdad, que además fluctúa.
- **Otro chip,** con otro ruido, otro sesgo y otra deriva.
- **Otra masa y otro montaje:** un teléfono atado pesa y se mueve distinto que
  40 g pegados con imanes.
- Las escalas del header se declaran ±8 g y ±1000 dps para que el archivo sea
  legible por las mismas herramientas, pero el rango real del teléfono es otro
  y satura antes.

**Para qué sirven igual:** para responder si el detector cuenta bien
repeticiones de un humano de verdad, con rebote en el pecho, temblor cerca del
fallo, pausas irregulares y cambios de ritmo — todo lo que la señal sintética
no tiene porque la generó el mismo razonamiento que escribió el detector.

Al medir, `metrics.py` los separa solo: agrupa por el campo `origen` del
header, imprime un bloque por conjunto y **no** saca un promedio global cuando
hay más de uno. Si se compara contra un baseline de otro origen, avisa.

Las grabaciones van a `dataset/raw/telefono/`. Nada sintético entra ahí.

### Que el archivo de la app siga alineado

Un offset corrido no rompe nada de forma visible: `replay.exe` lee el archivo,
no se queja y devuelve números equivocados. Por eso hay una comprobación:

```
make formato
```

Regenera un fixture importando el `app/js/imu.js` de verdad — sin copiar una
línea — y verifica campo por campo contra esta tabla, más el tamaño, los bytes
reservados, que la gravedad en reposo dé 1 g y que `replay` lo lea y lo llame
`telefono`. Si alguien toca el header, falla acá y no seis semanas después
sobre datos ya grabados.

## Archivo `.json` de metadata

Se escribe a mano después de cada serie en el gimnasio, o lo genera `synth.py`. Sin esto, una grabación es casi inútil seis meses después.

```json
{
  "exercise": "bench",
  "load_kg": 82.5,
  "intended_reps": 8,
  "rir": 2,
  "tempo": "2-1-X",
  "paused": true,
  "bar_type": "olympic",
  "mount": "sleeve-inner",
  "notes": "ultima rep grinder"
}
```

## Archivo `.labels.json` de ground truth

El conteo sale de mirar el video cuadro por cuadro. La velocidad, de Kinovea, sólo en algunas series.

```json
{
  "source": "video",
  "fps": 60,
  "reps": [
    {"conc_start_ms": 3200, "conc_end_ms": 3810, "kinovea_mean_vel_ms": 0.62},
    {"conc_start_ms": 7450, "conc_end_ms": 8120, "kinovea_mean_vel_ms": 0.58}
  ],
  "expected_rep_count": 8
}
```

`expected_rep_count` va aparte de la lista a propósito: en las grabaciones negativas (montar la barra, caminar, el sensor en el bolso) vale **0** y la lista queda vacía. Esas grabaciones valen tanto como las positivas — son las que atrapan los falsos positivos.
