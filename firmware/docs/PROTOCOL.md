# PROTOCOL.md — contrato BLE del sensor VBT

> **Versión de esquema: 1.** Congelado el 26 de agosto de 2026.
>
> Este documento es el contrato entre tres cosas: el firmware (`src/ble/protocol.h`), la app nativa, y las herramientas de Python (`tools/decode.py`). Los tres tienen que estar de acuerdo. **Si cambiás algo acá, se incrementa `SCHEMA_VERSION` y se actualizan los tres.**

## Reglas generales

**Endianness:** little-endian en todo. Es el orden nativo del Cortex-M4 y del ARM del celular, así que no hay conversión en ninguna punta.

**Alineación:** todos los structs son `packed`. No confiar en el padding del compilador.

**Versionado:** el primer byte de todo payload es `SCHEMA_VERSION`. Cuesta un byte de veinte y evita que el primer cambio de formato rompa la app de todos los usuarios. La app descarta silenciosamente cualquier payload con una versión que no conoce.

**Tamaño:** los payloads de notificación entran en **20 bytes**, que es el máximo garantizado con el MTU por defecto de BLE (23 bytes menos 3 de encabezado ATT). El firmware negocia MTU de 247 para `RawStream` y `LogDump`, pero **el resto funciona aunque la negociación falle**.

**Unidades enteras, nunca float en el aire:**

| Magnitud | Unidad en el protocolo | Rango útil |
|---|---|---|
| Velocidad | mm/s (`u16`) | 0 a 65,5 m/s |
| Distancia / ROM | mm (`u16`) | 0 a 65,5 m |
| Duración | ms (`u16` o `u32`) | |
| Carga | `u16`, kg × 10 | 0 a 6553,5 kg |
| Porcentaje con decimal | `u16`, valor × 10 | 0 a 6553,5 % |
| Tensión | mV (`u16`) | |

Los enteros evitan discrepancias de punto flotante entre el micro y el teléfono, y ocupan menos.

## Servicios

| Servicio | UUID | Por qué |
|---|---|---|
| Battery Service | `0x180F` (SIG) | iOS y Android muestran la batería del sensor en los ajustes del sistema **sin escribir una línea en la app** |
| Device Information | `0x180A` (SIG) | Versión de firmware y número de serie. Necesario para soporte y para OTA |
| VBT Service | `7d4e1a00-9b3f-4c62-a5d8-6e1f2c3b4a59` | Lo nuestro |

### Characteristics del VBT Service

Todas comparten la base `7d4e1aXX-9b3f-4c62-a5d8-6e1f2c3b4a59`.

| XX | Nombre | Propiedades | Tamaño |
|---|---|---|---|
| `01` | `RepResult` | Notify | 20 B |
| `02` | `SetSummary` | Notify | 20 B |
| `03` | `Control` | Write | 2 a 20 B |
| `04` | `Config` | Read, Write | 8 B |
| `05` | `Status` | Notify, Read | 20 B |
| `06` | `RawStream` | Notify | hasta 244 B |
| `07` | `LogDump` | Notify | hasta 244 B |

## Advertising

Nombre: `VBT-XXXX`, donde `XXXX` son los últimos 4 dígitos hexadecimales del ID único del nRF52840. El UUID del VBT Service va en el scan response, para que la app pueda filtrar y no le muestre al usuario todos los auriculares del gimnasio.

**El sensor anuncia mientras esté en uso, para que el usuario no tenga que tocarlo nunca.**

Bluetooth no puede despertar un dispositivo dormido: para escuchar, la radio tiene que estar encendida, y encendida consume. La solución es invertirlo — que el sensor **avise** en vez de escuchar.

| Desde la última conexión | Comportamiento | Cómo se despierta |
|---|---|---|
| Menos de `ADV_WINDOW_MIN` (24 h) | Anuncia cada 1 s | Solo |
| Más de 24 h | Sueño profundo | Doble toque, o movimiento validado |
| Más de `TRAVEL_TIMEOUT_MIN` (7 días) | Modo viaje | Sólo doble toque |

Anunciar cada segundo cuesta 53 µA de promedio contando todo el sistema (estimado, a confirmar con el test de descarga), que con 350 mAh dan unos 275 días. En uso realista, con una hora diaria de entrenamiento, la cuenta da 58 días entre cargas. En la rutina normal de alguien que entrena, el doble toque queda como respaldo y no como método principal.

