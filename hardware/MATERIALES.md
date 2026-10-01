# Lista de materiales — sensor VBT

> Actualizado 26 de agosto de 2026. Ventana de compra: ahora. Llegada estimada a EE.UU.: mediados de septiembre.
> Reemplaza la sección 7 del documento de contexto.

## Cambio de estrategia respecto al plan anterior

El plan original era comprar la placa y las baterías en **AliExpress**. Investigando precios reales aparecieron dos cosas que lo mejoran:

**1. Seeed Studio vende directo con almacén en Estados Unidos.**
El pack de 3 XIAO nRF52840 Sense cuesta **US$40,41** en la tienda oficial contra US$53,49 en Amazon. Y comprando en la fuente **desaparece el riesgo del error más repetido del proyecto**: en seeedstudio.com la variante Sense está en su propia página de producto, no hay listados ambiguos de terceros donde confundirse. Entrega doméstica en EE.UU. en días, no 4-8 semanas desde China.

**2. Adafruit tiene la batería exacta que necesitamos.**
La 3,7 V 350 mAh de Adafruit mide **36 × 19,6 × 5,2 mm**, ya trae **protección integrada** y **conector JST-PH 2.0 soldado de fábrica**. En la carcasa anterior (la paramétrica de 42 × 28 × 18 mm, ya descartada) la cavidad era de 37 × 23 mm y entraba con margen. **El prototipo actual mide 57 × 31 × 17 mm** (`PROTOTIPO.md`): hay que volver a verificar la cavidad contra la batería con calibre.

Conclusión: **AliExpress deja de ser necesario para lo crítico**. Se paga entre US$10 y US$15 más que el precio chino, y a cambio se elimina el riesgo de placa equivocada, batería sin protección, batería del espesor incorrecto y demora de importación. Con un mes de plazo y una carcasa ya cotada, no vale la pena ahorrar diez dólares para descubrir en septiembre que la batería mide 7 mm.

## Pedido A — Seeed Studio (almacén EE.UU.)

| Ítem | Cantidad | Precio unitario | Subtotal |
|---|---|---|---|
| XIAO nRF52840 **Sense**, pack de 3 | 1 pack | US$40,41 | US$40,41 |

**Link:** seeedstudio.com → "Seeed Studio XIAO nRF52840 Sense (3PCS)", producto p-5922.

**Al pagar, elegir el almacén de Estados Unidos**, no el de China. Es un selector en la página; si queda en China se pierde toda la ventaja.

**No comprar la versión "Pre-Soldered" (US$16,90).** Viene con los headers de pines ya soldados, y esos headers levantan la placa unos 8-10 mm. La carcasa tiene 17 mm de espesor total (`PROTOTIPO.md`) con la batería y el PCB apilados: con headers no cierra. Se necesita la placa pelada, y los pocos cables (batería y nada más) se sueldan directo a los pads.

**Por qué 3 y no 1:** una se va a romper. Se sueldan cables finitos a pads chiquitos, se prueba deep sleep, se conecta polaridad al revés alguna vez. Tres placas a US$13,47 cada una es el seguro más barato del proyecto. Además permite dejar una armada de referencia mientras se experimenta con otra.

## Pedido B — Adafruit (envío doméstico EE.UU.)

| Ítem | Cantidad | Precio unitario | Subtotal |
|---|---|---|---|
| LiPo 3,7 V 350 mAh, JST-PH 2.0, con protección (producto 2750) | 2 | US$6,95 | US$13,90 |
| Cable JST-PH 2.0 hembra con puntas peladas (pigtail) | 2 | ~US$0,95 | ~US$1,90 |

**Por qué el pigtail:** la XIAO no trae conector de batería, solo dos pads (BAT+ y BAT−) en la cara de abajo. El pigtail se suelda a esos pads y la batería queda **desenchufable**. Sin él hay que soldar la batería en forma permanente a la placa, lo cual convierte cada prueba de firmware en una operación con una bomba de litio colgando. Un dólar bien gastado.

**Por qué 2 baterías:** para poder comparar autonomía real entre dos unidades y porque una se va a maltratar durante las pruebas.

