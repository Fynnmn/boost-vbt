# Landing de validación — BOOST

Página de una sola vista para medir intención real antes de fabricar. La métrica
de éxito no es tráfico: es cuánta gente deja el mail.

**En producción:** https://getboost.fit (y `www.getboost.fit`)
`boost-landing-7jg.pages.dev` sigue respondiendo, pero el dominio bueno —el
que está en el canonical, el Open Graph, el JSON-LD y el sitemap— es
`getboost.fit`. DNS en Cloudflare desde el 31/8/2026.
**Panel de Firebase:** https://console.firebase.google.com/project/boost-vbt-landing/firestore/data
(proyecto `boost-vbt-landing`, cuenta la cuenta del proyecto, plan Spark/gratuito)

## Correrla

```bash
python -m http.server 5178 --directory "Colegio/BOOST/landing"
```

Después abrir `http://localhost:5178`.

## Estructura

```
landing/
  index.html
  css/styles.css
  js/main.js            scroll, color continuo, reveals, formulario
  js/waitlist.js        guardado en Firestore, con respaldo local
  js/firebase-config.js  <- pegar acá la config de tu proyecto
  assets/
    hero.webp         fondo del hero (sensor en la barra)
    dispositivo.webp  foto del producto para la sección "Cada rep es un dato"
    logo.svg          logo de marca
```

Solo dos dependencias externas: **Google Fonts** (Archivo, Archivo Black,
JetBrains Mono) y **Lenis** por CDN para el scroll suave. Si Lenis no carga, la
página cae al scroll nativo sin romperse.

## Lista de espera (Firebase) — conectado

El proyecto `boost-vbt-landing` está creado, con Firestore en modo Standard,
las reglas de abajo ya publicadas, y `js/firebase-config.js` con la config real
pegada. Probado de punta a punta contra el dominio de producción: el formulario
escribe en Firestore, y un alta repetida la rechazan las reglas sin necesidad
de poder leer la colección.