Ver `docs/DECISIONS.md`, entrada D1.

## RepResult — 20 bytes

Se notifica una vez por repetición completada, apenas se detecta el fin de la concéntrica.

| Offset | Tipo | Campo | Nota |
|---|---|---|---|
| 0 | `u8` | `schema` | Siempre 1 |
| 1 | `u8` | `rep_index` | 1-based dentro de la serie |
| 2 | `u16` | `mean_conc_vel` | Velocidad media concéntrica, mm/s. **La métrica principal de VBT** |
| 4 | `u16` | `mean_prop_vel` | Velocidad media propulsiva, mm/s. Sólo el tramo donde la aceleración supera a −g |
| 6 | `u16` | `peak_vel` | Velocidad pico, mm/s |
| 8 | `u16` | `rom` | Rango de movimiento, mm |
| 10 | `u16` | `conc_dur_ms` | Duración de la concéntrica |
| 12 | `u16` | `ecc_dur_ms` | Duración de la excéntrica |
| 14 | `u16` | `pause_ms` | Pausa entre excéntrica y concéntrica (en banca, el tiempo en el pecho) |
| 16 | `u8` | `quality_flags` | Ver abajo |
| 17 | `u8` | `peak_vel_pos` | Posición del pico como % del ROM (0-100). Describe el perfil de fuerza |
| 18 | `u8` | `set_index` | Para reasociar si llegan notificaciones fuera de orden |
| 19 | `u8` | `reserved` | Cero |

### quality_flags (bitfield)

| Bit | Significado | Qué hace la app |
|---|---|---|
| 0 | `SATURATED` — el acelerómetro llegó al fondo de escala | Marcar la rep como no confiable |
| 1 | `WEAK_ZUPT` — no se encontró un instante de reposo claro antes de la rep | La velocidad puede tener drift |
| 2 | `ROM_OUTLIER` — el ROM difiere mucho del de las reps anteriores de la serie | Mostrar con advertencia |
| 3 | `HIGH_ROTATION` — el giroscopio detectó rotación importante | El sensor puede estar mal montado |
| 4 | `LOW_CONFIDENCE` — contada, pero cerca del umbral | |
| 5-7 | reservados | |

**Los flags nunca hacen que el firmware descarte una rep.** El firmware informa, la app decide. Descartar en el sensor esconde información que sirve para depurar.

## SetSummary — 20 bytes

Se notifica al cerrar la serie (`SET_STOP`, o timeout de inactividad).

| Offset | Tipo | Campo | Nota |
|---|---|---|---|
| 0 | `u8` | `schema` | |
| 1 | `u8` | `set_index` | |
| 2 | `u8` | `rep_count` | |
| 3 | `u8` | `exercise_id` | Ver tabla de ejercicios |
| 4 | `u16` | `best_mean_vel` | mm/s |
| 6 | `u16` | `first_rep_vel` | mm/s |
| 8 | `u16` | `last_rep_vel` | mm/s |
| 10 | `u16` | `velocity_loss_x10` | Pérdida de velocidad %, × 10. **El indicador de fatiga de la serie** |
| 12 | `u16` | `load_kg_x10` | Carga que informó la app |
| 14 | `u32` | `duration_ms` | |
| 18 | `u8` | `flags` | OR de todos los `quality_flags` de la serie |
| 19 | `u8` | `reserved` | |

`velocity_loss` se calcula contra la mejor rep de la serie, no contra la primera: si la primera rep salió mal, no arrastra el cálculo entero.

## Control — write, 2 a 20 bytes

Byte 0 = `schema`, byte 1 = opcode, el resto es el payload del opcode.

| Opcode | Nombre | Payload | Qué hace |
|---|---|---|---|
| `0x01` | `SET_START` | `u8 exercise_id`, `u16 load_kg_x10` | Empieza a contar una serie |
| `0x02` | `SET_STOP` | — | Cierra la serie y notifica `SetSummary` |
| `0x03` | `SLEEP` | — | Duerme ya, sin esperar el timeout |
| `0x04` | `MODE_LOGGER` | `u8 enable` | Graba crudo al QSPI. **El modo que produce el dataset** |
| `0x05` | `MODE_RAWSTREAM` | `u8 enable` | Manda crudo por BLE en vivo. Come batería, es para debug |
| `0x06` | `SET_TIME` | `u32 unix_s` | Sincroniza el reloj para etiquetar las sesiones del log |
| `0x07` | `LOG_ERASE` | — | Borra el QSPI entero |
| `0x08` | `LOG_DUMP` | `u16 session_index` | Vuelca una sesión por `LogDump` |
| `0x09` | `CALIB_ODR` | — | Cuenta muestras contra el RTC 60 s y guarda el factor de corrección |
| `0x0A` | `FACTORY_RESET` | — | Restaura la config por defecto |
| `0x0B` | `LOG_LIST` | — | Enumera las sesiones grabadas por `LogDump` |

