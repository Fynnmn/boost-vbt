# Firmware — sensor VBT

Firmware para Seeed XIAO nRF52840 Sense. Mide la velocidad de cada repetición con el IMU LSM6DS3TR y la manda por BLE.

El plan completo está en [docs/PLAN.md](docs/PLAN.md). El contrato con la app está en [docs/PROTOCOL.md](docs/PROTOCOL.md). **Las decisiones de diseño y sus motivos están en [docs/DECISIONS.md](docs/DECISIONS.md)** — leerlo antes de cambiar cómo se comporta el sensor.

## Estado

| Componente | Estado |
|---|---|
| `docs/PROTOCOL.md` + `src/ble/protocol.h` | Listo, esquema congelado en v1 |
| `tools/decode.py` | Listo, con autotest |
| `src/drivers/i2c_bus.h` | Listo (interfaz que permite testear sin placa) |
| `src/drivers/lsm6ds3tr` | Escrito y testeado contra bus falso. Falta probarlo en la placa |
| `src/algo/` | v0 + v1 + v2: cuenta reps, calcula velocidad con ZUPT, rechaza falsos positivos |
| `tools/synth.py` | Listo: 3 series + 4 grabaciones negativas |
| `tools/metrics.py`, `tools/sweep.py` | Listos, con baseline en `docs/baseline.json` |
| `src/storage/log_store` | Listo, 9 tests contra flash NOR simulada |
| `tools/dump_log.py` | Listo (modo imagen; el modo BLE espera hardware) |
| `src/app/state_machine` | Listo, 11 tests (flujo de uso completo) |
| `src/app/led`, `battery`, `power` | Listos, 11 tests (incluye presupuesto de energía) |
| `src/ble/vbt_service` | Listo, 11 tests (payloads, comandos basura, MTU chico) |
| `src/main.cpp` + `src/platform/` | Escritos. **Sin verificar: sólo compilan con la placa** |

Todo lo marcado como listo está verificado en la PC contra dobles de prueba: bus I2C falso, flash NOR simulada, stack BLE falso y señal sintética. **52 tests, todos pasando. Nada tocó la placa todavía.**

**El firmware está completo.** Lo único sin verificar es `src/platform/` y `src/main.cpp`: son llamadas a librerías que sólo existen en la placa, así que no se pueden compilar ni probar en la PC. Están escritos lo más tontos posible a propósito — cada función traduce una llamada y nada más — para que si algo falla, el problema esté en un lugar chico y obvio.

**El primer día con hardware está guionado en [docs/BRINGUP.md](docs/BRINGUP.md).** Leerlo antes de conectar nada.

**Medición actual contra señal sintética:**

| | Conteo | Falsos positivos | MAE velocidad |
|---|---|---|---|
| Set de ajuste (semilla 1) | 100% (19/19) | 0 | 0,080 m/s |
| **Holdout (semilla 777, nunca visto)** | **94,7% (18/19)** | **0** | **0,158 m/s** |

**El número que vale es el del holdout.** La diferencia entre 100% y 94,7% es sobreajuste a la señal contra la que se calibró: si sólo se mira el set de ajuste, uno cree que terminó cuando no terminó. Cualquier ajuste futuro de umbrales tiene que reportar las dos columnas.

Y ninguna de las dos **es evidencia sobre el gimnasio**: la sintética no tiene el ruido real del LSM6DS3TR, ni la vibración de los discos, ni el juego de la manga, ni un agarre humano. Sirve para saber que el pipeline funciona de punta a punta y para detectar regresiones. La medición que decide el proyecto se hace con la placa, en el gimnasio, contra conteo por video.

**Presupuesto de energía estimado** (de `src/app/power.cpp`, corrientes de datasheet, a confirmar con el test de descarga):

| Situación | Consumo | Autonomía con 350 mAh |
|---|---|---|
| Reposo profundo | 29 µA | más de un año |
| Anunciando 24/7 | 53 µA | 275 días |
| **Uso real (1 h/día de gimnasio)** | — | **58 días** |
| Grabando sin parar | 4,8 mA | 73 h teóricas, ~24 h reales |

Hardware estimado a mediados de septiembre de 2026. Hasta entonces nada se prueba en la placa, sólo se escribe y se compila.

## Cómo iterar el algoritmo

```bash
python tools/synth.py --todos --out dataset/raw/synth   # generar dataset
make replay ARCHIVO=dataset/raw/synth/set_medio.vbt     # ver una grabación
make metrics                                            # medir TODO (recompila)
make metrics ARGS="--comparar docs/baseline.json"       # ver qué se rompió
python tools/sweep.py dataset/raw/synth                 # barrer umbrales
python tools/synth.py --todos --out dataset/raw/holdout --seed 777
python tools/metrics.py dataset/raw/holdout             # validar sin sobreajuste
```

