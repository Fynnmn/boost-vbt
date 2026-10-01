# Plan de implementación — firmware VBT

> 26 de agosto de 2026. Hardware estimado a mediados de septiembre.

## 0. Qué se hace en las 3 semanas sin hardware

**Decisión tomada: el dataset se captura con la placa real, no con el celular.** El IMU del celular tiene otro rango, otro ruido, otra masa y otro montaje: los umbrales sintonizados ahí no transfieren al LSM6DS3TR. Sintonizar contra un sensor que no es el nuestro es trabajo que hay que rehacer entero.

Entonces la meta de estas 3 semanas no es "algoritmo validado", es **firmware completo escrito y compilando, listo para flashear el día 1**. Se puede escribir absolutamente todo — driver, máquina de estados, BLE, logger, algoritmo — porque nada de eso necesita la placa para escribirse, sólo para sintonizarse.

Dos consecuencias que ordenan el resto del plan:

**1. El modo logger es lo primero que tiene que funcionar.** Es lo que produce el dataset, y sin dataset no se puede sintonizar nada. Pasa de ser una utilidad de debug a ser la ruta crítica del proyecto.

**2. El algoritmo se desarrolla contra señal sintética.** `tools/synth.py` genera reps con velocidad, ROM y ruido conocidos. Eso no reemplaza datos reales — no valida nada — pero permite escribir el detector, depurar la máquina de estados, y tener el harness andando el día que lleguen los primeros datos de verdad. La diferencia entre llegar con el harness listo y llegar con una carpeta vacía es de una semana.

El hito que decide el proyecto (95% en press banca) se mide **con la placa**, en la etapa "con hardware".

## 1. Decisiones técnicas

### 1.1 Entorno: PlatformIO + Adafruit nRF52 Arduino core (board `xiaoblesense`)

No Arduino IDE, no Zephyr.

**Contra Arduino IDE:** PlatformIO da versionado de dependencias y, sobre todo, un **entorno `native`** que compila parte del proyecto con g++ para correrlo en la PC. Ese entorno es donde se testea el algoritmo contra el dataset. Arduino IDE no puede hacerlo y es la mitad del plan.

**Contra Zephyr/nRF Connect SDK:** Zephyr es firmware mejor (power management real, DFU, tickless idle) pero son 1-2 semanas de curva de aprendizaje y hay 3. Las 3 semanas van al algoritmo, no a aprender devicetree.

El core de Adafruit ya da `BLEService`/`BLECharacteristic`, `BLEBas` (Battery Service estándar en 3 líneas), `BLEDis`, `Adafruit_LittleFS` sobre el QSPI, y el bootloader OTA-DFU **ya viene flasheado de fábrica en la XIAO**.

**Mitigación del lock-in:** todo el algoritmo va en `src/algo/` con **cero includes de Arduino, cero BLE, cero hardware**. Recibe arrays de floats, devuelve structs. Si algún día se porta a Zephyr, se reescribe la cáscara y `algo/` se copia intacto.

### 1.2 Librería del IMU: driver propio a nivel de registro

Las librerías Arduino existentes exponen "leer aceleración". No exponen FIFO, double-tap por hardware, wake-on-motion ni ruteo de interrupciones a INT1. **Esos cuatro son literalmente el proyecto.**

Son ~300 líneas contra el datasheet del **LSM6DS3TR-C** (no el LSM6DS3 a secas: el mapa de registros y el `WHO_AM_I` difieren).

**Dos detalles del XIAO Sense que cuestan medio día si no se saben de antes:** el IMU está alimentado por un GPIO dedicado (hay que ponerlo en alto antes de hablar I2C, si no el bus no responde y parece placa quemada), y su INT1 está cableado a otro GPIO del nRF. Los números de pin salen del `variant.h` del board package de Seeed, no del wiki. Buscarlos el día 1 y anotarlos en `DECISIONS.md`.

### 1.3 Muestreo: 208 Hz, ±8g, ±1000 dps, vía FIFO

