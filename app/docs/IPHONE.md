# iPhone: qué se puede, qué no, y qué hay que cumplir

> Revisado el 30 de agosto de 2026 contra fuentes actuales. Los enlaces
> están al final. Apple cambia estas reglas seguido: si estás leyendo esto
> mucho después, verificá antes de tomar decisiones caras.

---

## Resumen en cinco líneas

1. **La app funciona en iPhone. El sensor no.** Ningún navegador de iOS
   tiene Web Bluetooth, y eso no lo arregla ningún truco de código.
2. Para el sensor en iPhone hay tres caminos, y **ninguno es gratis**.
3. Como PWA, iOS tiene una trampa seria: **borra los datos a los 7 días**
   si la app no está instalada en la pantalla de inicio.
4. Legalmente, mientras sea una web que no recolecta nada, **estás
   tranquilo**. El riesgo legal está en la landing, no en la app.
5. El día que vendas hardware o publiques en la App Store, cambia todo.

---

## Parte 1 — Por qué el sensor no anda en iPhone

Safari no implementa Web Bluetooth. Y en iOS **todos** los navegadores usan
WebKit por dentro: el Chrome del iPhone es Safari con otro ícono, así que
tampoco lo tiene. El bug abierto en WebKit para esta API lleva años sin que
nadie tenga la tarea asignada, y Apple no publicó una posición oficial.

No es un problema del código de BOOST. Es una decisión de Apple, y su
argumento es de privacidad: escanear dispositivos Bluetooth cercanos permite
identificar a una persona por lo que tiene alrededor.

### Los tres caminos, con su precio real

| Camino | Qué cuesta | Qué se gana | Qué se pierde |
|---|---|---|---|
| **A. No soportar iPhone en la v1** | $0 | Seguís con lo que ya funciona | La mitad del mercado, aproximadamente |
| **B. Navegador con Web BLE** (Bluefy) | $0 para vos | Funciona hoy, sin escribir código | El usuario tiene que instalar OTRA app y abrir tu web ahí adentro. Se siente barato |
| **C. App nativa o híbrida** | Mac + **US$99/año** de Apple Developer Program | La experiencia real, y estás en la App Store | Dinero, tiempo, y entrar en el proceso de revisión de Apple |

**Bluefy** es un navegador de iOS que implementa Web Bluetooth puenteando a
CoreBluetooth. Está en la App Store, se actualiza (última versión de enero de
2026) y funciona con webs servidas por HTTPS — que es el caso de BOOST. Es la
salida de emergencia decente mientras no haya app nativa: el usuario instala
Bluefy, abre `app.getboost.fit` ahí, y el sensor conecta.

**Recomendación:** para la prueba del gimnasio, camino A. Vas a usar tu
Android. Gastar US$99 y semanas de trabajo en iOS **antes** de saber si el
sensor cuenta repeticiones con 95% de precisión es invertir en la parte
equivocada. El camino C se justifica el día que el sensor funcione y haya
gente esperando comprarlo.

---

## Parte 2 — La trampa de los 7 días

Esta es la que más te puede doler y no tiene nada que ver con el Bluetooth.

Safari borra **todo** el almacenamiento de un sitio —localStorage,
IndexedDB, service workers— después de **7 días sin que lo visites**. Es
parte de su sistema anti-rastreo. Para BOOST significa: te vas de viaje dos
semanas, volvés, y **el historial entero no está**.

**La app que se agrega a la pantalla de inicio queda exenta**: lleva su
propio contador de uso y no la alcanza esa limpieza.

Por eso la app ahora, en iPhone y sólo si no está instalada, muestra un
aviso explicando que hay que instalarla y por qué. No es una sugerencia de
marketing: es la diferencia entre conservar los datos o perderlos.

**Mitigación adicional que ya existe:** el botón "Exportar CSV" del
historial. Vale la pena decirle a la gente que lo use de vez en cuando.

---

## Parte 3 — Requisitos técnicos de iOS, y cómo quedaron

Todo esto ya está implementado. Se lista para que no se rompa sin querer.

| Requisito | Por qué | Dónde |
|---|---|---|
| `viewport-fit=cover` + `safe-area-inset-*` | Sin los márgenes seguros, la barra de arriba se dibuja **debajo del notch** y la de abajo queda pisada por la barra de gestos | `index.html`, `app.css` |
| `apple-mobile-web-app-capable` | iOS todavía no entiende el `mobile-web-app-capable` estándar. Van los dos | `index.html` |
| `apple-mobile-web-app-title` | Sin esto, bajo el ícono aparece el `<title>` largo y cortado | `index.html` |
| `status-bar-style: black-translucent` | Con `black` queda una franja que no es del mismo negro que la app | `index.html` |
| `apple-touch-icon` de 180×180 | iOS ignora los íconos del manifest | `assets/` |
| `overscroll-behavior-y: none` | El rebote elástico despegaba la interfaz y dejaba ver el fondo del sistema | `app.css` |
| `100dvh` en vez de `100vh` | En Safari móvil la barra de direcciones aparece y desaparece, y con `vh` el layout salta | `app.css` |