### Reglas de Firestore (ya publicadas)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /boost_waitlist/{email} {
      // Cualquiera puede anotarse una vez...
      allow create: if request.resource.data.keys().hasOnly(
                         ['email','origen','fecha','idioma','referrer'])
                    && request.resource.data.email is string
                    && request.resource.data.email.size() < 200
                    && request.resource.data.email.matches('.+@.+[.].+');
      // ...pero nadie puede leer, editar ni borrar desde el navegador.
      allow read, update, delete: if false;
    }
  }
}
```

Los mails se ven desde la consola de Firebase (link arriba), no desde la web.
La config en `js/firebase-config.js` es pública por diseño — viaja en el
JavaScript de cualquier app web de Firebase. Lo que protege la base son estas
reglas, no el secreto de la config.

### Cómo se comporta

- **Con config puesta** → escribe en la colección `boost_waitlist`, usando el
  mail normalizado como id del documento. Un alta repetida la rechazan las
  reglas, así que el duplicado se detecta sin necesidad de poder leer la
  colección.
- **Sin config, o si Firebase no carga** (bloqueador, red caída, cuota agotada)
  → guarda en `localStorage` y reintenta subirlo en la próxima visita. Perder un
  mail es malo; mostrarle un error a alguien que no puede hacer nada al
  respecto es peor.

## Vista mobile

Cuatro breakpoints y ninguno más — están documentados arriba de todo en
`css/styles.css`. Antes había 900/861/780/640 mezclados sin criterio, con
una franja muerta entre 861 y 900 donde una sección ya era de dos columnas
y la de al lado todavía de una.

**La escena de "El problema" cambia de recorte, no de contenido.** La foto
es 16:9, y a 390px eso da un lienzo de 198px de alto donde no entran ni el
pill ni las burbujas. En mobile pasa a 4:5 con `object-position: 42% 62%`,
que sube el lienzo a 438px y encuadra la mano con el sensor y el teléfono
dejando fuera el hombro y el rack. Las posiciones mobile de cada burbuja
viven en su propio `<li>` como `--mx`/`--my`, al lado del texto que
posicionan; las de los costados llevan `b--izq`/`b--der`, que las ancla al
borde en vez de centrarlas, así no pueden recortarse por más largo que sea
el texto. Antes esto era un bloque de nueve `nth-child` en el CSS.

**Las specs son una ficha de 6 filas en mobile, no dos grillas.** La
división izquierda/derecha es un accidente del layout de escritorio (existe
para que las líneas guía apunten a la foto desde los dos lados), no una
división semántica. En una columna, `.specs` pasa a flex con la foto en
`order: -1` para que no quede partiendo la ficha al medio.

**El gráfico escala el dibujo, no el SVG.** El `viewBox` es 600×200 y a
390px se renderiza a 310px: factor 0,52. Sin compensar, los ejes de 12px
salen a 6px. En mobile se suben las unidades de usuario (`font-size: 22px`,
`stroke-width: 6.5`) para que el resultado en pantalla mida lo mismo que en
escritorio.

**El hero se encuadra por ORIENTACIÓN y por ALTO, no solo por ancho.**
Tres reglas que no son opcionales, cada una arreglando un hero que se veía
negro o con el producto fuera de cuadro:

- `orientation: portrait` — una foto 9:16 con `cover` en un viewport
  acostado se recorta a una franja: medido en un celular acostado
  (844×390) se veía el 26% del alto de la imagen, o sea la banda negra
  del medio, con el producto entero fuera de cuadro. Acostado va la foto
  apaisada.
- `max-aspect-ratio: 78/100` — a partir de ahí (foldable abierto, ventana
  partida) la foto vertical pierde la barra por los costados. La tablet
  vertical (0,75) sí usa la vertical: se verificó por captura que se ve
  mejor que la apaisada.
- Bandas de alto — el sensor ocupa del 57% al 83% del alto de la foto, y
  el bloque de texto termina alrededor del 71% de la pantalla, así que en
  pantallas cortas se pisan por construcción. Con menos de 700px de alto
  se ancla abajo (`center bottom`); entre 701 y 800 hay que ampliar a
  `auto 130%` porque ahí `cover` calza exacto en altura y el ancla no
  mueve nada.

**Nunca anclar arriba esta foto.** La versión que lo hacía (`auto 150%` +
`center top`, pensada para "empujar el producto debajo del pliegue")
mostraba solo el primer 66% de la imagen, que es negro: el hero quedaba
como un rectángulo negro liso con texto. Ese fue el bug reportado como
"no se ve nada".

**El parallax se normaliza contra el alto del hero, no del viewport.** Con
`y / innerHeight` la foto quedaba al 15% de opacidad con el hero todavía
en pantalla, y en iOS Safari parpadeaba porque `innerHeight` cambia al
colapsarse la barra de direcciones. Y el `scale` tiene que dejar más
margen del que consume el `translate` (hoy 13% contra 12%) o al final del
recorrido se despega el borde superior.

**Sin `image-set()`.** Con un único candidato 1x no aporta nada, y se
descarta entero en Safari <17 y Chrome <113 — dejando el hero sin ninguna
imagen. Va `url()` a secas. Lo mismo con `min-height: 100svh` y
`overflow: clip`: los dos llevan fallback (`100vh`, `hidden`) porque sin
él la declaración se descarta y el hero pierde alto o derrama el fondo.

**El hero de mobile usa OTRA foto, no un recorte de la de escritorio.**
`hero-mob.webp` se generó 9:16 y compuesta para este uso: el 45% de arriba
es negro casi puro (brillo medio 11 sobre 255) para que el texto se apoye
sin necesitar un velo que tape la foto, y el producto vive centrado en la
mitad de abajo. Por eso alcanza con `background-size: cover` — las dos
fotos apaisadas anteriores había que pelearlas con `size`/`position` y aun
así el sensor salía cortado contra un borde. En pantallas de menos de
700px de alto (iPhone SE) el texto solo ocupa el 84% del alto, así que ahí
la foto se amplía y se ancla arriba: el sensor queda debajo del pliegue y
lo que se ve es el disco desenfocado, que lee como profundidad y no como
un producto cortado.

**El input del formulario vale 16px, no 15.** Safari en iOS hace zoom
automático en cualquier input de menos de 16px al enfocarlo, y después no
vuelve. No bajarlo.

**Los `:hover` van dentro de `@media (hover: hover)`.** Sin eso quedan
pegados después del tap en touch: la tarjeta se levanta y no vuelve.

### Cómo verificar mobile

```bash
python mob.py overflow   # detector de desborde REAL
python mob.py hero       # el hero muestra producto (no negro liso)
python mob.py shots      # capturas full-page
python mob.py alturas    # alto de cada sección
```

La matriz son **pares ancho×alto**, no anchos sueltos, e incluye acostado.
La versión anterior corría todo a 844px de alto: con eso el bloque
`@media (max-height: 700px)` nunca se activaba y el apaisado no se probaba
nunca, así que los dos bugs más graves del hero pasaron limpios por el QA.
`mob.py hero` además mide el **brillo** de la mitad inferior: un hero negro
pasaba todos los chequeos anteriores porque ninguno miraba si se veía algo.

`overflow` quita el `overflow-x: clip` del body antes de medir. **Con el
clip puesto cualquier desborde es invisible y el chequeo da falso
negativo** — es exactamente por eso que el desborde del titular a 320px no
había aparecido en las verificaciones anteriores.

## Detalles de implementación que conviene no romper

**El color de fondo lo maneja JavaScript, no CSS.** `js/main.js` interpola
`--bg` y `--fg` contra la posición real del scroll, en la lista `CAPITULOS`.
Para cambiar la paleta de una sección se toca ahí, no en el CSS.

La transición se concentra en una ventana corta al borde de cada bloque
(`VENTANA_VH`). Repartirla a lo largo de toda la sección deja el fondo a medio
camino mientras se lee el texto y, como la tinta también se interpola, queda
gris sobre gris: ilegible. La tinta además usa una curva más empinada que el
fondo, para que nunca coincidan en el medio.

**El ground de `#showcase` y `#como` vale exactamente `248 248 246`**, que es el
color de fondo de `dispositivo.webp`. Si se cambia uno hay que cambiar el otro,
o se ve el rectángulo de la imagen recortado contra la página.