- **208 Hz** porque es un ODR nativo del chip. "200 Hz" no existe en el LSM6DS3TR; si se piden 200 da 208 y el `dt` queda mal un 4%, que en una integración se nota.
- **±8g, no el default de ±2g.** Re-rackear la barra genera picos de mucho más de 2g. Un acelerómetro saturado da velocidad basura y no se ve mirando el gráfico. Guardar un flag de saturación por muestra.
- Leer por **FIFO con watermark**, no polleando. Evita jitter de timing y baja la carga de I2C.

### 1.4 GATT: servicio propio 128-bit + servicios estándar

| Servicio | UUID | Rol |
|---|---|---|
| Battery Service | `0x180F` | Batería visible en ajustes de iOS/Android sin código en la app |
| Device Information | `0x180A` | Versión de firmware, serial. Necesario para soporte y OTA |
| VBT Service | 128-bit propio | Lo nuestro |

| Característica | Props | Qué lleva |
|---|---|---|
| `RepResult` | Notify | Un resultado por rep: nº, vel media concéntrica, vel media propulsiva, vel pico, ROM, duración, flags de calidad |
| `SetSummary` | Notify | Al cerrar la serie: total de reps, pérdida de velocidad %, mejor rep |
| `Control` | Write | start/stop serie, ejercicio, carga en kg, dormir, entrar en modo logger |
| `Config` | Write/Read | Umbrales del algoritmo, parámetros de tap, ODR. **Editable por BLE = calibrar en el gimnasio sin recompilar** |
| `Status` | Notify | Estado actual, saturación, IMU ok, espacio de log |
| `RawStream` | Notify | Muestras crudas en lote, sólo en modo logger/debug |
| `LogDump` | Notify | Descarga de las sesiones guardadas en el QSPI |

### 1.5 Formato de datos: structs empaquetados little-endian, versionados

- Primer byte = `SCHEMA_VERSION`. Sin eso, el primer cambio de payload rompe la app de todos.
- Little-endian nativo en el Cortex-M4 y en el ARM del celular: cero conversión.
- `RepResult` tiene que entrar en **20 bytes** (MTU por defecto), aunque se negocie MTU de 247. Así funciona incluso si la negociación falla.
- **Congelar `docs/PROTOCOL.md` la semana 1.** Es el contrato con la app y con las herramientas de Python.

### 1.6 Batería: tabla de lookup de tensión, medida en reposo

El divisor interno se habilita por GPIO y se lee por un pin analógico (números en `variant.h`). Dos reglas: promediar 16 lecturas y **nunca medir durante una transmisión de radio** — el pico de corriente hunde la tensión y marca 40% cuando hay 80%. Curva LiPo por tabla + histéresis. Reportar por `0x180F`.

### 1.7 Estimación de batería, y el problema escondido en el modo Sleep

| Modo | Consumo estimado | Autonomía con 350 mAh |
|---|---|---|
| Activo (BLE conectado, IMU 208 Hz, algoritmo) | ~5-8 mA | ~50 h teóricas → 12-20 h reales |
| Sleep (System ON idle + wake-on-motion 26 Hz LP) | ~30-50 µA | ~8-12 meses |
| Logger (QSPI escribiendo) | ~15-25 mA | ~15 h |

**El hallazgo importante:** los 5 µA de deep sleep de la XIAO son del MCU solo. Si el detector de doble tap queda armado permanentemente, el LSM6DS3TR necesita ODR ≥ 416 Hz, y eso son **~250-300 µA sostenidos**. El IMU se come el presupuesto entero y "5 µA" pasa a ser ficción.

**Solución en dos etapas (encaja con la máquina de estados ya diseñada):**

1. En Sleep, el IMU queda sólo con **wake-on-motion a 26 Hz low-power** (~25 µA). El MCU en System ON idle (~1,5 µA, mantiene RAM y estado; mejor que System OFF, que resetea).
2. Cualquier golpe dispara INT1 y despierta al MCU.
3. El MCU sube el IMU a 416 Hz y **arma el detector de tap por 3 segundos**.
4. Si en esos 3 s llega el doble tap, va a **Activo**. Si no, aplica la validación de wake-on-motion (>2g, orientación horizontal, patrón sostenido 2-3 s): si pasa, Activo; si no, vuelve a dormir.
5. **Modo Viaje:** idéntico, salvo que el paso 4 sólo acepta el doble tap.

