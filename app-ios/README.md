# BOOST (VELO) · app iOS con Capacitor

La app es **el mismo front-end del diseño** metido en una app nativa. No se reescribió nada visual.

## Regla principal
`design/VELOPhone.dc.html` es el diseño. **No se tocan** colores, medidas, textos ni animaciones.
Lo único que se agregó al diseño son *enganches* (`window.VELO.*`) que:
- en el navegador no existen → el prototipo funciona igual que siempre, con su simulación;
- en el iPhone llaman a la capa nativa (Bluetooth, voz, compras de Apple, notificaciones).

## Estructura
```
design/                 ← el diseño (fuente de verdad). Si lo actualizás, reemplazá este archivo.
src/velo/               ← capa nativa, un archivo por punto de conexión
  auth.js               ← cuentas (Apple, Google, email)         · Firebase (simulado hasta FIREBASE.apiKey)
  data.js               ← perfil, series, soporte, exportar       · teléfono + Firestore
  payments.js           ← RevenueCat / StoreKit                   · SIMULADO hasta RC.enabled
  nova.js               ← IA de Nova vía el Worker                · simulado hasta FIREBASE.api
  sensor.js             ← Bluetooth del sensor                    · protocolo real del firmware
  voice.js              ← voz manos libres (nativa)               · real
  notify.js             ← notificaciones locales                  · real
  live.js               ← Dynamic Island + pantalla bloqueada     · real
  core.js / native.css  ← marco a pantalla completa, barra de estado
ios-native/             ← Swift: plugin propio + extensión Live Activity
scripts/build-www.mjs   ← arma www/ desde design/ (no modifica el diseño)
scripts/ios/setup_native.rb ← agrega lo nativo al proyecto Xcode (corre en la nube)
../codemagic.yaml / ../.github/workflows/ios.yml ← build de iOS en la nube (en la raíz del repo de BOOST)
backend/                ← Firebase (reglas + pruebas) y el Worker de Cloudflare (Nova, borrar cuenta). Ver docs/BACKEND.md
resources/              ← ícono 1024 y splash
```

## En tu PC (Windows)
```
npm install
npm run preview        → abre http://localhost:5173 (se ve igual que el prototipo)
```
No necesitás Mac: el proyecto iOS se genera y compila en la nube. Ver **docs/BUILD-NUBE.md**.

## Cómo se adapta a cada iPhone
El diseño mide 390 pt de ancho. En el teléfono se escala entero al ancho real
(402 pt en un 16 Pro = ×1,03; 440 pt en un Pro Max = ×1,13) y el alto se ajusta a la pantalla.
Todo mantiene la misma proporción. Se ocultan el marco, la barra de estado y la barra de inicio
de mentira: iOS pone las reales.
La tipografía en iPhone es Helvetica Neue, la primera de la lista del diseño.

## Siguientes pasos
1. Build en la nube → TestFlight (docs/BUILD-NUBE.md).
2. Poner en marcha el back-end (docs/BACKEND.md): ya está escrito y probado; faltan las cuentas.
3. Probar en un iPhone real: sensor + auriculares Bluetooth al mismo tiempo, pantalla bloqueada, voz con música.