**El pill del nav se construye con el inverso de la tinta** (`rgb(var(--fg))`),
así se invierte solo mientras el scroll cambia el fondo: claro sobre el hero
negro, oscuro sobre las secciones blancas. No hace falta JS para eso.

## Ayuda de QA

`?y=0.45` posiciona el scroll en esa fracción de la página, fuerza los reveals y
congela las transiciones, para poder capturar cualquier tramo. Solo se activa
con el parámetro puesto a mano.

## Cómo re-deployar

```bash
# El deploy sube solo lo que el sitio realmente usa (index.html, robots.txt,
# sitemap.xml, css/, js/, assets/) — no la carpeta images/ ni referencias/,
# que son material de trabajo y no están linkeadas desde la página.
rm -rf /tmp/deploy_boost && mkdir /tmp/deploy_boost
cp index.html robots.txt sitemap.xml /tmp/deploy_boost/
cp -r css js assets /tmp/deploy_boost/
wrangler pages deploy /tmp/deploy_boost --project-name boost-landing --branch main
```

**robots.txt y sitemap.xml TIENEN que ir en el deploy.** Si faltan,
Cloudflare Pages no devuelve 404: sirve `index.html` con estado 200. O sea
que Google pide el sitemap y recibe una página HTML — el sitemap queda roto
sin que nada avise. Verificalo después de cada deploy:

```bash
curl -sI https://getboost.fit/sitemap.xml | grep -i content-type
# tiene que decir text/xml, NO text/html
```

## SEO

El `<title>` lleva la categoría delante y la marca al final: nadie busca
"BOOST" —es una palabra demasiado genérica—, buscan "sensor de velocidad",
"VBT" o "medir velocidad de la barra".

`assets/og.jpg` (1200×630) es la tarjeta que se ve al pegar el link en
WhatsApp o Instagram. Se genera componiendo texto sobre el hero, no
capturando la página: una captura a ese tamaño deja el titular ilegible en
la miniatura. Si cambia el titular, hay que regenerarla.

El JSON-LD declara WebSite + Organization + Product + FAQPage.

**El FAQPage ya no produce nada visible.** Google retiró los resultados
enriquecidos de FAQ el **7 de mayo de 2026**, para todos los sitios —
incluidos los de gobierno y salud, que los habían conservado desde la
restricción de 2023. El markup se deja porque Google lo sigue usando para
entender de qué trata la página, pero no esperes el desplegable de preguntas
bajo el resultado. *(Esta sección afirmaba lo contrario hasta el 1/9/2026;
la afirmación era correcta cuando se escribió y dejó de serlo.)*

Lo que sí sigue rindiendo del schema son **Organization y Product**: le dan a
Google la relación entre la marca y el producto, que es lo que alimenta las
búsquedas por marca.

**El Product no declara `offers`.** Google exige `price` dentro de un Offer;
sin él marcaba como inválidos "Fragmentos de productos" y "Fichas de
comerciantes" — pasó de verdad, verificado el 1/9/2026 en la prueba de
resultados enriquecidos. Como el precio todavía no existe y uno inventado es
dato falso que sí penaliza, la salida correcta fue **quitar la oferta, no
completarla**. Eso resolvió "Fichas de comerciantes".

### El error que queda en la prueba, y por qué se deja

La prueba de resultados enriquecidos sigue marcando **"Fragmentos de
productos"** con un problema:

> Debe especificarse "offers", "review" o "aggregateRating"

**Es esperado y NO hay que arreglarlo.** No es una penalización ni afecta el
posicionamiento: Google está diciendo que el Product no puede aparecer como
ficha con precio y estrellas. Y no puede, porque no hay precio, ni reseñas, ni
calificaciones — todavía no se vendió nada.

Las tres formas de hacerlo desaparecer son inventar un precio, inventar
reseñas, o borrar el Product del schema. Las dos primeras son dato falso
(reseñas falsas en schema pueden traer una acción manual de Google), y la
tercera pierde que Google entienda la relación marca-producto.

**Se resuelve solo el día que haya precio real:** se agrega el Offer con
`price`, `priceCurrency` y `availability` en el bloque del Product, y el
error desaparece. Hasta entonces, ver ese error en la herramienta es lo
correcto — no es un pendiente.

**El dominio propio ya está.** La landing corre en `getboost.fit` (y
`www.getboost.fit`) desde el 31/8/2026, con el DNS en Cloudflare. Eso levanta
el techo de autoridad que tenía el subdominio `.pages.dev`, compartido con
miles de sitios y sin historial.

## Verificado

- Sin scroll horizontal de 320 px a 1920 px, verificado **sin** el
  `overflow-x: clip` del body (con el clip puesto el chequeo miente).
- Escena de "El problema" sin burbujas recortadas ni superpuestas al pill,
  en los dos estados, de 320 px a 430 px.
- Sin errores de consola; fuentes e imágenes cargan en todos los breakpoints.
- Con `prefers-reduced-motion` no queda ningún elemento oculto.
- Formulario probado contra Firestore real (no solo el respaldo local), en
  local y en el dominio de producción: mail inválido, alta correcta y alta
  repetida. Confirmado en la consola de Firebase que los documentos se crean
  con los campos correctos y que las reglas bloquean lectura.