Opcode desconocido: el firmware lo ignora y lo informa en `Status.last_error`. Nunca se cuelga ni se resetea por un comando que no entiende.

## Config — read/write, 8 bytes

Esquema clave-valor, no un struct fijo. Es a propósito: **agregar un parámetro nuevo no cambia el `SCHEMA_VERSION`** y no rompe nada.

| Offset | Tipo | Campo |
|---|---|---|
| 0 | `u8` | `schema` |
| 1 | `u8` | `param_id` |
| 2 | `u8` | `param_type` (0=`u8`, 1=`u16`, 2=`i16`, 3=`u32`, 4=`float`) |
| 3 | `u8` | `reserved` |
| 4-7 | 4 B | valor |

Para leer: se escribe el `param_id` con `param_type = 0xFF` y después se lee la característica.

| `param_id` | Parámetro | Tipo | Default |
|---|---|---|---|
| `0x10` | `TAP_THS` | `u8` | a calibrar |
| `0x11` | `TAP_SHOCK` | `u8` | a calibrar |
| `0x12` | `TAP_QUIET` | `u8` | a calibrar |
| `0x13` | `TAP_DUR` | `u8` | a calibrar |
| `0x20` | `WAKE_THS_MG` | `u16` | 2000 |
| `0x21` | `WAKE_DUR_MS` | `u16` | 2000 |
| `0x30` | `ODR_HZ` | `u16` | 208 |
| `0x31` | `ACCEL_FS_G` | `u8` | 8 |
| `0x32` | `GYRO_FS_DPS` | `u16` | 1000 |
| `0x33` | `ODR_CALIB_PPM` | `i16` | 0 |
| `0x40` | `REP_MIN_ROM_MM` | `u16` | 150 |
| `0x41` | `REP_MAX_ROM_MM` | `u16` | 800 |
| `0x42` | `REP_MIN_DUR_MS` | `u16` | 200 |
| `0x43` | `REP_MAX_DUR_MS` | `u16` | 6000 |
| `0x44` | `ZUPT_ACC_TOL_MG` | `u16` | 20 |
| `0x45` | `ZUPT_GYR_TOL_MDPS` | `u16` | 3000 |
| `0x50` | `SLEEP_TIMEOUT_S` | `u16` | 300 |
| `0x51` | `TRAVEL_TIMEOUT_MIN` | `u16` | 10080 (7 días) |
| `0x52` | `LED_BRIGHTNESS` | `u8` | 40 |
| `0x53` | `ADV_WINDOW_MIN` | `u16` | 1440 (24 h) |
| `0x54` | `SET_END_TIMEOUT_S` | `u16` | 15 |
| `0x55` | `CALIB_MIN_MS` | `u16` | 1200 |

**Por qué esto importa más de lo que parece:** poder cambiar umbrales por BLE significa **calibrar en el gimnasio, con la barra en la mano, sin recompilar ni volver a la computadora.** Es la diferencia entre iterar diez veces en una sesión o dos veces por semana.

### Validación

Cada escritura se valida contra `VBT_PARAM_SPECS` en `src/ble/protocol.h`, que es la fuente de verdad de rangos, tipos y defaults. Se rechaza con `BAD_PARAM`:

- un `param_id` que no existe;
- un `param_type` distinto del que declara la tabla (antes se ignoraba, y escribir un `u8` declarando `float` reinterpretaba los bytes en silencio);
- un parámetro marcado de sólo lectura;
- un valor fuera de `[min, max]`;
- un valor que deja una **ventana vacía** contra su par: `REP_MIN_ROM_MM ≥ REP_MAX_ROM_MM` o `REP_MIN_DUR_MS ≥ REP_MAX_DUR_MS`. Cada uno por separado puede estar en rango y juntos dejar al sensor sin contar una sola repetición, así que se comprueba antes de aplicar.

