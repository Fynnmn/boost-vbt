# Auditoría de BOOST — 26 de septiembre de 2026

## Alcance y lectura del informe

Revisión de la web publicada en https://app.getboost.fit/ y del código local de app-ios. En la web se recorrieron Inicio, Entrenar (Plan y Libre), Progreso, Avisos y Nova (Chat, Análisis y Plan), con la cuenta Maxi, que mostraba cero sesiones. También se había recorrido el onboarding de la demo separada https://boost-demo-75n.pages.dev/; sus datos de Martina y sus simulaciones no se atribuyen a la cuenta Maxi.

No se modificó la aplicación. Este documento es la única incorporación de esta revisión. No es una garantía de haber encontrado todos los errores: no se probaron un sensor físico, una compilación nativa en iPhone, cobros reales, recuperación de cuenta, aislamiento entre usuarios ni todos los tamaños de pantalla.

**Evidencia:** «Web» significa observado en la interfaz; «Código» identifica un riesgo visible en la implementación, sin afirmar que se reprodujo en hardware; «Mejora» es una propuesta de producto. La versión local y la publicada muestran diferencias: comprobar el build desplegado antes de arreglar algo que ya cambió.

**Prioridades:** P1 antes de una beta con sensor real o usuarios que confíen en las recomendaciones; P2 antes de cobrar o ampliar la beta; P3 pulido. No se asigna P0 porque no se confirmó un incidente crítico.

## Cuánto pagaría

Como opinión personal, con sensor preciso, sesiones estables y recomendaciones útiles: **US$60–70 por el sensor y US$5–8 al mes**, o aproximadamente **US$50–60 por año**. No es una tasación de la empresa, un presupuesto de desarrollo ni un estudio de precios del mercado.

Por esta demo todavía no contrataría un año: primero querría comprobar que mide bien y que Nova cambia decisiones de entrenamiento con fundamento. La presentación visual permite imaginar ese precio; el valor que lo sostiene es la medición y la utilidad repetida. Un plan superior necesitaría una diferencia clara, por ejemplo gestión real de varios atletas y seguimiento para entrenadores.

## Lo que ya funciona en el diseño

- Identidad visual reconocible: coral, fondos oscuros y tarjetas claras tienen coherencia.
- La pantalla de Inicio da protagonismo a la acción de entrenar.
- El flujo ejercicio → carga → series/repeticiones → entrenamiento resulta entendible.
- La combinación de mediciones, progreso y asistente tiene una propuesta concreta.
- El código contiene algunas precauciones para estimaciones y fatiga; no corresponde describir todas las recomendaciones como carentes de controles.

## Hallazgos y cambios concretos

### 1. Sin datos se muestra disposición 0/100 — P1 · Web

**Evidencia:** Nova → Análisis mostraba «0 de 100», junto a «Sin datos de hoy», en una cuenta sin sesiones.

**Problema:** cero parece una medición de disposición muy mala; desconocido y cero son estados diferentes.

**Cambio:** mostrar «—» o «Todavía no calculada». Explicar qué datos faltan y calcular un número únicamente cuando se cumpla el mínimo real del algoritmo.

**Comprobación:** cuenta nueva, sin series hoy y con historial insuficiente nunca deben presentar cero como una evaluación válida.

### 2. Nova afirma haber leído una sesión inexistente — P1 · Web; corrección local parcial

**Evidencia:** encabezado «En línea · leyó tu última sesión» con cero sesiones. En `src/velo/real.js:317` ya existe una condición que sustituye el estado por «En línea» cuando no hay datos. El diseño también contiene textos de actividad que dan a entender lectura de series o de la semana.

**Cambio:** verificar que el parche local entra en el build publicado y revisar todos los estados de Nova, no solo el saludo. Los mensajes de actividad deben describir acciones y datos disponibles realmente.

**Comprobación:** usuario nuevo, usuario con historial y solicitud en curso muestran estados diferentes y verdaderos. No implementar por segunda vez la condición existente sin revisar el despliegue.

### 3. Aplicar una recomendación interpreta texto como una orden de carga — P1 · Código

**Evidencia:** `design/VELOPhone.dc.html:1861` extrae el primer número seguido de kg, busca un ejercicio por su nombre y, si no lo encuentra, usa el ejercicio seleccionado. Una expresión como «+2.5 kg» puede interpretarse como carga absoluta de 2.5 kg.