### Lo que iOS no tiene y la app maneja sin romperse

- **Vibración.** `navigator.vibrate` no existe en iOS. Está detrás de un
  guard, así que no falla, simplemente no vibra.
- **Wake Lock** (mantener la pantalla encendida durante la serie). Existe
  desde iOS 16.4. Está envuelto en `try/catch` por las versiones viejas.
- **Notificaciones push.** Sólo funcionan si la app está instalada en la
  pantalla de inicio. BOOST no las usa, pero tenelo presente si algún día
  querés avisar del descanso entre series.

### Lo que falta y no es urgente

**Splash screens.** Al abrir una PWA instalada, iOS muestra una pantalla en
blanco hasta que carga, porque no genera la pantalla de arranque sola: hay
que declarar una imagen por cada tamaño de pantalla con
`apple-touch-startup-image`. Son unas diez imágenes. Se ve peor de lo que es,
pero conviene hacerlo antes de mostrárselo a alguien que decide comprar.

---

## Parte 4 — Lo legal

### Hoy, como está: riesgo bajo

La app **no recolecta ningún dato**. Todo vive en el teléfono, no hay
cuentas, no hay servidor, no se sube nada. Eso no es sólo una decisión
técnica: es lo que te saca de encima casi toda la obligación legal.

### Donde sí hay algo que hacer: la landing

La landing **sí** guarda correos electrónicos en Firebase. Eso es una base de
datos personales, y en Uruguay la Ley 18.331 exige:

1. **Registrar la base ante la URCDP** antes de empezar a tratar los datos
   (Decreto 414/009). Aplica también a bases de clientes y suscriptores.
2. **Informar al usuario** para qué se usan sus datos, con una política de
   privacidad accesible.
3. **Pedir consentimiento explícito.**
4. **Avisar en 72 horas** a la URCDP y a los afectados si hay una filtración.

Es trámite, no es caro, y no tiene por qué frenarte el proyecto. Pero es una
obligación real y la lista de espera ya está juntando correos.

### El día que vayas a la App Store

Apple mira con lupa las apps de salud y fitness:

- **No podés presentarlo como dispositivo médico.** BOOST mide velocidad de
  barra, así que estás lejos de esa línea, pero cuidá el lenguaje: nada de
  "diagnostica", "evalúa tu salud" o similares.
- **Si afirmás precisión, tenés que poder demostrarla.** Apple rechaza apps
  cuya metodología no se puede validar, y **un disclaimer no alcanza** si la
  afirmación es fuerte. Esto conecta directo con la prueba del gimnasio: el
  95% de precisión contra conteo por video no es sólo validación técnica, es
  también tu respaldo frente a la revisión de Apple.
- **Conviene recomendar consultar a un profesional** antes de decisiones de
  entrenamiento fuertes.

Por eso la pantalla de Perfil ahora cierra con una línea que dice que BOOST
no es un dispositivo médico y que el 1RM estimado es una proyección, no un
peso levantado. Va ahí y no en un cartel de bienvenida que nadie lee: al lado
del número que podría hacerle creer otra cosa a alguien.

### Vender el hardware

Cuando pases de la lista de espera a cobrar, aparecen tres cosas que hoy no
existen:

- **Defensa del consumidor:** garantía legal, derecho de arrepentimiento en
  compras a distancia, información clara de precio y plazo de entrega.
- **Responsabilidad por producto:** un imán que se suelta con 100 kg arriba
  es un riesgo físico real. Vale la pena una instrucción de colocación
  explícita y probar el agarre en serio.
- **Términos y condiciones** que digan qué hace el producto y qué no.

Nada de esto es motivo para frenar. Es la lista de lo que hay que ordenar
antes de la primera venta, no antes de la primera prueba.

---

## Fuentes

- [Web Bluetooth — Can I use](https://caniuse.com/web-bluetooth)
- [WebKit Bug 101034 — Web Bluetooth API](https://bugs.webkit.org/show_bug.cgi?id=101034)
- [Bluefy – Web BLE Browser (App Store)](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055)
- [PWA iOS Limitations and Safari Support (2026)](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [Safari iOS PWA Data Persistence Beyond 7 Days — Apple Developer Forums](https://developer.apple.com/forums/thread/710157)
- [App Review Guidelines — Apple Developer](https://developer.apple.com/app-store/review/guidelines/)
- [Guía general de Protección de Datos Personales en Uruguay — URCDP](https://www.gub.uy/unidad-reguladora-control-datos-personales/comunicacion/publicaciones/guia-general-proteccion-datos-personales-uruguay)
- [Ley N.º 18.331 (texto completo)](http://www.oas.org/es/sla/ddi/docs/U4%20Ley%2018.331%20de%20Protecci%C3%B3n%20de%20Datos%20Personales%20y%20Acci%C3%B3n%20de%20Habeas%20Data.pdf)