**Advertencia de carga:** estas baterías no tienen termistor. La XIAO carga por defecto a 50 mA, que está muy dentro del rango seguro (Adafruit recomienda 100-350 mA como máximo). No tocar el jumper de carga rápida de la placa.

## Pedido C — Temu (con el amigo) o AliExpress

Todo esto es commodity, no vale la pena pagar precio estadounidense.

| Ítem | Especificación | Cantidad |
|---|---|---|
| Imanes de neodimio | **Bloque 20 × 10 × 2 mm** | 10-20 |
| Tornillos M2 × 6 autorroscantes | Cabeza avellanada | 20+ |
| Cinta Kapton | Rollo angosto | 1 |
| Termorretráctil | Surtido de diámetros chicos | 1 |
| Cable de silicona AWG 28-30 | Rojo y negro | 1 |

**Cambio de pieza (26 de agosto):** se pasó del disco 10 × 3 mm original al bloque 20 × 10 × 2 mm, que es lo que se consiguió a buen precio en Temu. `vbt_case_v2.py` ya está actualizado — los bolsillos del piso ahora son rectangulares en vez de cilíndricos, y quedan con 2,2 mm de piso por encima del imán (más que los 1,3 mm de la versión con disco, porque el bloque es más fino). El disco de 10 × 3 mm también hubiera andado si se conseguía; si en algún momento se cambia de proveedor, revisar cuál de los dos está disponible y ajustar el script si hace falta volver al disco.

**Los imanes son el único ítem de esta lista que puede arruinar el proyecto si se compra mal.** Los bolsillos son de 20,4 × 10,4 × 2,3 mm con holgura. Verificar la medida en la descripción, no en la foto — evitar cualquier listado que diga "para colgar herramientas", "elevación" o "industrial": esos son discos de taza de 30-60 mm con tornillo, un tamaño completamente distinto y mucho más grande que la carcasa entera. Comprar de más: son centavos y se pierden.

**Los imanes de bloque no traen marca de polaridad.** Antes de instalarlos, marcar con fibrón la cara que va a apoyar contra la barra en los dos, y confirmar con un tercer imán suelto que esas dos caras marcadas se repelen entre sí (mismo polo hacia afuera en ambos). Instalar uno al revés no solo resta fuerza: los dos imanes se repelen entre sí dentro de la carcasa.

Sobre la fuerza: el bloque tiene más área de contacto que el disco (200 mm² contra 78,5 mm²), así que compensa ser más fino. Para un dispositivo de ~40 g pegado a una barra que se mueve rápido, alcanza cómodo. Si se resbala en las pruebas, la solución es agregar un tercer bolsillo al script de la base, no comprar imanes más grandes.

**Tornillos:** verificar que sean autorroscantes para plástico (rosca gruesa y espaciada), no métricos de rosca fina. Los postes de la carcasa tienen agujero de 1,7 mm justamente para que el tornillo se haga su propia rosca en el PETG.

## Pedido D — Uruguay

| Ítem | Dónde | Nota |
|---|---|---|
| Filamento PETG, 1 kg | electronica.uy, MicroUniversos, o tiendas de impresión 3D | No PLA. La barra en el gimnasio golpea y el auto en verano cocina |
| Soldador de punta fina (temperatura regulable) | electronica.uy (Av. Gral. Rondeau 1534, retiro sin costo) | Si no hay uno ya |
| Estaño 0,6 mm con núcleo de flux | Ídem | El de 1 mm es demasiado grueso para los pads de la XIAO |
| Flux en pasta o lápiz | Ídem | Hace la diferencia entre soldar un pad de 1 mm y arruinarlo |
| Multímetro | Ídem | Imprescindible para verificar polaridad antes de conectar |
| Pinza de punta fina y alicate de corte | Ferretería | |

Esto se compra **último**, cuando ya estén confirmados los envíos de EE.UU. No tiene sentido tener el soldador antes que las placas.

## Lo que se saca de la lista original