**Cambio:** devolver acciones estructuradas: ejercicio por identificador, operación absoluta o incremento y valor. Validarlas y mostrar una vista previa como «Sentadilla: 77.5 → 80 kg». Si falta el ejercicio o hay ambigüedad, no modificar la rutina.

**Comprobación:** probar cargas absolutas, incrementos, números con coma, varios ejercicios y respuestas sin acción. «Aplicado» solo aparece después de un cambio válido.

### 4. Un mensaje antiguo ajeno a una carga aparecía como Aplicado — P2 · Web; revisar versión

**Evidencia:** en el chat existente había un mensaje de prueba sobre una urgencia con estado «Aplicado». No era una urgencia actual del usuario. El código local ya contiene `canApply` y una condición visual que restringen el botón a mensajes con kg.

**Cambio:** verificar el despliegue y los estados de mensajes guardados. Aplicar la solución estructurada del punto 3; una coincidencia de texto con kg tampoco demuestra que exista una acción válida.

**Comprobación:** los mensajes informativos y los de seguridad no muestran acciones de entrenamiento ni estados de aplicación residuales.

### 5. Desconexión del sensor sin transición completa de estado — P1 · Código, pendiente de hardware

**Evidencia:** `src/velo/sensor.js:52` maneja la desconexión asignando `dev = null`. Ese callback no limpia el estado anterior ni comunica por sí mismo una transición a la pantalla de entrenamiento.

**Cambio:** publicar estados de conexión explícitos, invalidar información vieja y detener o marcar como interrumpida la serie. Dar una opción clara de reconectar y decidir cómo conservar las repeticiones ya recibidas.

**Comprobación:** apagar el sensor durante una serie debe mostrar el corte inmediatamente; la app no debe seguir aparentando una medición activa.

### 6. La serie puede arrancar visualmente aunque falle el comando — P1 · Código, pendiente de hardware

**Evidencia:** `sensor.js:22` resuelve sin error si no hay dispositivo; `startSet` registra errores de escritura solo en consola. En el diseño, `mainAction` pasa a lifting y `run` llama a `startSet` sin esperar confirmación.

**Cambio:** iniciar mediante una operación asíncrona que valide conexión y confirme el envío —y la aceptación del firmware, si el protocolo la ofrece— antes de mostrar «midiendo». Presentar un error recuperable si falla.

**Comprobación:** dispositivo ausente, desconectado o escritura rechazada no dejan la pantalla esperando repeticiones indefinidamente.

### 7. Una conexión incompleta puede quedar marcada como conectada — P1 · Código

**Evidencia:** `sensor.js` asigna `dev` antes de terminar las suscripciones a notificaciones. Si una suscripción falla, esa secuencia no realiza una limpieza integral.

**Cambio:** conexión transaccional: preparar y suscribir, declarar listo al final, y ante un error cancelar suscripciones, desconectar y limpiar referencias.

**Comprobación:** simular fallo en cada suscripción y verificar que `connected()` no devuelve un falso positivo.

### 8. La calibración visual termina por tiempo — P1 · Código para uso real

**Evidencia:** `sensor.calibrate()` devuelve una promesa resuelta; `calAction` completa una animación de 2.8 segundos y dice «Listo». El firmware realiza autocalibración al iniciar la serie, por lo que esta pantalla no prueba que esa calibración real haya ocurrido.

**Cambio:** distinguir «preparación del sensor» de «calibración confirmada». Para el modo real, usar el estado del firmware; en la demo, indicar que es una simulación. Mantener las instrucciones de barra quieta al comenzar la serie.

**Comprobación:** mover la barra, no tener sensor o recibir un error de calibración no produce un éxito ficticio.

### 9. Selección automática del primer sensor encontrado — P2 · Código

**Evidencia:** el flujo de escaneo elige el primer dispositivo compatible.

**Cambio:** mostrar dispositivos con identidad reconocible y permitir confirmar cuál pertenece al usuario. Recordar el elegido, con opción de cambiarlo.

**Comprobación:** con dos sensores cerca no se conecta inadvertidamente al de otro atleta.

### 10. Repeticiones simuladas deben quedar separadas de las reales — P1 antes de usar datos para recomendaciones · Código