Esto no es defensa contra un atacante: es que **el sensor es el único control real.** Cualquiera con un celular puede escribir bytes arbitrarios en la característica, y un límite en la app sólo limita a la app. `ZUPT_ACC_TOL_MG = 65535` son 65 g de tolerancia: todo parece quieto y el sensor deja de contar para siempre, sin ningún síntoma que apunte a la causa.

`ODR_HZ`, `ACCEL_FS_G`, `GYRO_FS_DPS` y `ODR_CALIB_PPM` son de **sólo lectura**: cambiarlos en caliente obliga a reconfigurar el IMU y tirar el FIFO en medio de una serie, y dejaría inválidas las escalas ya escritas en el header de las grabaciones. Se leen para que la app sepa contra qué está midiendo.

Los cuatro del doble tap y los de wake **no llegan a los registros del chip en el momento**: el sensor puede estar en medio de una serie. Quedan guardados, el Status prende `CONFIG_DIRTY`, y se aplican en el próximo cambio de modo. La app lo dice en pantalla en vez de mostrar el valor nuevo como si ya estuviera en uso.

La app espeja la tabla en `app/js/params.js`, **generado** desde este header con `node tools/gen_config_js.mjs`. `make params` falla si quedaron desincronizados.

Los valores se guardan en flash interna y sobreviven al reinicio.

## Status — 20 bytes

Se notifica al conectar, en cada cambio de estado, y cada 10 s mientras está conectado.

| Offset | Tipo | Campo |
|---|---|---|
| 0 | `u8` | `schema` |
| 1 | `u8` | `state` |
| 2 | `u8` | `battery_pct` |
| 3 | `u8` | `flags` |
| 4 | `u16` | `battery_mv` |
| 6 | `u8` | `rep_count` (serie en curso) |
| 7 | `u8` | `exercise_id` |
| 8 | `u32` | `uptime_s` |
| 12 | `u32` | `log_free_bytes` |
| 16 | `u16` | `fw_version` (mayor en el byte alto, menor en el bajo) |
| 18 | `u8` | `last_error` |
| 19 | `u8` | `reserved` |

### state

| Valor | Estado | LED |
|---|---|---|
| 0 | `SLEEP` | apagado |
| 1 | `ADVERTISING` | azul parpadeando |
| 2 | `CONNECTED_IDLE` | azul fijo |
| 3 | `RECORDING` | verde |
| 4 | `LOGGER` | verde parpadeando |
| 5 | `TRAVEL` | apagado |
| 6 | `ERROR` | rojo rápido |
| 7 | `CALIBRATING` | azul parpadeando rápido |

`CALIBRATING` se agregó después de congelar el esquema. **No sube `SCHEMA_VERSION`**: agregar un valor a un enum no cambia el tamaño ni el orden de ningún campo, así que una app vieja simplemente ve un estado que no conoce. Cambiar el *layout* sí obligaría a subir la versión.

Batería por debajo del 15%: rojo parpadeando lento, superpuesto a cualquier estado.

### flags de Status

| Bit | Significado |
|---|---|
| 0 | `IMU_OK` |
| 1 | `CHARGING` |
| 2 | `LOG_FULL` |
| 3 | `SATURATED_RECENTLY` |
| 4 | `CONFIG_DIRTY` (hay cambios sin guardar en flash) |
| 5 | `CALIBRATED` (la serie arrancó con calibración completa) |

Si `CALIBRATED` está en cero, la serie arrancó sin que el sensor llegara a medir su propio offset: las velocidades de esa serie tienen más error y las reps vienen marcadas con `WEAK_ZUPT`. La app debería mostrarlas con una advertencia, no ocultarlas.

## RawStream y LogDump — hasta 244 bytes

Los dos usan el mismo formato de lote. Requieren MTU negociado de 247; si la negociación falla, el firmware manda lotes de 1 muestra y avisa por `Status.last_error`.

| Offset | Tipo | Campo |
|---|---|---|
| 0 | `u8` | `schema` |
| 1 | `u8` | `count` (muestras en este lote) |
| 2 | `u16` | `seq` (número de lote, para detectar pérdidas) |
| 4 | `u32` | `t0_us` (timestamp de la primera muestra del lote) |
| 8+ | `count` × 12 B | muestras |

Cada muestra son 12 bytes, seis `i16`: `ax, ay, az, gx, gy, gz`, **crudos del IMU, sin convertir**.

Con MTU 247 entran **19 muestras por lote**, o sea 11 notificaciones por segundo a 208 Hz.

