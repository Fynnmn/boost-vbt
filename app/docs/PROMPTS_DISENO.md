# Prompts para generar referencias visuales de la app

> Objetivo: sacar imágenes de referencia con IA para decidir el diseño. No son mockups finales ni especificaciones, son material para elegir dirección.

## Cómo usarlos

**En inglés.** Todos los generadores de imagen entienden mucho mejor el inglés, sobre todo para vocabulario de diseño de producto.

**Ratio 9:19.5** (o 9:16 si el modelo no acepta otro). Es la proporción del iPhone.

**Generá 4 variantes de cada uno antes de juzgar.** La primera imagen de un prompt casi nunca es la mejor.

**No pidas texto largo.** Los modelos de imagen escriben mal. Los prompts están armados para que el texto sea números grandes y etiquetas de una palabra, que es lo que sí sale bien — y que además es lo que corresponde en una app que mirás entre series, con la respiración agitada.

**Bloque de estilo base:** va al final de cada prompt. Está separado para que puedas cambiarlo una vez y regenerar todo con la misma dirección.

```
STYLE BLOCK (append to every prompt):
iOS 18 app UI, iPhone 16 Pro screen, Dynamic Island visible at top, status bar
with time and battery. Minimalist high-end design, generous negative space,
strong typographic hierarchy, SF Pro typeface. Motion-graphics sensibility:
subtle velocity trails, easing curves, momentum, elements that feel like frozen
frames of a smooth animation. Premium sports-tech aesthetic, editorial layout,
restrained color palette chosen by the designer. Crisp vector-sharp rendering,
pixel-perfect, no photographic texture, no skeuomorphism, no drop shadows on
text. Rendered as a clean UI design mockup, straight-on view, no device bezel
distortion, no hands, no reflections.
```

## 1. Pantalla en vivo — la más importante

Es la que el usuario mira entre series, sudado y con poco aire. Tiene que leerse de un metro de distancia.

```
Design the main live-tracking screen of a weightlifting velocity app for iPhone.
A barbell sensor is streaming data in real time. The screen shows the current
set in progress: one enormous number dominating the layout — the velocity of
the last completed repetition in meters per second, e.g. "0.62" — with a tiny
"m/s" label. Below it, a horizontal row of small vertical bars, one per
completed rep, each bar's height representing that rep's velocity, showing the
downward drift as fatigue accumulates. A live animated waveform or motion trail
representing the bar path currently in motion. Small unobtrusive chips at the
top showing the exercise name and the load in kilograms. A subtle connection
indicator showing the sensor is linked. Nothing else. No navigation bar, no
clutter.

[STYLE BLOCK]
```

## 2. Resumen de serie

Aparece al cerrar la serie. Es el momento de recompensa.

```
Design a post-set summary screen for a weightlifting velocity app on iPhone.
The set just ended. The hero element is a large elegant line chart showing
velocity per repetition across the set — a line that starts high and decays,
with each rep as a point. Below it, three or four large stat blocks with big
numbers and one-word labels: rep count, best velocity, average velocity, and a
percentage showing velocity loss across the set. One of the stats is visually
emphasized as the key insight of the set. A single primary action button at the
bottom. The overall feeling is a rewarding, satisfying recap — the moment the
athlete sees what they just did.

[STYLE BLOCK]
```

## 3. Emparejar el sensor

La primera impresión del producto. Si esta pantalla se siente barata, el hardware se siente barato.

```
Design the sensor-pairing screen of a fitness app for iPhone. The app is
searching for a small magnetic barbell sensor over Bluetooth. Center of the
screen: an elegant minimal illustration or abstract geometric representation of
a small rounded rectangular device, surrounded by soft concentric pulsing rings
suggesting a Bluetooth search in progress — rendered as a frozen frame of a
smooth looping animation. Below, a short reassuring line of text and a
discovered device entry showing a device name and a signal strength indicator.
The mood is calm, premium, confidence-inspiring — the first moment the user
meets the hardware.

[STYLE BLOCK]
```