**Interruptores deslizantes SS12D00 — no comprar.**
Estaban en el plan como interruptor de encendido. Con la XIAO durmiendo a 5 µA, una batería de 350 mAh dura **teóricamente años** en reposo. El interruptor resuelve un problema que el deep sleep ya resolvió, y a cambio agrega: un agujero más en la carcasa, altura que no sobra, un punto mecánico que falla, y un cable más que soldar. Además rompe el modo Viaje, que es una decisión de diseño mejor porque no requiere que el usuario se acuerde de nada.

Si en las pruebas el consumo en reposo resulta ser mucho mayor que 5 µA, se reconsidera. Es un ítem de US$0,50 que se consigue en Uruguay en cualquier momento.

**Cables Dupont y calibre digital.**
El calibre sí es útil para verificar que la batería que llegó mide lo que dice antes de imprimir la carcasa definitiva. Los Dupont no sirven acá: no hay protoboard en este proyecto, todo va soldado.

## Presupuesto

| Concepto | Monto |
|---|---|
| Seeed — 3 placas XIAO Sense | US$40,41 |
| Seeed — envío doméstico EE.UU. | ~US$6 |
| Adafruit — 2 baterías + 2 pigtails | ~US$16 |
| Adafruit — envío doméstico EE.UU. | ~US$6 |
| Temu / AliExpress — imanes, tornillos, consumibles | ~US$10 |
| Uruguay — filamento PETG | ~US$25 |
| Uruguay — soldador, estaño, flux, multímetro (si no se tiene) | ~US$50 |
| **Total con herramientas** | **~US$153** |
| **Total si ya hay soldador y multímetro** | **~US$103** |

Consideración: **el gasto irreversible del proyecto son US$78** (los dos pedidos de EE.UU.). Todo lo demás son herramientas y consumibles que sirven para cualquier otro proyecto de electrónica, o filamento que se usa igual. El downside real de probar esto es menos de cien dólares.

## Checklist antes de dar clic en pagar

**En el pedido de Seeed:**
1. El título del producto dice **"Sense"**
2. La descripción menciona **IMU de 6 ejes**
3. Los datasheets incluyen **LSM6DS3TR**
4. El selector de almacén está en **United States**
5. **No** dice "Pre-Soldered" ni "Tape & Reel"

Las tres primeras son la regla que ya costó cuatro links equivocados. Sostenerla aunque se esté comprando en la tienda oficial.

**En el pedido de Adafruit:**
6. Batería: 350 mAh, dimensiones 36 × 19,6 × 5,2 mm
7. Dice que incluye **protection circuit**
8. Conector **JST-PH 2.0** (no el 1,25 mm, no el 2,54 mm)

**Dirección de envío:**
9. Los dos pedidos van a la **misma dirección estadounidense**, la de donde se hospeda la madre del socio
10. Confirmar la **fecha de vuelta** y que ambos entreguen con margen de al menos 5 días antes

## Para el viaje de vuelta

**Las baterías van sí o sí en equipaje de mano.** Nunca en la valija despachada. Es regulación de todas las aerolíneas y no admite excepción. Cada batería en su propia bolsita plástica, con los terminales del conector cubiertos con cinta. Las de 350 mAh son 1,3 Wh cada una, muy por debajo del límite de 100 Wh: el problema nunca es la capacidad, es la ubicación.

**Los imanes van en equipaje de mano también**, apilados uno contra otro (así se cancelan entre sí) y envueltos. Diez imanes de 10 × 3 mm no generan campo suficiente para preocupar a nadie, pero un imán suelto en una valija es un imán perdido.

**Las placas** en cualquier lado, idealmente en su bolsa antiestática original.

## Orden de ejecución

**Esta semana:** pedidos A y B. Son los que tienen fecha límite dura, porque dependen de un vuelo.
**Cuando lo pida el amigo:** pedido C.
**Primera semana de septiembre:** pedido D, ya sabiendo que lo de afuera llegó.
**Mientras tanto, gratis:** imprimir un prototipo de la carcasa en el filamento que haya en casa, aunque sea PLA. No sirve para el producto final pero sirve para descubrir ahora si los tornillos entran, si la tapa cierra, si el corte del USB-C está a la altura correcta. Es un mes de plazo con una impresora al lado; sería un desperdicio llegar a septiembre sin haber tocado una pieza física.