### Valores especiales de `count`

Como nunca entran más de 19 muestras, de 20 para arriba queda libre para señalizar sin agrandar el encabezado ni subir el `SCHEMA_VERSION`:

| `count` | Significado |
|---|---|
| `0xFE` | El payload son **32 bytes de header de sesión** — exactamente el header de un archivo `.vbt` |
| `0xFF` | **Fin del volcado.** `t0_us` no es un timestamp: lleva el total enviado (o la cantidad de sesiones, en `LOG_LIST`) |

Sin la marca de fin, la app se queda esperando para siempre un lote que no viene, que desde afuera se ve igual que un sensor colgado.

### El volcado

`LOG_DUMP` manda: un lote `0xFE` con el header, después los lotes de muestras, y al final uno `0xFF`. `LOG_LIST` manda un `0xFE` por sesión y cierra con `0xFF`. La app usa un solo parser para los dos.

Se rechaza con error, sin mandar nada:

- una sesión **abierta** (`sample_count == 0xFFFFFFFF`): se cortó la energía en medio de la grabación y no se sabe dónde termina, así que volcarla mandaría basura hasta el final de la flash — y el archivo parecería válido;
- un índice que no existe;
- volcar **mientras se graba o se borra**: leer y escribir la misma flash a la vez pelea por el bus;
- MTU sin negociar: 8 + 32 bytes no entran en el MTU por defecto de 23, y la notificación se descartaría entera.

Se manda de a unos pocos lotes por vuelta del lazo, nunca en un bucle: un volcado son megabytes y hacerlo de una deja al sensor sordo a los comandos durante minutos. Si la cola de notificaciones está llena, **se reintenta el mismo tramo** — avanzar igual perdería muestras en silencio.

**No hay retransmisión.** Lo que BLE pierde, se perdió. Por eso el cierre lleva el total: la app compara contra lo que recibió y, si falta algo, corrige el `sample_count` del archivo a lo que de verdad tiene y lo marca. Un `.vbt` cuyo header no describe su propio contenido es una trampa para toda herramienta que lo lea.

La lógica vive en `src/app/log_dumper.cpp` y no en `main.cpp` a propósito: `main.cpp` necesita Arduino y el build de PC no lo compila, así que ahí quedaría sin una sola prueba. `test/host/test_log_dumper.cpp` la corre contra una flash y un stack falsos.

**Los datos van crudos a propósito.** Convertir a unidades físicas en el micro gasta ciclos, pierde precisión y esconde la saturación. Las escalas se aplican en la PC:

| Fondo de escala | LSB |
|---|---|
| Accel ±8 g | 0,244 mg |
| Gyro ±1000 dps | 35 mdps |

Un valor de ±32767 en cualquier eje significa saturación. `tools/decode.py` tiene que marcarlo.

## Tabla de ejercicios

| `exercise_id` | Ejercicio |
|---|---|
| 0 | Genérico / desconocido |
| 1 | Press banca |
| 2 | Sentadilla |
| 3 | Peso muerto |
| 4 | Press militar |
| 5 | Remo con barra |
| 6 | Hip thrust |

**El firmware no adivina el ejercicio, se lo dice la app.** Clasificarlo automáticamente es un problema aparte y bastante más difícil que detectar reps; no entra en la versión 1.

## Códigos de error (`last_error`)

| Código | Significado |
|---|---|
| 0 | Sin error |
| 1 | IMU no responde en I2C |
| 2 | `WHO_AM_I` incorrecto |
| 3 | Overrun del FIFO |
| 4 | QSPI lleno |
| 5 | QSPI no responde |
| 6 | Opcode de Control desconocido |
| 7 | `param_id` de Config desconocido |
| 8 | Negociación de MTU falló |
| 9 | Batería crítica, apagando |

## Cambios pendientes de decidir

Anotados acá para que no se pierdan y para que la app deje lugar:

- **OTA DFU:** el bootloader de Adafruit ya viene en la placa y expone su propio servicio. No hace falta nada en este protocolo, pero la app va a necesitar reiniciar el sensor en modo bootloader. Falta un opcode `ENTER_DFU`.
- **Estimación de 1RM:** requiere perfil carga-velocidad por usuario. Es cálculo de la app, no del sensor.
- **Múltiples sensores a la vez** (uno por lado de la barra, para detectar desbalance). El protocolo no lo impide, pero no está pensado. No es para la versión 1.
