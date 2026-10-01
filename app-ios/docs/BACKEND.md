# Back-end de BOOST

Hecho el 25/9/2026. Todo está escrito y probado contra los emuladores de Firebase y contra una API de Claude simulada. **Todavía no hay nada en la nube**: los pasos de abajo los hacés vos con tus cuentas y se hacen una sola vez.

## Cómo está armado

```
App (iPhone)
  ├─ Firebase Auth ........ cuentas: email, Apple, Google
  ├─ Firestore ............ perfil, series, soporte (reglas: backend/firestore.rules)
  ├─ RevenueCat ........... cobro de Apple (Pro / Élite)
  └─ api.getboost.fit ..... Cloudflare Worker (backend/worker)
        ├─ POST /nova/ask   Nova con Claude; verifica que tenga Pro/Élite
        └─ DELETE /account  borra cuenta, perfil, series, soporte y el cliente de RevenueCat
```

- **Primero el teléfono, después la nube.** La app guarda todo al instante en el teléfono y además lo escribe en Firestore. Si no hay señal, lo sube cuando vuelve. Al entrar en otro teléfono se baja todo.
- **Por qué un Worker y no Cloud Functions:** las Functions exigen el plan Blaze (tarjeta). El Worker es gratis hasta 100.000 pedidos por día, y getboost.fit ya está en Cloudflare.
- **Nova lee los datos en el servidor.** El perfil y las últimas 40 series salen de Firestore, no de lo que manda el teléfono. Modelo `claude-opus-5` con esfuerzo `medium`, las dos cosas configurables en `wrangler.toml`. Si Claude rechaza un pedido, la API lo reintenta sola con otro modelo (`fallbacks: "default"`). El tope es 40 mensajes por día en Pro y 120 en Élite.
- **Sensor:** `src/velo/sensor.js` usa el protocolo real del firmware, importado de `app/js/protocol.js`. El sensor se anuncia como `VBT-XXXX`.

## Probar en tu PC

```
cd app-ios/backend
npm install
npm test               # 7 pruebas de las reglas de Firestore
npm run test:worker    # 4 pruebas del Worker de punta a punta
npm run emu            # deja los emuladores prendidos
```
Con los emuladores prendidos: `npm run preview` en `app-ios/`, abrir `http://localhost:5173/?emu` y la app usa cuentas y datos locales de prueba. Si el navegador saca el `?emu`, correr `localStorage['velo.emu']='1'` en la consola.

## Datos reales en las pantallas (`src/velo/real.js`)

El diseño trae datos de ejemplo fijos (Martina, el 1RM de 108 kg, "Martes 23 de setiembre"). En la app real, `real.patch()` los cambia por los del atleta justo antes de dibujar: plan del día, velocidad a la carga de referencia, 1RM estimado con el perfil carga-velocidad de `app/js/lv.js`, récords, historial, avisos, disposición del día, hallazgos de Nova, semana y estado del sensor. En el link demo (`window.VELO_DEMO`) no se toca nada. En el diseño hubo que convertir 12 textos fijos en variables (`homeDate`, `homeEx`…), cada una con su valor de ejemplo por defecto.

## Puesta en marcha (una sola vez)

**Estado al 25/9/2026 — hecho:** proyecto `boost-vbt-app` (cuenta boost.vbt@gmail.com, plan Spark gratis), app web y app iOS `app.boost.velo` registradas, Correo/contraseña y Google activados, Firestore creado (quedó en `nam5`, EE.UU., no en São Paulo: la latencia no importa por la caché offline), reglas publicadas y probadas en producción, KV `NOVA_KV` creado, Worker desplegado en https://api.getboost.fit (`/health` responde). La config pública ya está en `src/velo/firebase.js` y el client ID de Google en `auth.js` y `setup_native.rb`.
**Falta:** los secretos `FIREBASE_SERVICE_ACCOUNT` y `ANTHROPIC_API_KEY` en el Worker (hasta entonces Nova y "Eliminar cuenta" fallan), Apple (necesita Apple Developer) y RevenueCat.

**Atajo:** después de `npx firebase login`, desde `backend/`:
```
npm run setup:todo
```
Crea el proyecto `boost-vbt-app` (o el de `BOOST_PROJECT`), la app web, Firestore en São Paulo y las reglas; escribe la config en `src/velo/firebase.js`; crea el KV y despliega el Worker. Al final te dice los tres pasos que quedan a mano (métodos de ingreso, clave de la cuenta de servicio, clave de Claude). El detalle paso a paso:

**1. Firebase** (console.firebase.google.com, con la cuenta del proyecto)
1. Crear el proyecto `boost-app`. Analytics no hace falta.
2. En Authentication → Método de acceso, activar Correo/contraseña, Google y Apple.
   - Para Apple: Team ID, Key ID y la clave `.p8` de *Sign in with Apple*, que salen de developer.apple.com. Hacen falta para revocar el token cuando alguien borra la cuenta.
3. Crear Firestore en modo producción, ubicación `southamerica-east1` (São Paulo, lo más cerca de Uruguay).
4. En Configuración → Tus apps, agregar una app web y copiar `apiKey` y `appId` en `src/velo/firebase.js`.
5. Publicar las reglas: `cd backend && npx firebase login && npm run deploy:rules`.
6. En Cuentas de servicio → Generar clave privada, bajar el JSON. **No lo subas a git.**

**2. Google** (console.cloud.google.com, proyecto boost-app): en Credenciales, crear un ID de cliente OAuth de tipo iOS con el bundle `app.boost.velo`. Copiarlo en `GOOGLE.iOSClientId` (`src/velo/auth.js`) y en la variable `GOOGLE_IOS_CLIENT_ID` de Codemagic.

**3. Cloudflare Worker**
```
cd backend/worker
npx wrangler kv namespace create NOVA_KV     # pegar el id en wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT   # pegar el JSON entero
npx wrangler secret put REVENUECAT_SECRET
npm run deploy
```
Después poné `api: 'https://api.getboost.fit'` en `src/velo/firebase.js`.

**4. RevenueCat:** los pasos están en `docs/INTEGRACION.md`. La clave pública (`appl_...`) va en `payments.js`, y la secreta (`sk_...`) va en el Worker.

## Lo que falta (no bloquea TestFlight)
- **Vista entrenador (Élite):** invitar atletas, ver su disposición y mandar ajustes. El diseño la tiene y el back-end todavía no.
- **Modo voz de Nova:** la pantalla simula que escucha (escribe sola una pregunta de ejemplo). Para escuchar de verdad hace falta un plugin de reconocimiento de voz.
- **El creador de rutinas** arma la rutina con plantillas fijas por objetivo, no con Nova.
- **Buscar actualización del sensor (OTA):** la pantalla siempre dice "Estás al día"; el firmware todavía no tiene OTA.
- **Errores en pantalla:** los de ingreso ya se muestran en el subtítulo ("Email o contraseña incorrectos."), y si el sensor no aparece en 15 s cambia el texto de la pantalla de vinculación. No hay pantallas de error propias en el diseño.
- **Push desde el servidor** (resumen semanal, avisos de Nova): hoy solo hay notificaciones locales.