Con esto el modo Viaje sale casi gratis en código y el consumo en reposo queda en decenas de µA de verdad.

**Cómo medirlo sin comprar un PPK2 (US$100):** no medirlo, contarlo. Instrumentar el firmware para acumular tiempo en cada modo y cantidad de despertares en el QSPI, y hacer un test de descarga completo. Da la cifra real que después va en el marketing.

## 2. Estrategia para el problema difícil

### 2.1 Fase A — Captura (con la placa, a partir del día 7)

**Setup:** el sensor en su carcasa, montado en la barra con los imanes, corriendo en **modo logger** (208 Hz crudos al QSPI). Celular en trípode, perpendicular al plano de la barra, grabando a 60 fps mínimo. Después de cada sesión, `tools/dump_log.py` baja las series por BLE o serial.

**Sincronización:** antes de cada serie, dos golpes secos en la barra. Generan un pico inconfundible en la señal y un evento audible en el video. Ese es el punto cero.

**Metadata por serie** (un JSON al lado de cada CSV, sin excepción): ejercicio, carga en kg, reps intencionadas, RIR aproximado, tempo, si hubo pausa, tipo de barra, dónde estaba montado el sensor.

**Dataset mínimo:**
- **30 series de press banca** en tres regímenes: barra sola / carga media / carga cerca del fallo. Las reps lentas y feas son las que rompen los algoritmos, no las rápidas.
- **20 grabaciones negativas**, que valen tanto como las positivas: montar y desmontar la barra, ajustar el agarre, apoyarla en el rack, caminar con el sensor en la mano, dejarlo en el bolso, charlar con la barra apoyada en el pecho. Todo eso tiene que dar **cero reps**.
- Después sentadilla, peso muerto, press militar. Pero **primero banca y nada más que banca** hasta llegar al 95%.

**Ground truth de conteo:** contar reps mirando el video cuadro por cuadro, marcando el inicio de cada concéntrica. Media hora por sesión, insustituible.

**Ground truth de velocidad:** **Kinovea** (gratis). Sticker de alto contraste en el extremo de la barra, trackear, exportar desplazamiento vs tiempo, calcular velocidad media concéntrica. Con 10-15 series alcanza. Es el sustituto del encoder lineal que no tenemos.

### 2.2 Fase B — El harness

Un binario que se compila con g++ en la PC, contiene **exactamente el mismo código C++ de `src/algo/` que después corre en el nRF52840**, lee un archivo del dataset y escupe las reps detectadas.

Encima, `tools/metrics.py` compara contra las etiquetas: reps detectadas vs reales, falsos positivos, falsos negativos, precisión por serie y global, error absoluto medio de velocidad contra Kinovea.

Con eso, **cada cambio de umbral tarda 5 segundos en evaluarse contra las 50 grabaciones** en vez de un viaje al gimnasio. Es la diferencia entre iterar 200 veces y iterar 5.

Se puede prototipar en Python, pero **el resultado final tiene que ser el C++** y la métrica oficial se mide sobre el C++. Si no, el día del port aparecen diferencias sin explicación.

### 2.3 Fase C — El algoritmo, por versiones

**v0 — Contar reps, sin velocidad todavía.**
Filtro pasabajos para estimar el vector gravedad. Proyectar la aceleración sobre el eje vertical. Máquina de estados: reposo → excéntrica → punto de inversión → concéntrica → reposo. Una rep se cuenta cuando el ciclo se completa entero. **Meta: 95% de conteo en banca, offline.** Este es el hito que decide el proyecto y se alcanza sin la placa.

**v1 — Velocidad, con el truco que evita el drift.**
La regla que separa esto de un integrador roto: **nunca integrar continuo.** Detectar instantes cuasi-estáticos (|a| ≈ 1g y giroscopio ≈ 0; en banca abundan: la pausa en el pecho, el bloqueo arriba, la barra apoyada). En cada uno, resetear la velocidad a cero (ZUPT) y re-estimar el offset del acelerómetro. Integrar **sólo dentro de la rep**, entre dos anclas de reposo. El drift no tiene tiempo de acumularse. Salidas: velocidad media concéntrica, media propulsiva, pico, ROM, tiempo bajo tensión.

