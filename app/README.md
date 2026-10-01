# App de BOOST

La app que habla con el sensor. Mide la velocidad de cada repetición y
dice cuándo subir la carga y cuándo cortar la serie.

Es una **PWA**: una página web que se instala como app. Sin dependencias,
sin paso de build. Se edita un archivo, se recarga el navegador y ya está.

**En producción: https://app.getboost.fit**
(`boost-app.pages.dev` sigue funcionando como respaldo)

Se instala desde el celular con "Agregar a pantalla de inicio". Tiene que
estar publicada por HTTPS o el Bluetooth del navegador no existe — por eso no
alcanza con abrir el `index.html` con doble clic ni con un servidor local
cuando se prueba desde el teléfono.

---

## Cómo correrla

```bash
python .boost-app-server.py
```

(desde `claude-skills/`, la raíz del proyecto — sirve `app/` en
http://localhost:8099). Es un servidor **con hilos** a propósito: el
`python -m http.server` de un solo hilo se cuelga cuando el navegador abre
varias conexiones a la vez, que es exactamente lo que pasa con módulos ES.

Los tests:

```bash
node test/test.mjs
```

20 tests, todos del protocolo binario y de la regresión carga-velocidad.
La interfaz no se testea con código: se mira.

---

## Cómo desplegarla

Cloudflare Pages, proyecto `boost-app`. **El paquete se arma a mano**: hay
carpetas en `app/` que no son del sitio y no tienen por qué estar publicadas.

```bash
# desde app/
D=/tmp/deploy_boost_app && rm -rf $D && mkdir -p $D
cp index.html ajustes.html grabar.html log.html legal.html    manifest.webmanifest sw.js _headers $D/
cp -r css js assets $D/
npx wrangler pages deploy $D --project-name boost-app --branch main
```

**Qué NO se sube, y por qué:** `design/` son maquetas de trabajo, `docs/` es
documentación interna, `test/` son las pruebas, y `README.md`, `package.json`
y `.wrangler/` no pintan nada en un sitio estático. Nada de eso está enlazado
desde la app; publicarlo sólo agrega superficie.

**Correr los tests antes**, que tardan un segundo:

```bash
node test/test.mjs
```

**Verificar después.** Cloudflare Pages sirve las URLs sin extensión, así que
`legal.html` responde **308** y redirige a `/legal`: eso no es un error, pero
hay que seguir el redireccionamiento o parece que la página está vacía.

```bash
curl -sL https://app.getboost.fit/legal.html -o /dev/null -w "%{url_effective} %{http_code}
"
for u in ajustes grabar log; do
  printf "%-8s %s
" "$u" "$(curl -s -o /dev/null -w '%{http_code}' https://app.getboost.fit/$u)"
done
```

Las tres herramientas internas tienen que dar 200. Son `noindex` y no están
enlazadas desde ningún lado, pero si dejan de responder no hay nada que avise:
sólo se descubre el día que hacen falta, con la placa en la mano.

---

## Por qué web y no una app nativa

> **La decisión cambió el 2 de septiembre de 2026.** La aplicación definitiva
> va a ser **nativa y con plan de pago**: primero App Store, después Google
> Play. Lo que sigue explica por qué *esta* versión —la de prueba, la que está
> en `app.getboost.fit`— se hizo web, y sigue siendo la razón por la que una
> web sola no alcanza: **ningún navegador de iOS tiene Web Bluetooth**, así
> que una aplicación web andaría en Android y no en iPhone.


Es la decisión más importante del archivo, así que va primero.

Una app nativa de iPhone necesita una Mac, Xcode y US$99 por año de cuenta
de desarrollador. El proyecto se desarrolla en Windows y todavía no tiene
ni la placa comprada. Gastar eso antes de saber si el sensor cuenta
repeticiones sería invertir en la parte equivocada.

**Web Bluetooth** existe en Chrome y Edge de Android, Windows, macOS y
Linux, y es exactamente lo que va a haber en la mano el día de la prueba
del gimnasio: un Android con Chrome. La app se sube a Cloudflare Pages
igual que la landing y se abre desde el celular.

**El límite, dicho claro: en iPhone no funciona el sensor.** Ningún
navegador de iOS tiene Web Bluetooth, ni Safari ni el Chrome de iOS (que
por dentro es Safari). En iPhone la app abre y el simulador anda, pero no
se puede conectar el sensor. La app lo detecta y lo dice en pantalla en
vez de fallar sin explicación.

Si el proyecto llega a vender, ahí sí hay que hacer una app nativa. No
antes.

---

## El simulador

`js/sim.js` es un sensor falso que **emite exactamente los mismos bytes
que emitiría el firmware**. Se prende con "Probar sin sensor".

Que emita bytes y no objetos ya armados es la decisión que hace que sirva:
el parser (`js/protocol.js`) se ejercita en los dos caminos. Si el
simulador entregara datos ya digeridos, el día que llegue la placa sería
el primer día que ese código corre, y ahí es donde aparecen los errores de
offset.

La física es la de la literatura de VBT — la velocidad cae linealmente con
el % del 1RM y decae dentro de la serie con la fatiga — con un atleta
supuesto (100 kg de banca, 140 de sentadilla). Simula también la
calibración inicial, y una de cada doce series arranca **sin** calibrar,
para poder ver cómo se comporta la app cuando las reps vienen marcadas con
`WEAK_ZUPT`.

**Nada de lo que muestra el simulador es una medición.** La app lo avisa
con un cartel al conectar y con el punto ámbar en la barra de estado.

---

## Los archivos

| Archivo | Qué hace |
|---|---|
| `js/protocol.js` | El contrato binario. Espejo exacto de `firmware/docs/PROTOCOL.md` |
| `js/ble.js` | Transporte Web Bluetooth contra el sensor real |
| `js/sim.js` | Transporte simulado. Misma interfaz que `ble.js` |
| `js/sensor.js` | Parsea los bytes y junta las reps de la serie en curso |
| `js/store.js` | Historial en `localStorage` y exportación a CSV |
| `js/lv.js` | Regresión carga-velocidad, 1RM estimado, zonas |
| `js/main.js` | Interfaz: las cinco pantallas |
| `js/icons.js` | El set de íconos, dibujados como SVG. Nunca emoji |
| `js/sfx.js` | El sonido de la interfaz, sintetizado con Web Audio |
| `test/test.mjs` | Tests del protocolo y de la regresión |
| `docs/DISENO.md` | De dónde salió cada decisión visual |
| `docs/IPHONE.md` | **Qué se puede y qué no en iPhone, y qué hay que cumplir legalmente** |
| `docs/referencias/` | Las cinco referencias generadas con IA |
| `docs/recortar_dispositivo.py` | Recorta el fondo del render del sensor |

La forma importa: `ble.js` y `sim.js` exponen la misma interfaz
(`connect` / `disconnect` / `write`, eventos `connection` y `bytes`), así
que **arriba de `sensor.js` nadie sabe cuál de los dos está enchufado**.
Cambiar de simulado a real es cambiar qué clase se instancia.

---

## El diseño

Salió de cinco referencias generadas con IA (una por pantalla), que están en
`docs/referencias/` junto con el razonamiento en **`docs/DISENO.md`**. Ahí se
explica por qué todo lo que se toca es una píldora, por qué los números
medidos van en monoespaciada y los que elegís vos en la sans pesada, y qué
cosas de las referencias se descartaron.

Las imágenes del sensor son **el render real del prototipo**, no dibujos.
`docs/recortar_dispositivo.py` le saca el fondo blanco con un relleno por
inundación desde los bordes — un umbral por brillo habría borrado también el
logo blanco de la tapa.

**El símbolo de la marca sale del favicon** (`docs/extraer_simbolo.py`), que
es el logo real impreso en la tapa del sensor: dos picos y una flecha. El
`logo.svg` de la landing es otra cosa — una montaña de nueve vértices
dibujada a mano que en tamaño chico se lee como un garabato. No usarlo.

**El wordmark lleva punto: `BOOST.`**, con el punto en coral. Es parte del
nombre, igual que en el nav de la landing, no un adorno.

## Sonido

Todo sintetizado con Web Audio, sin un solo archivo de audio: pesa 4 KB en
vez de varios cientos, y la política de seguridad de la app (`connect-src
'self'`) no permitiría traerlo de ningún CDN igual.

El sonido que de verdad sirve es el de la repetición: **la altura sale de la
velocidad medida contra la mejor rep de la serie**. Con el teléfono apoyado a
dos metros, el atleta escucha la fatiga sin poder mirar la pantalla — que es
exactamente lo que le pasa con la barra sobre el pecho. Los botones de carga
también recorren la escala, así que apretar «+» cinco veces suena como una
progresión y no como cinco clics iguales.

Se puede silenciar desde la barra de arriba y la preferencia se guarda.
`docs/DISENO.md` explica por qué suena a instrumento y no a juguete.

## Manos libres — la velocidad dicha en voz alta

**Agregado el 4/9/2026.** `js/voz.js`. El tono de la repetición dice si esta
fue más lenta que la anterior; la voz dice **cuánto**. Con auriculares
puestos, el número llega sin soltar la barra ni girar la cabeza hacia el
teléfono: es la única forma de que el dato sirva *durante* la serie y no
después, que es cuando ya no se puede hacer nada con él.

Se prende con el botón de onda de la barra de arriba, al lado del de sonido.
**Arranca apagado**, al revés que el sonido: una app que se pone a hablar
sola la primera vez que se abre, en un gimnasio y con el volumen donde haya
quedado, es una app que se desinstala. Al prenderlo dice «Manos libres
activado» — así se sabe *antes* de empezar la serie si el audio sale por los
auriculares o por el parlante del teléfono, que es la única prueba que
importa.

Usa `speechSynthesis`, que ya viene en el navegador: **no descarga voces, no
llama a ninguna API y no obliga a tocar el `connect-src 'self'`**. Costo cero
por reproducción y funciona en modo avión. Una API de voz en la nube habría
metido latencia de red justo en el momento donde la latencia importa.

Qué dice, y por qué así:

| Momento | Dice | Por qué |
|---|---|---|
| Terminó la calibración | «Listo» | El atleta ya está montando la barra y no puede mirar |
| Cada repetición, de la 2ª en adelante | «cincuenta y ocho» | Forma corta, la que canta un entrenador. La larga tarda casi tres segundos y todavía está hablando cuando el atleta ya bajó la barra otra vez |
| La pérdida cruza el 20 %, una vez por serie | «Pérdida veinticuatro por ciento. Buen momento para cortar» | Es la única decisión que el producto existe para tomar. Esa repetición **no** dice el número: decir las dos cosas juntas entierra la que importa |
| Fin de la serie | «Seis repeticiones. Pérdida nueve por ciento» | Acá ya soltó la barra, así que puede ser la frase larga |

**Lo nuevo pisa a lo viejo.** Si llega otra repetición mientras habla, se
corta y se dice la nueva: un número atrasado es peor que ningún número,
porque el atleta corrige contra un dato que ya no es el suyo.

**Las trampas del API, todas pisadas al menos una vez** — están comentadas
una por una en `js/voz.js`, pero las dos que más cuestan: `getVoices()`
devuelve vacío al principio (si se elige la voz en la carga, la primera frase
sale en inglés en un teléfono configurado en inglés), y `cancel()` seguido de
`speak()` en el mismo tick no emite nada en el Chrome de Android.

**Lo que falta probar, y va el 6/10/2026 con la placa:** los auriculares
Bluetooth y el sensor comparten la radio del teléfono. A2DP y BLE conviven
bien en Android moderno, pero **no está verificado en este proyecto**. Si
aparecen cortes de audio o caídas del sensor con los dos conectados, hay que
mirar ahí antes que en el firmware.

La conversión de número a palabras está testeada (`npm test`): es la única
parte con lógica, y un número mal dicho no falla — dice otra cosa, y el
atleta corrige la carga contra un dato equivocado sin enterarse.

## Decisiones que no conviene romper

**El protocolo es un contrato de tres puntas.** `js/protocol.js`,
`firmware/src/ble/protocol.h` y `firmware/tools/decode.py` tienen que
decir lo mismo. Si cambia el layout de un struct, se sube
`SCHEMA_VERSION` y se tocan los tres. Agregar un valor a un enum (como
pasó con `CALIBRATING`) **no** sube la versión: no mueve ningún campo.

**Los payloads con una versión desconocida se descartan en silencio.** Es
lo que dice el protocolo y es lo correcto: una app vieja frente a un
firmware nuevo tiene que seguir andando, no romperse.

**`[hidden] { display: none !important }` en el CSS.** La regla del
navegador para `[hidden]` pierde contra cualquier clase que ponga
`display`, y varios paneles son flex. Sin eso, la pantalla en vivo se
dibuja encima de la de conectar. Ya pasó una vez.

**La animación del número grande no toca la opacidad.** Los navegadores
congelan las animaciones CSS cuando la pestaña pasa a segundo plano. Si el
primer frame fuera medio transparente, el número quedaría gris y a medio
tamaño hasta la repetición siguiente. Por la misma razón no hay ningún
candado que se suelte con `requestAnimationFrame`: sin frames, no se
suelta nunca.

**La aguja de la regla va fuera del contenedor que scrollea.** Adentro se
desplaza junto con los ticks y deja de marcar el centro.

**La regla se recalcula cada vez que se muestra el panel.** `clientWidth`
de un elemento oculto es 0, y con eso los márgenes quedan mal y la aguja
apunta a un peso que no es.

**Las barras de la pantalla en vivo se escalan desde cero**, no desde el
mínimo de la serie. Con un eje que arranque en el mínimo, una caída del 3%
se dibuja como un derrumbe y la app miente sobre la fatiga.

**El color va en la pérdida, no en el número grande.** Teñir la velocidad de
ámbar hacía que la lectura pareciera un error de la app: el número es lo que
el sensor midió y no cambia de naturaleza porque el atleta esté cansado. El
que cambia de significado es el porcentaje.

**La imagen del sensor lleva `z-index`.** Los anillos de búsqueda son
`absolute` y, sin eso, pintan por encima de un elemento sin posicionar: el
aro cruzaba la tapa del sensor.

**La foto de montaje aparece sólo con `HIGH_ROTATION`.** Mostrarla siempre la
convertiría en decoración que se deja de ver a la segunda serie; apareciendo
justo cuando el sensor sospecha que está torcido, es la respuesta al problema.

**El 1RM estimado nunca se muestra solo.** Va siempre con su r², el número
de series y el rango de cargas. Un 1RM extrapolado a partir de tres series
todas con el mismo peso es un número inventado con aspecto de dato; la
etiqueta de confianza está para que no se lea como una medición.

**El error del sensor se avisa sólo cuando cambia el código.** El firmware
repite `last_error` en cada `Status`, y `Status` llega cada 10 segundos:
avisar en cada uno haría aparecer el mismo cartel seis veces por minuto.

---

## Lo que falta

- **Probarla contra el sensor real.** Nada de lo de acá tocó una placa.
  Es el mismo estado que el firmware: escrito y testeado contra un doble
  de prueba, sin evidencia de hardware.
- **Pantalla de configuración del sensor.** El protocolo permite cambiar
  los umbrales por BLE (`Config`, `encodeConfigWrite` ya está escrito), y
  eso es lo que va a permitir calibrar el doble toque en el gimnasio sin
  volver a la computadora. La interfaz para hacerlo no está.
- **Descarga del log interno.** `LOG_DUMP` y `RawStream` no están
  implementados en la app. Son las que producen el dataset para mejorar
  el algoritmo.
- **Perfil por usuario.** Hoy el historial es del teléfono, sin cuentas.
  Está bien para la versión 1 y es coherente con el modelo sin
  suscripción obligatoria.