**Evidencia:** el flujo no nativo de `run()` genera repeticiones con un intervalo. Eso es razonable para la demo; no demuestra una medición del sensor.

**Cambio:** etiquetar claramente el modo demo y asegurar que sus sesiones están aisladas o marcadas como sintéticas. No usarlas como evidencia real para récords, estimaciones ni recomendaciones posteriores.

**Comprobación:** una sesión simulada es identificable en pantalla y almacenamiento, y no contamina el historial real. Esta revisión no confirmó si todas las rutas de persistencia ya realizan ese aislamiento.

### 11. Gráficos sin datos parecen tener una curva medida — P2 · Web

**Evidencia:** Progreso y Nova → Análisis muestran una línea coral plana con área sombreada aunque no hay sesiones y el valor es «—».

**Cambio:** reemplazar la curva por un estado vacío con texto breve y «Registrar primera sesión». Reservar líneas y áreas para puntos reales.

**Comprobación:** cero, uno y varios puntos tienen representaciones distintas; ningún trazado decorativo se interpreta como una medición.

### 12. Estado del sensor poco explícito — P2 · Web

**Evidencia:** se ve «Sensor» con un punto gris o un guion, sin una explicación clara de su estado.

**Cambio:** usar «Sin conectar», «Buscando», «Conectado», «Desconectado» y «Demo», con acción de conexión o ayuda. No depender únicamente del color.

**Comprobación:** alguien que abre la app por primera vez puede decir si está listo para medir sin adivinar.

### 13. Corte necesita unidad y explicación — P2 · Web

**Evidencia:** Inicio muestra «Corte 0.55»; la edición del entrenamiento sí incluye m/s.

**Cambio:** poner m/s de forma consistente y ofrecer una explicación breve de qué sucede al alcanzar ese umbral. Diferenciar velocidad absoluta de pérdida porcentual.

**Comprobación:** un usuario nuevo entiende qué está ajustando y qué cambia durante la serie.

### 14. Volumen usa significados diferentes — P2 · Web

**Evidencia:** Progreso presenta volumen en toneladas; Nova → Análisis muestra «Volumen 0» con «series · semana».

**Cambio:** llamar «Series semanales» al conteo de series y reservar «Volumen» para la definición elegida, con unidad visible. Si se usan ambos conceptos, explicarlos.

**Comprobación:** una misma sesión produce valores reconciliables entre pantallas y las unidades eliminan la ambigüedad.

### 15. Definición de pérdida de velocidad por documentar — P2 · Código; no es un error científico confirmado

**Evidencia:** `src/velo/real.js:37` calcula primera repetición frente a última. Si la primera no fue la más rápida, el resultado difiere de usar la mejor repetición como referencia.

**Cambio:** elegir y documentar la definición de producto, usarla consistentemente en gráficos, cortes y Nova, y tratar mediciones inválidas antes de calcularla.

**Comprobación:** una secuencia con segunda repetición más rápida arroja el resultado definido y explicado al usuario.

### 16. Rutina base con personalización limitada en su generador — P2 · Código / mejora

**Evidencia:** `planFor` en `real.js` usa una configuración por objetivo, cargas previas o de perfil y una rotación de ejercicios. Esta función por sí sola no demuestra una adaptación integral a nivel, recuperación o calendario; pueden existir otros flujos que sí la aporten.

**Cambio:** diferenciar «rutina inicial sugerida» de una rutina adaptada al historial. Explicar por qué se eligieron carga, series y corte, y cómo se revisarán con datos reales.

**Comprobación:** comparar perfiles de distinto nivel, disponibilidad e historial. Las diferencias prometidas por el producto deben reflejarse en el plan o no prometerse todavía.

### 17. Revisar coherencia entre semana de Nova y sesión de Entrenar — P2 · pendiente de validación

**Evidencia:** Nova → Plan mostraba «6 días · fuerza», ejercicios individuales en varios días y tres ejercicios para el día actual. No se comprobó la configuración de disponibilidad de ese perfil, así que no se afirma que seis días sea incorrecto.

**Cambio:** establecer una única fuente del plan y hacer visible qué parte es programación y qué parte es entrenamiento realizado.

