# Puntos de conexión con el back-end

> **25/9/2026:** auth.js, data.js, nova.js y sensor.js ya están implementados (Firebase, Worker de Cloudflare y el protocolo real del firmware). Cómo está armado y cómo ponerlo en marcha: **docs/BACKEND.md**. Los contratos de abajo siguen valiendo.

Cada punto está aislado en `src/velo/`. Las pantallas no importan nada de estos archivos:
llaman a `window.VELO.<módulo>.<función>()`. Si respetás el contrato (lo que recibe y lo que devuelve),
podés cambiar la implementación sin tocar el diseño.

## auth.js
| Función | Cuándo la llama la app | Devuelve |
|---|---|---|
| `signUpEmail(email, pw)` | Crear cuenta → email | `{ id, email, token, isNew: true }` |
| `signInEmail(email, pw)` | Ingresar → email | `{ id, email, token, isNew: false }` |
| `signInApple()` | Botón Apple | ya abre el sheet nativo; mandá `identityToken` a tu servidor |
| `signInGoogle()` | Botón Google | mismo contrato (según tu proveedor) |
| `resetPassword(email)` | "Mandar enlace" | — |
| `signOut()` / `deleteAccount()` | Perfil → Sesión | — |
| `current()` / `token()` | al abrir la app / en cada llamada a tu API | usuario guardado / JWT |

Si `isNew` es true, la app sigue al onboarding (nombre, rol…). Si es false, carga el perfil y va a Inicio.

## data.js
- `loadProfile()` / `saveProfile(p)`: se guarda al terminar el onboarding y al editar el perfil.
  `p = { name, role, bw, hgt, age, goals, level, exs, custom, loads, week, unit, remind }`
- `saveSet(s)`: al terminar cada serie. `s = { exercise, load, setNo, reps: [m/s…], at }`
- `sendSupport({ topic, message, email })`: formulario "Escribinos".
- `exportFile({ range, format })`: ya genera el CSV/JSON con las series guardadas y abre Compartir.

**Qué va en el servidor y qué queda en el teléfono:** hoy todo queda en el teléfono (Preferences).
Los `TODO nube` marcan dónde sincronizar para los planes pagos.

## payments.js (RevenueCat)
1. App Store Connect → suscripciones en un grupo: Pro mensual/anual, Élite mensual/anual, con 7 días de prueba.
2. RevenueCat → entitlements `pro` y `elite`; Offering *default* con paquetes `pro_monthly`, `pro_annual`, `elite_monthly`, `elite_annual`.
3. En `payments.js`: `apiKey`, y `enabled: true`.

La app llama a `purchase(plan, billing)` al tocar "Empezar 7 días gratis", a `restore()` en Restaurar compras y a `status()` al abrir.
Todas devuelven `{ active, plan, renews }`.

## nova.js
`ask(question, { history, profile })` → `POST {endpoint}/nova/ask` con el token del usuario → `{ text, chip }`.
La clave de la IA vive **solo en tu servidor**. Con `endpoint: null` responde con los textos del prototipo.

## sensor.js
Ya habla el protocolo del firmware (`app/js/protocol.js`): servicio `7d4e1a00-…`, RepResult → velocidad media concéntrica, SET_START con ejercicio y carga, SET_STOP. La calibración la hace el sensor solo al arrancar cada serie.
La app llama a `scan()` en Vincular, a `connect()` en Conectar, a `calibrate()` en Calibrar,
y a `startSet(cb)` / `stopSet()` en la sesión en vivo. Cada rep que avise el sensor entra a la misma
animación del diseño (ondas, línea de corte, voz).

## Lo que cambió respecto del prototipo (y por qué)
1. **Hoja de pago propia → hoja de Apple.** En el iPhone, "Empezar 7 días gratis" abre directo el cobro de Apple
   (Apple no permite otros medios de pago para suscripciones digitales). La hoja del prototipo sigue en el navegador.
2. **"Apple ID m••••@icloud.com" en Restaurar compras.** Apple no le da el Apple ID a las apps. Hoy se muestra el
   dato simulado; decidí si ahí va el email de la cuenta BOOST o si se saca esa fila.
3. **Estados que el diseño no tiene** (se agregan solo si los pedís): error de login, sensor no encontrado,
   Bluetooth apagado. Hoy fallan en silencio (log en consola). Nova sin conexión muestra
   "No pude conectarme. Probá de nuevo en un rato."
4. **Notificación de descanso** (si bloqueás el teléfono): "Descanso terminado · Arrancá la próxima serie." Editable en `notify.js`.
5. **Datos de ejemplo** que siguen fijos en el diseño y hay que alimentar desde `data.js` cuando tengas el back-end:
   gráficos de Progreso (`PG`), lista de atletas (`ATH`), rutina del día (`TODAY`), el primer mensaje de Nova,
   la batería/ID del sensor en Vincular y Sensor.

## Riesgos a probar en iPhone real
- Sensor + auriculares Bluetooth al mismo tiempo.
- Pantalla bloqueada durante la serie: la app mantiene la pantalla encendida en la sesión en vivo; si igual se bloquea,
  iOS puede pausar la parte web. Si pasa, el paso siguiente es mover la lectura del sensor a Swift (no cambia el diseño).
- Voz con música: que baje y vuelva a subir.