**v2 — Rechazo de falsos positivos.**
Plausibilidad física: ROM entre ~0,15 y 0,8 m, duración entre 0,3 y 6 s, relación excéntrica/concéntrica razonable, ROM consistente con las reps anteriores de la misma serie. Acá mueren los negativos del dataset.

**v3 — Perfiles por ejercicio.**
La app le dice al firmware qué ejercicio es. **No intentar clasificar automáticamente**: es un problema aparte y mucho más difícil. Cada ejercicio con su set de umbrales en `algo/config.h`.

**v4 — Sólo si v0-v3 se estancan.**
Clasificador chico (árbol de decisión o red 1D minúscula) entrenado offline sobre el dataset, exportado a C de punto fijo. Es la salida de emergencia, no el plan. Arrancar por acá sin dataset cuesta meses.

**Orientación:** no integrar el giroscopio para sacar actitud completa, el drift se la come. Usar la gravedad medida en el reposo previo a cada rep para definir "arriba", y el giro sólo para detectar quietud y compensar rotación dentro de la rep. En una barra, que se mantiene aproximadamente horizontal, alcanza.

## 3. Estructura de archivos

```
firmware/
  platformio.ini              # env:xiaoblesense + env:native (tests en PC)
  src/
    main.cpp                  # setup/loop, nada de lógica
    app/
      state_machine.{h,cpp}   # Sleep / Activo / Viaje / Logger
      led.{h,cpp}             # tabla de estados -> color
      power.{h,cpp}           # System ON idle, wake sources, QSPI deep power-down
      battery.{h,cpp}
      session.{h,cpp}         # serie actual, acumulados
    drivers/
      i2c_bus.h               # interfaz; el build native la stubea
      lsm6ds3tr.{h,cpp}       # registros, FIFO, tap, wake-on-motion, INT1
      qspi_flash.{h,cpp}
    ble/
      ble_stack.{h,cpp}
      vbt_service.{h,cpp}
      ble_battery.{h,cpp}     # 0x180F
      protocol.h              # structs empaquetados + SCHEMA_VERSION
    storage/
      log_store.{h,cpp}       # ring buffer de muestras crudas en QSPI
    algo/                     # <-- CERO dependencias de hardware
      types.h
      config.h                # TODOS los umbrales, en un solo archivo
      filters.{h,cpp}
      orientation.{h,cpp}
      rep_detector.{h,cpp}
      velocity.{h,cpp}
  test/
    host/
      replay_main.cpp         # lee dataset, corre algo/, imprime reps
      test_filters.cpp
tools/                        # Python, corre en la PC
  phyphox_to_bin.py           # CSV del celular -> formato interno
  dump_log.py                 # descarga el QSPI por BLE/serial
  decode.py                   # parser espejo de protocol.h
  label.py                    # marcar limites de rep desde el video
  metrics.py                  # precision, FP/FN, MAE de velocidad
  synth.py                    # generador de senal sintetica (semana 1)
dataset/
  raw/2026-09-20_banca/set_01.bin + set_01.json
  labels/
docs/
  PROTOCOL.md
  DECISIONS.md                # una linea por decision y su porque
  BRINGUP.md                  # checklist del dia que llega la placa
  CALIBRATION.md              # valores de tap por unidad
```

**Presupuesto de almacenamiento del logger:** 208 Hz × 12 B = 2,5 kB/s. Los 2 MB del QSPI dan **~13 minutos continuos**. Grabando sólo mientras hay serie (30-60 s cada una), son **25-40 series por sesión**. Si queda corto, bajar a 104 Hz y duplicar.

## 4. Orden de ejecución

### Sin hardware — semanas 1 a 3

**Semana 1 — andamio y driver**
1. Crear repo, `platformio.ini` con los dos entornos, esqueleto de módulos.
2. `docs/PROTOCOL.md` + `protocol.h`. Congelado.
3. Driver `lsm6ds3tr.cpp` completo contra el datasheet: registros, FIFO, tap, wake-on-motion, INT1. Compila; no se prueba hasta septiembre. Es lo más largo y lo que más rinde tener listo.
4. `tools/synth.py`: generador de señal sintética (senoide + gravedad + ruido + rotación) con reps de velocidad y ROM conocidas.