**Comprobación:** cambiar días disponibles o rutina actualiza de forma coherente Inicio, Entrenar y Nova; las fechas pasadas no parecen sesiones completadas si no lo fueron.

### 18. Estado vacío de avisos parece una notificación — P3 · Web

**Evidencia:** «Tus avisos van a aparecer acá» lleva «ahora» y convive con «Marcar leídos» aunque no hay avisos.

**Cambio:** usar una ilustración o bloque vacío sin timestamp; ocultar o desactivar la acción de marcar leídos cuando no corresponde.

**Comprobación:** ninguna notificación vacía cuenta como nueva o leída.

### 19. Saludo no se adapta a la hora — P3 · Web / código

**Evidencia:** Inicio mostraba «Buen día» por la tarde; el diseño tiene ese saludo fijo, aunque otros saludos de Nova sí contemplan la hora.

**Cambio:** unificar la lógica con la hora local o usar un saludo neutral.

**Comprobación:** mañana, tarde y noche presentan un saludo adecuado sin depender de la zona horaria del servidor.

### 20. Controles requieren una revisión de accesibilidad — P2 · observación parcial

**Evidencia:** los controles +/− tienen etiquetas poco descriptivas y algunos elementos de selección se presentan como texto en el árbol accesible. Esto requiere confirmación con lector de pantalla; no se realizó una auditoría WCAG completa.

**Cambio:** botones semánticos, nombres como «Aumentar carga», estado seleccionado anunciado y foco visible. Verificar contraste, ampliación de texto y tamaño de toque.

**Comprobación:** completar selección de ejercicio y ajuste de carga con teclado y VoiceOver sin depender de posición o color.

### 21. Onboarding largo antes de comprobar el valor — P2 · mejora; demo separada

**Evidencia:** en la demo de boost-demo-75n.pages.dev se recorrieron numerosos pasos de perfil, cargas, permisos y preparación; también aparece oferta de suscripción. No se presupone que ese flujo sea idéntico al publicado en app.getboost.fit.

**Cambio:** permitir una primera experiencia breve, ofrecer «No sé» en datos técnicos y pedir progresivamente lo necesario. Mostrar qué hace la medición antes de pedir un compromiso anual.

**Comprobación:** un usuario nuevo entiende el beneficio y llega a una primera sesión de prueba sin conocer sus cargas exactas ni conectar hardware si eligió explorar.

### 22. Instrucciones de colocación deben identificar el eje — P2 · demo separada / mejora

**Evidencia:** la indicación de colocar el sensor en el extremo de la barra puede ser ambigua. La documentación del proyecto especifica el eje, no la manga giratoria.

**Cambio:** ilustración inequívoca del punto de montaje, texto que nombre el eje y recordatorio de dejar quieta la barra durante la autocalibración al comenzar la serie.

**Comprobación:** un usuario sin explicación verbal instala el sensor en el lugar correcto.

### 23. Versiones local y publicada difíciles de reconciliar — P2 · Web + código

**Evidencia:** hay condiciones locales para corregir el estado sin sesiones y restringir Aplicar que no explican completamente lo observado en la web.

**Cambio:** registrar versión de build/commit y entorno, verificar caché y actualización del cliente, y mantener un recorrido breve de aceptación después de desplegar.

**Comprobación:** una sesión nueva y una instalación anterior reciben la versión esperada; es posible identificar qué código produjo una captura o un fallo.

## Orden recomendado de trabajo

1. Corregir confianza en los datos: disposición desconocida, afirmaciones de Nova y gráficos vacíos.
2. Sustituir Aplicar basado en texto por acciones estructuradas y verificables.
3. Hacer robusto el ciclo nativo de conexión, inicio, calibración, desconexión y reconexión.
4. Aislar datos simulados y verificar la versión desplegada.
5. Unificar unidades, pérdida de velocidad y fuente del plan.
6. Pulir estados vacíos, sensor, accesibilidad y onboarding.

## Pruebas pendientes antes de venderla como producto con sensor

