# Build de iOS en la nube (sin Mac)

Todo esto se hace desde Windows con el navegador. La compilación y la firma corren en una Mac en la nube.

## 0. Lo que necesitás
- Cuenta **Apple Developer** (US$ 99/año): https://developer.apple.com/programs
- Repositorio en **GitHub** con esta carpeta (`velo-ios/` como raíz del repo).
- Un iPhone con **TestFlight** instalado, para probar.

## 1. Apple Developer (una sola vez)
1. **Team ID**: developer.apple.com → Account → Membership → *Team ID* (10 caracteres). Anotalo.
2. **Bundle IDs** → Certificates, IDs & Profiles → Identifiers → **+** → App IDs:
   - `app.boost.velo` → activá **Sign In with Apple**. (Si usás otro ID, cambialo también en `capacitor.config.json`, `codemagic.yaml` y `.github/workflows/ios.yml`.)
   - `app.boost.velo.LiveActivity` → sin capabilities.
3. **App Store Connect** → Apps → **+** → Nueva app → plataforma iOS, bundle `app.boost.velo`, nombre BOOST, idioma Español (Latinoamérica).
4. **Clave API**: App Store Connect → Users and Access → Integrations → App Store Connect API → **+** → rol *App Manager*.
   Bajá el archivo `.p8` (se baja una sola vez) y anotá **Key ID** e **Issuer ID**.
5. **Clave del certificado** (PowerShell en Windows; OpenSSH viene instalado):
   ```
   ssh-keygen -t rsa -b 2048 -m PEM -f boost_cert_key -q -N '""'
   ```
   El contenido de `boost_cert_key` es tu `CERTIFICATE_PRIVATE_KEY`. Guardalo; se usa para crear y reusar el certificado de distribución.

## 2A. Codemagic (recomendado)
1. codemagic.io → entrar con GitHub → **Add application** → elegir el repo → tipo *Other* (usa `codemagic.yaml`, que está en la raíz del repo de BOOST y compila desde `app-ios/`).
2. Teams → Integrations → **App Store Connect** → Connect → nombre **BOOST_ASC** → Issuer ID, Key ID y el `.p8`.
3. App → Environment variables → grupo **boost_ios**:
   - `APPLE_TEAM_ID` = tu Team ID
   - `CERTIFICATE_PRIVATE_KEY` = contenido de `boost_cert_key` (marcá *Secure*)
4. Lanzar build: en GitHub creá un tag `v1.0.0` (Releases → *Draft a new release*), o en Codemagic *Start new build* → workflow **ios-testflight**.
5. Al terminar (~15–25 min) la build aparece en App Store Connect → TestFlight. Agregate como tester interno e instalala desde TestFlight.

El plan gratis de Codemagic incluye 500 min/mes en Mac M2: alcanza para ~20 builds.

## 2B. GitHub Actions (alternativa)
Repo → Settings → Secrets and variables → Actions → **New repository secret**:
- `APPLE_TEAM_ID`
- `ASC_ISSUER_ID`, `ASC_KEY_ID`
- `ASC_PRIVATE_KEY` = contenido completo del `.p8`
- `CERTIFICATE_PRIVATE_KEY` = contenido de `boost_cert_key`

Actions → **iOS → TestFlight** → *Run workflow* (o empujá un tag `v*`). Usa las mismas herramientas de firma que Codemagic.
Los minutos de macOS en GitHub cuentan ×10 en repos privados; Codemagic sale más barato.

## 3. Qué hace cada build
1. `npm run build` → arma `www/` desde `design/` sin tocar el diseño y deja React local (funciona sin internet).
2. `npx cap add ios` + `cap sync` → genera el proyecto Xcode limpio (la carpeta `ios/` no se sube al repo).
3. `scripts/ios/setup_native.rb` → agrega:
   - `VeloNativePlugin.swift` (voz, Sign in with Apple, pantalla encendida, Live Activity)
   - la extensión **VeloLiveActivity** (Dynamic Island + pantalla bloqueada) y la incrusta en la app
   - permisos en Info.plist (Bluetooth, Live Activities, audio y Bluetooth en segundo plano), solo iPhone, solo vertical
   - ícono (`resources/icon-1024.png`) y splash
   - versión = `version` de `package.json`, build = número de build de la nube
4. Firma: crea o reusa el certificado y los 2 perfiles (app + extensión) con la clave API.
5. Compila el `.ipa` y lo sube a TestFlight.

Para una versión nueva: subí `version` en `package.json` y creá el tag (`v1.0.1`).

## 4. Si falla
- Descargá los logs desde *Artifacts* (`xcodebuild_logs`).
- **"No profiles for app.boost.velo.LiveActivity"** → falta crear ese Bundle ID (paso 1.2).
- **"Provisioning profile doesn't include Sign In with Apple"** → activá la capability en el Bundle ID y volvé a lanzar (los perfiles se regeneran).
- **Error de versión de plugin** en `npm ci` → `npx npm-check-updates -u --filter "/capacitor|revenuecat/"`, `npm install`, y subí el `package-lock.json`.
- **Cycle inside App** → el script ya pone el embed de la extensión después de Resources; si reaparece, mandame el log.

## 5. Antes de mandar a revisión de Apple
- `payments.js`: `RC.enabled = true` con tu API key y productos creados en App Store Connect + RevenueCat.
- App Store Connect → App Privacy: declarar datos (perfil, métricas de entrenamiento, email; video si activás Élite).
- Notas para el revisor: la app necesita el sensor. Subí un **video** de la app midiendo con el sensor y dejá una **cuenta demo**.
- Borrar cuenta desde la app: ya está (Perfil → Eliminar cuenta); falta que tu back-end borre los datos.
- Restaurar compras: ya está (Planes → Restaurar compras).