## 4. Antes de la serie: ejercicio y carga

```
Design a pre-set configuration screen for a weightlifting app on iPhone. The
user picks an exercise and dials in the load before starting. A large elegant
numeric input showing the weight in kilograms as a big number, adjusted by a
horizontally scrollable ruler-style picker or a smooth rotary control. Above
it, a compact horizontal selector of exercise names with the current one
highlighted. At the bottom, one large confident primary button to start the
set. Extremely reduced interface — three elements and nothing more. The design
should feel fast to operate with one hand, standing at a rack.

[STYLE BLOCK]
```

## 5. Perfil carga-velocidad — la pantalla que justifica la suscripción

Es lo que un tracker gratis no puede darte. Vale la pena que se vea como la joya de la app.

```
Design an analytics screen for a weightlifting velocity app on iPhone, showing
an athlete's load-velocity profile. The hero is a beautiful scatter plot with a
fitted regression line trending downward: heavier loads on one axis, slower
velocities on the other, with individual training sessions as scattered points
in varying opacity to convey recency. A projected one-rep-max value is called
out as a large number. Below the chart, a compact horizontal strip of recent
sessions. The screen should feel like a sophisticated data instrument — the
kind of analysis a professional strength coach would pay for — while remaining
calm and readable. Data visualization as the centerpiece.

[STYLE BLOCK]
```

## 6. Historial

```
Design a training history screen for a weightlifting app on iPhone. A vertical
list of recent training sessions, each row compact and elegant: date, exercise,
a very small inline sparkline of that session's velocity curve, and one key
metric. At the top, an activity heatmap grid or a clean summary strip showing
consistency over recent weeks. The list should feel scannable and calm, with
strong typographic rhythm and clear separation between rows without heavy
dividers.

[STYLE BLOCK]
```

## 7. Un tiro libre para que la IA proponga

Vale la pena tirar este y ver qué sale. A veces aparece una idea que no se te hubiera ocurrido pedir.

```
You are a senior product designer at a company that makes premium sports
hardware. Design the flagship screen of an iPhone app that pairs with a small
magnetic sensor mounted on a barbell, measuring the velocity of every
repetition an athlete performs. Choose the visual direction yourself: color
palette, typographic scale, layout, and the single metric that deserves to
dominate the screen. The app is used mid-workout, glanced at for two seconds
between sets, by someone out of breath. Make it beautiful and make it obvious.
Surprise me with the concept.

[STYLE BLOCK]
```

## Negative prompt

Si el generador lo acepta:

```
cluttered UI, tiny unreadable text, gibberish text, lorem ipsum, generic
dashboard template, stock photo, gym photograph, human hands, 3D render,
glossy plastic, heavy gradients, neon glow, dark blue corporate startup look,
Material Design, Android UI, device bezel, angled perspective, mockup shadows,
watermark, logo
```

## Variantes que conviene pedir de la pantalla 1

La pantalla en vivo es la que más importa. En vez de generar una sola dirección, forzá contraste agregando una línea al final del prompt:

- `Dark interface, near-black background, single accent color.`
- `Light interface, warm off-white background, high contrast typography.`
- `Bold editorial style, oversized typography treated as the main graphic element.`
- `Data-instrument style, precise, technical, dense with fine detail.`

Cuatro direcciones distintas de la misma pantalla se comparan mucho mejor que veinte variaciones de la misma idea.

## Después de generar

Estas imágenes son **referencia, no especificación.** Sirven para decidir dirección visual, no para copiar píxel a píxel: los generadores no respetan las guías de iOS, inventan espaciados imposibles y escriben mal el texto.

El paso siguiente es tomar las 2 o 3 que más te gusten, extraer las decisiones concretas (paleta, escala tipográfica, jerarquía, qué métrica domina) y recién ahí armar el diseño real.

**Una restricción que ninguna imagen te va a mostrar:** la pantalla en vivo se mira dos segundos, de lejos, con la vista cansada. Si una referencia es preciosa pero necesita que te acerques a leerla, no sirve. Ese es el filtro.