- Validar precisión y repetibilidad contra una referencia independiente, en ejercicios y cargas previstos; la demo no demuestra precisión física.
- Probar conexión y reconexión en iPhone, Bluetooth apagado, permisos denegados, app en segundo plano y suspensión de pantalla.
- Probar integridad del guardado: interrupciones, reintentos, duplicados y reapertura de una sesión.
- Verificar alta, recuperación, cierre y eliminación de cuenta, y acceso a datos entre usuarios.
- Comprobar suscripción, restauración de compras, vencimiento y cancelación en el entorno de prueba correspondiente.
- Comprobar navegación y entrada numérica con teclado abierto, distintos tamaños de pantalla y texto ampliado.
- Evaluar Nova con datos faltantes, inconsistentes y respuestas ambiguas; comprobar que explica límites y no inventa mediciones.

Estas pruebas son trabajo pendiente de validación, no vulnerabilidades o errores confirmados. Los datos ficticios, el acceso Pro de beta y las repeticiones de muestra son esperables en una demo si se identifican claramente.

## Estado de cada punto (26/9, después de la auditoría)

| # | Estado | Qué se hizo |
|---|---|---|
| 1 | Hecho | Sin datos suficientes, la disposición muestra «—» y «Todavía no calculada», y explica qué falta (serie de hoy o historial a esa carga). |
| 2 | Hecho | Build publicado con la condición; además, si no hay sesiones, Nova dice «Pensando…» y no «Leyendo tus últimas series». |
| 3 | Hecho | `src/velo/action.js`: el chip se convierte en {ejercicio, set/add, kg}; el botón dice «Aplicar: 60 → 62,5 kg». Sin ejercicio, con dos, con rangos o con saltos raros no hay botón. Nova escribe los chips en ese formato. Tests: `backend/worker/test/action.test.mjs`. |
| 4 | Hecho | «Aplicado» solo existe si hubo una acción válida, y dice qué cambió. |
| 5 | Hecho (falta probar con hardware) | `sensor.js` tiene estados (`off`, `connecting`, `on`, `lost`); al cortarse limpia todo, frena la serie, conserva las reps recibidas y avisa. «Seguir» reconecta. |
| 6 | Hecho (falta probar con hardware) | `startSet` espera la respuesta del comando y el estado del firmware; si falla, la pantalla vuelve atrás y lo explica. |
| 7 | Hecho (falta probar con hardware) | Conexión de todo o nada: si falla una suscripción, desuscribe, desconecta y no queda «conectado». |
| 8 | Hecho | «Prepará el sensor»: con sensor real se verifica que esté conectado y midiendo; dice que la calibración la hace solo al empezar cada serie. En vivo: «Barra quieta 2 segundos». |
| 9 | Hecho | El escaneo espera 2,5 s, prefiere el sensor ya emparejado o el de mejor señal, y si hay varios pide confirmar el ID. |
| 10 | Hecho antes | En la web no se guardan reps simuladas; pastilla «Demo» y aviso «Modo demostración». |
| 11 | Hecho | Inicio, Progreso y Nova › Análisis: sin puntos no hay curva, hay un estado vacío que dice qué falta. |
| 12 | Hecho | Pastilla con texto: Conectado, Buscando…, Desconectado, Sin conectar, Sin sensor, Demo. |
| 13 | Hecho | «Corte m/s» en Inicio; en vivo explica que la serie se corta cuando una rep baja de ese valor. |
| 14 | Hecho | En Nova › Análisis dice «Series»; «Volumen» queda solo para kg × reps (t) en Progreso. |
| 15 | Hecho | Pérdida = de la rep más rápida a la última, igual en vivo, resumen, Progreso, avisos y Nova. |
| 16 | Hecho | Sin sesiones: «Semana sugerida · según tu objetivo»; con sesiones: «cargas de tus series». |
| 17 | Pendiente | Unificar la fuente del plan entre Nova › Plan e Inicio/Entrenar. |
| 18 | Hecho | Aviso vacío sin hora; «Marcar leídos» solo si hay algo sin leer. |
| 19 | Hecho | Saludo de Inicio según la hora. |
| 20 | Parcial | +/− con nombre para VoiceOver («Aumentar carga») y más grandes; falta revisión completa con VoiceOver. |
| 21 | Ya estaba | Cargas con «No sé, calcularlo en la primera sesión». |
| 22 | Hecho | Texto y ayuda: en el eje (parte fija), nunca en la manga que gira. |
| 23 | Hecho | Perfil muestra «BOOST 1.0.1 · commit»; `window.VELO_BUILD` y la consola dicen versión, commit y fecha del build. |
