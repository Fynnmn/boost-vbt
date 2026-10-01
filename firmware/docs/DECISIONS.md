# DECISIONS.md — decisiones de diseño y por qué

Una entrada por decisión. Si algo acá resulta equivocado con datos reales, se corrige la entrada y se anota qué la cambió. Lo importante es que quede el motivo, no sólo la conclusión.

## D1 — Flujo de uso: el usuario nunca toca el sensor

**Decidido el 26 de agosto de 2026.** Es el diseño oficial de la experiencia.

Abrís la app y el sensor ya aparece conectado. Elegís ejercicio y peso. Apretás empezar. Ponés el sensor en la barra y te acomodás; mientras tanto se calibra solo. Luz verde. Hacés la serie. Apoyás la barra y a los quince segundos te muestra el resumen.

En ningún momento hay que tocar el sensor.

### Por qué no puede despertarlo el Bluetooth

Para escuchar, la radio tiene que estar encendida, y encendida consume. No existe escuchar BLE gratis desde el sueño profundo: si el sensor duerme de verdad, el celular no lo alcanza. Es física del radio, no una limitación del nRF52840.

**La solución es invertirlo: que el sensor avise en vez de escuchar.** Anuncia un paquete corto cada segundo. El celular lo encuentra al instante y el usuario no toca nada.

**Corrección respecto de la primera estimación.** Los ~25 µA son sólo la radio. El estado completo suma el IMU vigilando movimiento (25 µA), el MCU (2 µA) y la flash dormida (1 µA): **53 µA en total**, que con 350 mAh dan **275 días**, no "más de un año".

En uso realista —una hora de entrenamiento por día y el resto anunciando— la cuenta da **58 días entre cargas**. Ese es el número que corresponde comunicar: es el que va a vivir el usuario.

Todo esto sale de `src/app/power.cpp` y está verificado por tests, pero **son corrientes de datasheet**. Reemplazarlas por medidas reales después del test de descarga. Si el número real resulta mucho peor, el plan B es anunciar cada 2 segundos: duplica la autonomía y agrega un segundo de espera al conectar.

### Las tres ventanas de sueño

| Situación | Comportamiento | Cómo se despierta |
|---|---|---|
| Menos de 24 h desde la última conexión | Anuncia cada 1 s | Solo, no hace falta nada |
| Más de 24 h | Sueño profundo, IMU vigilando movimiento | Doble toque, o movimiento validado |
| Más de 7 días | Modo viaje | Sólo doble toque |

En la rutina normal de alguien que entrena, la primera fila cubre todo: el doble toque queda como respaldo y no como método principal. La segunda protege al que deja el sensor guardado una semana. La tercera resuelve el problema de "se me prendió solo en el bolso".

## D2 — El usuario avisa cuándo empieza la serie

No es sólo comodidad de interfaz. Le saca al algoritmo el trabajo más difícil: distinguir una repetición de alguien acomodando la barra, ajustando el agarre o cargando discos.

Por la misma razón, la app también informa **qué ejercicio** es. Clasificarlo automáticamente es un problema aparte, bastante más difícil que contar reps, y no entra en la versión 1.

## D3 — Calibración automática al empezar la serie

**Es la decisión con más impacto técnico de las tomadas hoy.**

El sensor acumula error al integrar aceleración. Parte de ese error es un offset fijo que se puede medir, pero **sólo mientras el sensor está quieto**.

Esto explica un problema concreto que apareció en las pruebas: el detector perdía sistemáticamente la primera repetición de cada serie, porque todavía no había tenido tiempo de medir su propio offset.

Entre que el usuario aprieta "empezar" y levanta la barra siempre pasan unos segundos con la barra apoyada. Ahí se calibra, sin pedirle nada a nadie.

**No se le pide al usuario que espere.** Pedir dos segundos quieto antes de cada serie es fricción que nadie tolera en la serie número doce. Si la calibración no llega a completarse, la serie arranca igual y las reps salen marcadas con una advertencia. **El firmware informa, la app decide** — nunca se descarta una repetición en el sensor.

## D4 — La serie termina sola por inactividad

Quince segundos sin movimiento significativo y se cierra, con resumen. Configurable por BLE.

Queda además un botón de terminar manual en la app, porque a veces uno se queda charlando con la barra en la mano y no quiere que corte.

## D5 — Al llenarse la memoria, se detiene; no sobrescribe

Un buffer circular que pisa lo viejo parece más prolijo, pero si se llena a mitad de una sesión de gimnasio te deja el final y se come el principio **sin avisar**, y te enterás en casa cuando ya no podés repetir esas series.

Detenerse y encender el LED es más feo y más honesto: te enterás en el momento, cuando todavía podés descargar y seguir.

## D6 — El algoritmo corre en el firmware, no en la app

Es el activo del negocio: en la app quedaría expuesto. Además evita depender de la latencia del Bluetooth, y procesar 208 muestras por segundo en el nRF52840 es más confiable que mandarlas crudas al teléfono.

Consecuencia: aunque algún día la app sea open source, el algoritmo no queda alcanzado.

## D7 — El detector nunca descarta una repetición

Una rep dudosa se notifica igual, marcada con una bandera de calidad. Descartar en el sensor esconde justo la información que hace falta para depurar, y deja al usuario sin entender por qué no le contó una rep que él sintió.

## D8 — Ninguna mejora del algoritmo se acepta sin la métrica completa

Dos cambios que parecían mejoras claras tiraron el conteo de 89,5% a 78,9% y a 15,8% respectivamente. **A ojo los dos parecían correctos.**

Toda modificación de umbrales se mide contra el dataset entero, y se reporta contra un conjunto de validación que no se usó para calibrar. La diferencia entre esos dos números es la que dice cuánto hay de sobreajuste.

## D9 — La prueba que decide el proyecto

30 series de press banca, 6-10 repeticiones, tres cargas distintas, contra conteo por video cuadro por cuadro.

```
precisión = 1 − (suma de |detectadas − reales|) / (total de reps reales)
```

Los falsos positivos de las grabaciones negativas se reportan **aparte**: mezclarlos con el conteo esconde el peor error posible, que es contar repeticiones cuando el usuario ni siquiera está entrenando.

Escrito antes de tener los datos, a propósito, para no correr el arco después.

## Pendientes de verificar con hardware

- Los pines de alimentación del IMU (P1.08) y de interrupción (P0.11) salen del `variant.h` de Seeed. **Verificar contra el board package real el día 1**: cambian entre revisiones de placa.
- Consumo real en cada modo, con test de descarga completo.
- Los cuatro parámetros del doble toque, con la carcasa armada.
- Si el PETG al 25% de relleno amortigua demasiado el golpe.
