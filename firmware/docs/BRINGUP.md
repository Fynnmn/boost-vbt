# BRINGUP.md — el guion del día que llegan las placas

El tiempo con hardware es el recurso caro del proyecto. Este documento existe para que ese primer día no se vaya en descubrir cosas que se podían saber de antes.

**Regla: no saltear pasos.** Cada uno descarta una causa. Si el paso 5 falla y saltaste el 2, no sabés si el problema es el paso 5 o algo de antes.

**Antes de empezar:** tenés tres placas. Una queda **intocada como referencia**. Si algo raro pasa con la que estás usando, poder comparar contra una placa virgen ahorra horas.

## Paso 0 — Antes de conectar nada

- [ ] Verificar las tres reglas del pedido: dice **Sense**, menciona **IMU de 6 ejes**, los datasheets incluyen **LSM6DS3TR**.
- [ ] Instalar PlatformIO y el board package de Seeed.
- [ ] **Abrir el `variant.h` real** del board package instalado y comparar con `src/platform/board.h`:
  - `PIN_LSM6DS3TR_C_POWER` (asumido P1.08)
  - `PIN_LSM6DS3TR_C_INT1` (asumido P0.11)
  - `VBAT_ENABLE` (asumido P0.14)
  - `PIN_VBAT` (asumido P0.31)
  - La relación del divisor de tensión
- [ ] Anotar cualquier diferencia en `DECISIONS.md` y corregir `board.h`.

Esto es lo primero por una razón: **si los pines están mal, todo lo demás falla de formas confusas** y se pierde media jornada creyendo que la placa vino fallada.

## Día 1 — Que encienda y que el IMU conteste

Sin batería todavía. Sólo USB.

- [ ] `pio run -e xiaoblesense -t upload`. Si no aparece el puerto: doble toque rápido al botón de reset para entrar al bootloader.
- [ ] El LED enciende. **Si arranca todo prendido y se apaga cuando debería iluminar, la inversión de ánodo común está mal** — se arregla en `writeLed()` de `platform.cpp`, y en ningún otro lado.
- [ ] Serial a 115200 muestra el arranque.
- [ ] **`WHO_AM_I` devuelve `0x6A`.**

### Si el `WHO_AM_I` falla

| Valor | Significado más probable |
|---|---|
| `0x00` o `0xFF` | El pin de alimentación del IMU no es el que dice `board.h`, o falta el delay de 20 ms |
| `0x69` | Es un LSM6DS3 común, no el TR-C. Placa equivocada |
| Sin ACK | Cableado del I2C, o el IMU sigue sin alimentación |

El primer caso es el más común y es el que cuesta medio día si no se sabe de antes.

## Día 2 — Que los datos tengan sentido

- [ ] Activar `MODE_RAWSTREAM` y volcar muestras crudas por serial.
- [ ] **Sensor quieto sobre la mesa: un eje tiene que marcar ~4098 cuentas** (1 g a ±8 g) y los otros dos cerca de cero.
- [ ] Girarlo: el eje que marca 1 g tiene que cambiar. Anotar **qué eje es cuál** — si el montaje en la barra no coincide con lo que asume el algoritmo, todo lo demás da mal.
- [ ] Contar muestras durante 60 segundos contra el reloj: tienen que ser **~12.480** (208 Hz). Si difiere más del 1%, guardar el factor de corrección en `ODR_CALIB_PPM`. El oscilador del IMU tiene ±3% y la integración es sensible al `dt`.
- [ ] Golpear la mesa fuerte y verificar que **ningún eje llegue a ±32767**. Si satura con golpes normales, revisar que el fondo de escala sea ±8 g y no ±2 g.

## Día 3 — Batería

**Cuidado, esto es lo único peligroso del proyecto.**

- [ ] **Verificar la polaridad con el multímetro** antes de conectar nada. Rojo a +, negro a −. Al revés se quema la placa.
- [ ] Nunca cortar los dos cables de la LiPo juntos con la tijera. Uno, aislarlo, después el otro.
- [ ] Soldar el pigtail JST-PH a los pads BAT+ / BAT− de abajo de la placa.
- [ ] Conectar y verificar que `readBatteryMillivolts()` dé un valor coherente con lo que mide el multímetro. Si difiere, la relación del divisor en `board.h` está mal.
- [ ] Cargar por USB con supervisión. El LED naranja de carga lo maneja el chip solo.