**Semana 2 — algoritmo y logger**
5. Harness host andando sobre señal sintética.
6. **v0 del detector de reps** contra sintética. No valida nada, pero deja el código escrito y depurado.
7. v1 (velocidad + ZUPT) contra sintética, donde la velocidad real se conoce por construcción: es el único caso donde la sintética sí prueba algo útil, porque verifica que el integrador no esté roto.
8. `log_store.cpp` + `tools/dump_log.py`. **Ruta crítica: sin esto no hay dataset.**
9. Imprimir la carcasa en PLA con el filamento que haya. Verificar que los tornillos M2 entren, que la tapa encastre, que el corte del USB-C esté a la altura correcta, y **golpear la zona de tap con el dedo** para ver si no amortigua demasiado. Si suena hueco, subir el relleno en esa zona o bajar `TAP_DEPTH` antes de que llegue la placa.

**Semana 3 — el firmware alrededor del algoritmo**
10. Máquina de estados, LED, batería, power management, servicio BLE. Todo escrito, nada probado.
11. `tools/metrics.py` y `tools/label.py`, listos para el primer dataset real.
12. `docs/BRINGUP.md`: checklist paso a paso del día 1 con hardware. El tiempo con placa es el caro; hay que llegar con el guion escrito.
13. **Cliente BLE de desarrollo: nRF Connect for Mobile.** No escribir una línea de la app nativa hasta que el firmware notifique reps de verdad.

### Con hardware — orden por riesgo

| Día | Qué | Riesgo que descubre |
|---|---|---|
| 1 | USB, sin batería. Blink + serial. `WHO_AM_I` del IMU por I2C | Placa equivocada / IMU muerto / pin de alimentación del IMU |
| 2 | Streaming crudo a 208 Hz por USB serial. Comparar contra el dataset del celular | ODR real, saturación, ruido, ejes |
| 3 | Soldar batería (pigtail, multímetro antes). Carga | El día que se rompe una placa |
| 4 | **Logger a QSPI + dump.** Adelantado a propósito: es lo que produce el dataset | Throughput y espacio |
| 5 | **Primera sesión de gimnasio grabando crudo.** Aunque el algoritmo no funcione todavía | Montaje en la barra, saturación, ruido real |
| 6 | BLE + notificaciones, validado con nRF Connect | Si el protocolo aguanta |
| 7 | Doble tap **con la carcasa armada**. Calibrar THS/SHOCK/QUIET/DUR | Si el PETG amortigua |
| 8 | Sleep, wake, transiciones, modo Viaje. Test de descarga en marcha | Consumo real |
| 9+ | Sintonizar el algoritmo contra el dataset real, seguir grabando, correr **la prueba del 95%** | Todo |

**Definir la prueba ahora, no después:** 30 series de press banca, 6-10 reps, tres cargas distintas, contra conteo por video. Precisión = 1 − (suma de |detectadas − reales| / total de reps reales). Reportar aparte los falsos positivos fuera de serie. Escribirlo en `DECISIONS.md` antes de tener los datos, para no correr el arco.

## 5. Riesgos y mitigación

