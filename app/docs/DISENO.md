# Diseño de la app — decisiones y de dónde salieron

Las referencias están en `docs/referencias/`. Se generaron con Higgsfield
(nano_banana_pro, 9:16) el 30 de agosto de 2026, a partir de los prompts de
`PROMPTS_DISENO.md` adaptados a la paleta de BOOST.

**No son especificación, son referencia.** Los generadores no respetan las
guías de las plataformas, inventan espaciados imposibles y a veces escriben
mal. Lo que sigue es lo que se decidió mirándolas, ya traducido a reglas
concretas que están implementadas en `css/app.css`.

---

## Lo que las cinco imágenes tenían en común

**Todo lo que se toca es una píldora.** Botones, chips, badges: radio
completo, nunca esquinas de 14 px. Fue lo más consistente entre las cinco
referencias y es lo que más cambió el aspecto de la app. Las tarjetas y los
contenedores sí llevan esquinas suaves (18-20 px); la píldora es para lo
accionable.

**Un solo acento, y usado poco.** Coral `#EE4526` para: la última barra de
la serie, la aguja de la regla, el botón primario, la línea de regresión, el
número de pérdida y el punto de la pestaña activa. Nada más. Todo lo demás
es blanco o gris. Cuando el coral aparece, significa algo.

**Hairlines en vez de cajas.** Las referencias separan bloques con líneas de
1 px al 6-10 % de blanco, no con rectángulos de fondo. La grilla de
estadísticas del resumen es el mejor ejemplo: cuatro celdas, dos hairlines
cruzadas, sin bordes exteriores.

---

## La regla tipográfica que ordena todo

Fue el hallazgo más útil, y salió de comparar dos referencias que a primera
vista se contradecían: en la pantalla en vivo el `0.62` está en monoespaciada,
y en la de carga el `82,5` está en una sans pesada.

No es una inconsistencia del generador — es una distinción que vale la pena
sostener:

| Tipo de número | Tipografía | Por qué |
|---|---|---|
| **Datos medidos** — velocidad, pérdida, r², ejes, estadísticas | JetBrains Mono | Ancho fijo: no bailan al actualizarse doce veces por serie. Y comunican "esto lo midió un instrumento" |
| **Valores que elegís vos** — la carga, el 1RM estimado | Archivo Black | Son controles y titulares, no lecturas. La sans pesada les da presencia de titular |

Los rótulos de las estadísticas van en monoespaciada, mayúsculas, con
`letter-spacing` amplio. Es lo que hace que un número suelto se lea como la
lectura de un instrumento y no como un dato de planilla.

---

## Pantalla por pantalla

### Conectar
Los anillos de la referencia son **cinco y enormes** — llegan casi al ancho
de la pantalla — con la opacidad cayendo hacia afuera. La primera versión
tenía tres anillos chicos y se veía tímida. El titular va **alineado a la
izquierda**, no centrado: centrado parecía una pantalla de error.

### Antes de la serie
El `kg` va chiquito y **alineado arriba**, como un exponente, no en la línea
de base. Los ticks de la regla son **más finos y más densos** que en la
primera versión, con los números bajo los ticks largos.

### En vivo
El número ocupa **el ancho entero de la pantalla** (`clamp` hasta 40vw). Las
barras son **gruesas y separadas**, no rayitas: una barra por repetición que
se lee de lejos. Los contadores de abajo (`8 reps`, `−12 %`) son mucho más
grandes de lo que parecería necesario, y está bien — se miran de reojo.

### Resumen
El relleno bajo la curva es un **degradado** coral → transparente, no un
color plano; es lo que le da profundidad al gráfico. El eje Y se dibuja como
una línea vertical fina. La grilla de estadísticas pierde los fondos y queda
en hairlines. El párrafo de veredicto va en **monoespaciada**, con una regla
coral a la izquierda: se lee como la salida de un instrumento.

### Perfil
El 1RM y el gráfico van juntos **dentro de una tarjeta** con fondo apenas más
claro. La insignia de confianza es una **píldora con borde**, no rellena, y
se alinea con el número. Los metadatos (r², cantidad de series, rango de
cargas) van en monoespaciada gris, en la misma línea que el rótulo
`1RM ESTIMADO` pero a la derecha.

---

## Lo que se descartó de las referencias

**La barra superior blanca** de la primera imagen. Se ve bien en una lámina,
pero en la mano es una franja brillante en la parte de arriba de una pantalla
que se mira en un gimnasio, y rompe con las otras cuatro pantallas. Las otras
referencias la tienen negra, y así quedó.

**El texto inventado.** La segunda referencia trae un párrafo de veredicto que
suena bien pero no corresponde a ningún cálculo real. Los veredictos de la app
salen de la pérdida de velocidad medida y del umbral del ejercicio, no de una
plantilla.

**Los rótulos con errores de acentuación** que escribió el generador
(`PERDIDA`, `Pone el sensor`). En la app van bien escritos.