## Día 4 — El logger

Es la ruta crítica: sin esto no hay dataset.

- [ ] `MODE_LOGGER` on, grabar 30 segundos, off.
- [ ] `python tools/dump_log.py --imagen <volcado> --listar` tiene que mostrar la sesión con la cantidad de muestras correcta.
- [ ] Extraer a `.vbt` y correr `make replay ARCHIVO=...`. Aunque no detecte reps, el archivo tiene que leerse.
- [ ] Desconectar la batería a mitad de una grabación y verificar que `dump_log.py` marque la sesión como `RECUPERADA` y rescate los datos.

## Día 5 — Primera sesión de gimnasio

**Aunque el algoritmo todavía no funcione.** Grabar crudo es lo que produce el dataset, y el dataset es lo que hace falta para que el algoritmo funcione. No esperes a que ande.

- [ ] Montar el sensor **en el eje de la barra, no en la manga**. La manga gira libre: si el sensor rota durante la repetición, la orientación se va al diablo. Verificarlo con la mano antes de cargar peso.
- [ ] Celular en trípode, perpendicular al plano de la barra, 60 fps mínimo.
- [ ] Dos golpes secos en la barra antes de cada serie: es el punto de sincronización entre el video y la señal.
- [ ] Grabar el JSON de metadata de cada serie. **Sin metadata, una grabación es casi inútil seis meses después.**
- [ ] Grabar también las **negativas**: montar y desmontar la barra, ajustar el agarre, caminar con el sensor en la mano, dejarlo en el bolso.

## Día 6 — Doble toque

- [ ] Imprimir y armar la carcasa en PETG.
- [ ] Calibrar `TAP_THS`, `TAP_SHOCK`, `TAP_QUIET` y `TAP_DUR` **con la carcasa puesta**. Los valores del datasheet no sirven: lo que importa es cómo transmite el plástico.
- [ ] Verificar que el bolsillo no lo dispare: meter el sensor en el bolsillo y caminar cinco minutos.
- [ ] Anotar los valores finales en `CALIBRATION.md`.

Si el PETG amortigua demasiado: subir el relleno sólo en esa zona, o bajar el espesor de la tapa en el modelo (`hardware/carcasa/BOOST.3mf`, ver `hardware/PROTOTIPO.md`).

## Día 7 — Consumo real

- [ ] Instrumentar el firmware para acumular tiempo en cada modo.
- [ ] Test de descarga completo: cargar a full, dejar en modo anunciando, medir cuánto tarda en llegar al corte.
- [ ] **Comparar contra las estimaciones de `src/app/power.cpp`** y reemplazar los números de datasheet por los medidos.
- [ ] Si el consumo en reposo es mucho mayor a lo estimado, el sospechoso número uno es la flash sin `deep power-down` (450 µA), y el número dos es el detector de tap quedándose armado.

## Día 8 y siguientes — La prueba que decide el proyecto

- [ ] Recalibrar los umbrales del algoritmo contra el dataset real. `VBT_ZUPT_ACC` es el más sensible.
- [ ] Correr `make metrics` sobre las grabaciones reales.
- [ ] Reportar **dos números**: el del set con el que calibraste y el de un conjunto que no usaste para calibrar. La diferencia es sobreajuste.
- [ ] 30 series de press banca contra conteo por video. **El objetivo es 95%.**

Si sale: hay negocio y vale invertir meses. Si no sale: costó menos de cien dólares y aprendiste firmware embebido, procesamiento de señales y diseño de producto.

## Qué NO hacer esta semana

- No escribir la app nativa. **nRF Connect for Mobile** valida el GATT entero sin escribir una línea.
- No optimizar el consumo antes de medirlo.
- No agregar más ejercicios hasta que el press banca llegue al 95%.