| # | Riesgo | Cuándo aparece | Mitigación |
|---|---|---|---|
| 1 | **La manga de la barra gira libre.** Si el sensor va ahí, rota durante la rep y la orientación se va al diablo | Primera sesión | Montar en el eje (parte fija), fuera de las manos, dentro del collar. Verificarlo esta semana con el celular, es gratis |
| 2 | **Saturación del acelerómetro** a ±2g. Da velocidad plausible pero falsa | Silenciosa, nunca | ±8g desde el arranque + flag de saturación por muestra |
| 3 | **ODR real ≠ 208 Hz.** El oscilador tiene ~±3% y la integración es sensible al `dt` | Error sistemático de velocidad | Contar muestras contra el RTC del nRF durante 60 s y guardar un factor de calibración **por unidad** |
| 4 | **Consumo en Sleep dominado por el IMU**, no por el MCU | Test de descarga | El esquema de dos etapas de 1.7 |
| 5 | **Corriente fantasma del QSPI** (~450 µA si no se apaga bien) | Test de descarga | Usar el flash sólo en modo logger, deep power-down el resto del tiempo |
| 6 | **Doble tap intuneable** con la carcasa puesta | Día 5 | Probarlo con el dedo en la impresión de PLA de la semana 2. Plan B: relleno alto sólo en esa zona, o bajar el espesor de 1,9 a 1,2 mm |
| 7 | **Drift de integración** → velocidad que "se ve linda" y está mal | Nunca, si no se mide | ZUPT + Kinovea. No confiar en gráficos, confiar en la métrica |
| 8 | **Regresiones** al tocar umbrales: se arregla un caso y se rompen cinco | Todo el tiempo | Harness host + dataset versionado en git. Ninguna mejora se acepta sin la métrica sobre el set completo |
| 9 | **Placa perdida** por soldadura o polaridad invertida | Día 4 | Pigtail, multímetro antes de conectar, y **una placa de las tres queda intocada como referencia** |
| 10 | **Protocolo congelado tarde** → rehacer la app | Cuando ya duele | `SCHEMA_VERSION` en el byte 0 y `PROTOCOL.md` la semana 1 |
| 11 | **Reps lentas cerca del fallo** (grinders). Es el caso que más importa en VBT y el que peor detectan los algoritmos simples | Fase B | Que estén sí o sí en el dataset. Si el algoritmo sólo funciona con barra sola, no sirve para nada |

## 6. Lo que NO hacer en estas 3 semanas

- No escribir la app nativa iOS/Android. nRF Connect alcanza hasta que haya reps notificadas.
- No implementar clasificación automática de ejercicio.
- No optimizar consumo antes de medirlo.
- No portar a Zephyr.
- No soportar más de un ejercicio.
- **No implementar el emparejamiento por NFC** (ver 7). Es una comodidad, no baja ningún riesgo, y el Bluetooth funciona sin él.

Todo eso es trabajo real y necesario **después** del 95% en banca. Antes, es distracción que no baja ningún riesgo.

---

## 7. Emparejamiento por NFC — previsto, no implementado

**Qué sería.** Apoyar el teléfono contra el sensor y que se conecten solos, en
lugar de buscarlo en la lista de dispositivos Bluetooth. Es la misma
tecnología del pago sin contacto: alcance de dos o tres centímetros, sin
emparejar nada a mano. Con las manos ocupadas entre series, ahorra el paso más
molesto de todo el flujo.

**Se anuncia en la ficha técnica** de Instagram y del carrusel, marcado con
asterisco como *previsto, todavía no implementado*. **Mientras siga así, ese
asterisco no se saca.**

**Qué hace falta.** El nRF52840 trae un periférico NFC-A que funciona como
etiqueta pasiva, o sea que no consume batería mientras no haya un teléfono
cerca. El obstáculo es de configuración, no de hardware:

- En la XIAO nRF52840 Sense los pines **P0.09 y P0.10 vienen como GPIO de
  fábrica**. Se pasan a NFC con el registro `UICR.NFCPINS`, que es memoria de
  configuración de usuario: **se escribe una sola vez y hace falta borrar el
  chip entero para revertirlo**. No es un cambio que se prueba y se
  deshace.
- Esos dos pines quedan inutilizables como GPIO. Hay que verificar contra el
  esquemático de la XIAO que no los esté usando otra cosa **antes** de tocar
  el UICR.
- La antena es una espira externa sobre los dos pines. En una carcasa que ya
  lleva imanes de neodimio conviene alejarla de ellos y volver a medir el
  alcance, que es de centímetros y se degrada fácil.
- Del lado del teléfono: **Android** lee la etiqueta y puede lanzar la app con
  la dirección BLE del sensor. **iOS** también lee NFC, pero con más
  restricciones sobre qué puede disparar automáticamente; hay que confirmar
  qué permite antes de prometerlo en las dos plataformas.

**Cuándo.** Después del 95 % en press de banca, junto con el resto del trabajo
de producto. Antes de eso es una comodidad que no baja ningún riesgo, y el
UICR es de los cambios que conviene hacer cuando la placa ya no se usa para
experimentar.