## Descargar el log del sensor

`make test` deja una imagen de flash de ejemplo en `build/flash_image.bin`.

```bash
python tools/dump_log.py --imagen build/flash_image.bin --listar
python tools/dump_log.py --imagen build/flash_image.bin --out dataset/raw/hoy
```

El header de sesión que el firmware escribe en flash **es** el header del archivo `.vbt`, así que extraer una sesión es copiar un tramo de bytes. Menos código y ninguna chance de que los dos formatos se desincronicen.

Si el sensor se queda sin batería grabando, la sesión queda sin cerrar y sin contador de muestras. `dump_log.py` la recupera contando hasta donde la flash vuelve a estar borrada, y la marca como `RECUPERADA` en el listado.

Los umbrales se pueden pisar por variable de entorno sin recompilar
(`VBT_ZUPT_ACC`, `VBT_GRAV_STILL`, `VBT_VEL_START`, …), que es lo que hace
posible el barrido. Son los mismos parámetros que el firmware expone por BLE.

`--trace` en replay saca un CSV con la fase, la aceleración vertical, la velocidad y el flag de reposo por muestra. Es la herramienta para entender por qué se escapó una rep.

## Estructura

```
src/
  app/        maquina de estados, LED, bateria, power
  drivers/    LSM6DS3TR, QSPI flash, bus I2C
  ble/        stack, servicio VBT, protocol.h
  storage/    logger crudo al QSPI
  algo/       deteccion de reps y velocidad -- SIN dependencias de hardware
test/host/    tests que corren en la PC
tools/        Python: decodificar, descargar logs, metricas, senal sintetica
dataset/      grabaciones crudas + etiquetas (no va a git)
docs/         PLAN, PROTOCOL, DECISIONS, DATASET, BRINGUP
src/platform/ pegamento con las librerias de la placa (sin testear)
```

**La regla que sostiene todo:** `src/algo/` no incluye Arduino, ni BLE, ni drivers. Recibe arrays y devuelve structs. Eso es lo que permite compilar el mismo código en la PC y en el micro, iterar el algoritmo en segundos, y portar a Zephyr algún día sin reescribir la parte que importa.

## Compilar

### Para la placa

```bash
pio run -e xiaoblesense
```

Para flashear: `pio run -e xiaoblesense -t upload`. Si no aparece el puerto, doble toque rápido al botón de reset para entrar al bootloader.

### Para la PC

```bash
python tools/decode.py    # valida el protocolo, no necesita compilador
make test                 # tests de C++, necesita g++
```

## Toolchain

Smart App Control quedó **desactivado** (bloqueaba los ejecutables compilados localmente). Sin eso, ningún binario propio corre.

**w64devkit 2.9.1** instalado en `C:\Users\maxim\tools\w64devkit`, con su `bin/` agregado al PATH de usuario. Trae **GCC 16.2.0** y **GNU Make 4.4.1**. Es portable: para desinstalarlo se borra la carpeta y se saca del PATH.

Si abriste la terminal antes de instalarlo, cerrala y abrila de nuevo para que tome el PATH.

Para la placa hace falta además PlatformIO, que descarga su propio toolchain ARM la primera vez que corras `pio run`.

## Herramientas de desarrollo

**nRF Connect for Mobile** (gratis, iOS y Android) es el cliente BLE de desarrollo. Sirve para validar el GATT entero sin escribir una línea de la app nativa. **No escribir la app hasta que el firmware notifique reps de verdad.**

## Reglas del proyecto

1. **`src/algo/` no toca hardware.** Nunca. Si necesitás tiempo, te lo pasan por parámetro.
2. **Si cambiás el protocolo, cambiás tres archivos:** `docs/PROTOCOL.md`, `src/ble/protocol.h` y `tools/decode.py`. Y subís `SCHEMA_VERSION`.
3. **Ninguna mejora del algoritmo se acepta sin la métrica** sobre el dataset completo. Un umbral que arregla un caso y rompe cinco se ve así, y de ninguna otra forma.
4. **Los umbrales van en `algo/config.h` y se exponen por BLE.** Calibrar en el gimnasio sin recompilar es la diferencia entre iterar diez veces por sesión o dos por semana.
5. **El firmware informa, la app decide.** Una rep dudosa se notifica con un flag, no se descarta en el sensor.
