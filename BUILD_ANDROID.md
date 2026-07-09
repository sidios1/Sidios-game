# BUILD_ANDROID.md — Bootstrap y build del target Android (Tauri 2)

Guía operativa para levantar el target Android de Sidios. Decisiones de fondo en
`PORT_ANDROID.md`; auditoría de acoplamiento en `SPIKE_ANDROID.md`. Acá está el
**cómo** ejecutar, los prerequisitos, y la inyección de TURN.

> Estado: el código de la app NO se ramifica por plataforma (regla de oro de
> `PORT_ANDROID.md`). Android = solo transporte online (WebRTC). El bootstrap es
> config + un override de build; cero código nativo de red.

---

## 1. Prerequisitos (verificar ANTES de `tauri android init`)

`tauri android init` falla si falta cualquiera de estos. Verificá con los comandos
y NO instales a ciegas.

| Requisito | Verificación | Notas |
|-----------|--------------|-------|
| **JDK 17+** | `java -version` | Tauri Android pide JDK 17 mínimo. **Verificado: JDK 21 (JBR de Android Studio) compila sin problemas** con Tauri CLI 2.11.2 / Gradle 8.14.3 (Sesión 1b). Setear `JAVA_HOME`. |
| **Android SDK** (cmdline-tools + platform-tools) | `echo $ANDROID_HOME` y `sdkmanager --list` | Instalable vía Android Studio o `cmdline-tools`. Setear `ANDROID_HOME`. |
| **Android NDK** | `echo $NDK_HOME` | Instalar con `sdkmanager "ndk;<version>"`. Setear `NDK_HOME`. |
| **Targets Rust Android** | `rustup target list --installed \| grep android` | Ver comando abajo. |
| **Rust + Tauri CLI** | `rustc --version` / `npx tauri --version` | Ya presentes en la máquina de dev (Rust 1.96, Tauri CLI 2.11.2). |

Agregar los targets Rust (los 4 ABIs que empaqueta Tauri):

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi \
  i686-linux-android x86_64-linux-android
```

Variables de entorno típicas (ajustar rutas a tu instalación):

```bash
export JAVA_HOME=/ruta/al/jdk-17
export ANDROID_HOME=$HOME/Android/Sdk          # Windows: %LOCALAPPDATA%\Android\Sdk
export NDK_HOME=$ANDROID_HOME/ndk/<version>
```

> **Estado en esta máquina (al cerrar la Sesión 1):** JDK, `ANDROID_HOME`,
> `NDK_HOME` y los targets Rust Android **NO** estaban instalados; `gen/android` no
> existía. Por eso `init`/`build`/medición quedaron pendientes de instalar el
> toolchain (decisión: el usuario lo instala).

---

## 2. Inicializar el target (genera `gen/android/`)

```bash
cd packages/client
npx tauri android init
```

Crea `src-tauri/gen/android/` (proyecto Gradle). Si reporta un prereq faltante,
resolverlo (sección 1) y reintentar — no improvisar instalaciones.

---

## 3. Config Android (post-init: editar el manifiesto generado)

Tauri no expone orientación/permisos Android en `tauri.conf.json`; se editan en el
manifiesto **generado** `src-tauri/gen/android/app/src/main/AndroidManifest.xml`.

### 3.1 Landscape forzado
En la `<activity>` principal, agregar el atributo:

```xml
<activity
    android:name=".MainActivity"
    ...
    android:screenOrientation="landscape">
```

### 3.2 Permisos
Dentro de `<manifest>` (fuera de `<application>`):

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

> `INTERNET` suele agregarlo Tauri por defecto — verificar y no duplicar.
> `ACCESS_NETWORK_STATE` casi siempre hay que añadirlo a mano. No hace falta
> multicast lock: no hay LAN en Android (`PORT_ANDROID.md`).

---

## 4. Override de build Android: `src-tauri/tauri.android.conf.json`

Tauri 2 mergea `tauri.<plataforma>.conf.json` sobre `tauri.conf.json` cuando el
target es Android. **El override DEBE vivir en el MISMO directorio que
`tauri.conf.json`, es decir `packages/client/src-tauri/`** (ver desviación §8.3).
Sirve para:

- **No construir el sidecar Node:** el `beforeBuildCommand` base
  (`tauri.conf.json`) corre `empaquetar:sidecar` (servidor LAN de escritorio).
  Android es solo online → el override usa `npm run empaquetar -w @juegos/client`
  (solo `tsc -b && vite build`).
- **Anular `externalBin`:** el sidecar `binaries/servidor` no se empaqueta en el
  APK.

> El JSON del override NO admite propiedades extra (sin `_comment`): el schema de
> Tauri lo rechaza con `Additional properties are not allowed` y aborta el build.

---

## 5. Inyección de TURN (RESUELTO — sin paso extra)

Las credenciales TURN viven en `packages/client/.env.local` (gitignored) y se
consumen vía `import.meta.env.VITE_*` en `src/red/online/iceConfig.ts`.

**Cómo se inyectan en el build de Android:** `tauri android build`/`dev` ejecuta el
`beforeBuildCommand`, que corre `vite build`. Vite lee `.env.local` de la máquina
de build en ese momento y **hornea** las `VITE_*` en el bundle estático que carga
el WebView. Por tanto:

- **No hay paso especial** ni código condicional: basta que `.env.local` exista en
  la máquina que hace el build (con las credenciales TURN reales).
- **No se commitean secretos:** `.env.local` está gitignored; este repo solo
  versiona `.env.example` (plantilla con claves vacías).
- En CI/release, proveer las `VITE_*` como variables del entorno del job (o
  materializar un `.env.local` efímero antes de `tauri android build`), nunca en el
  repo.

> Sin `VITE_TURN_USERNAME`/`VITE_TURN_CREDENTIAL`, `iceConfig.ts` degrada a solo
> conexión directa (sin TURN) — no rompe, pero NAT estrictos pueden no conectar.

---

## 6. Build y arranque en dispositivo (smoke test)

Con `.env.local` presente y un dispositivo físico conectado (USB debugging):

```bash
cd packages/client
# dev (hot reload del frontend en el device):
VITE_MEDICION_RELOJ=1 npx tauri android dev
# o build de APK + instalación manual:
VITE_MEDICION_RELOJ=1 npx tauri android build
```

`VITE_MEDICION_RELOJ=1` solo se usa para el experimento del reloj (sección 7);
omitirlo para un build normal. Confirmar que el frontend carga y el menú aparece.

---

## 7. Experimento de medición del reloj del host

Ver `MEDICION_RELOJ_ANDROID.md` para el método completo, las tablas de datos y la
rúbrica de interpretación. Resumen: build con `VITE_MEDICION_RELOJ=1`, crear sala
"Online → Crear partida" desde Android, mandar la app a background por 5s/30s/2min,
volver y leer los deltas en el visor de log embebido o `adb logcat`.

**Al cerrar:** remover la instrumentación temporal — borrar
`src/red/medicionReloj.ts`, el bloque gated en `src/main.ts`, y la flag comentada
en `.env.example`.

---

## 8. Desviaciones reales encontradas en la Sesión 1b (init + build + emulador)

Lo que difirió de lo autorado en la Sesión 1a, ya validado contra el toolchain real
(JDK 21 JBR, SDK con platform android-36.1, NDK 30.0.14904198, Tauri CLI 2.11.2,
Gradle 8.14.3, emulador x86_64 Pixel_7):

### 8.1 Env vars no heredadas por las shells nuevas
`JAVA_HOME/ANDROID_HOME/NDK_HOME/ANDROID_NDK_ROOT` estaban a nivel **User** pero las
shells recién abiertas (incluida la del agente) arrancaban SIN ellas. Hay que
exportarlas en cada sesión de build, p.ej. en PowerShell:
```powershell
$env:JAVA_HOME        = [Environment]::GetEnvironmentVariable('JAVA_HOME','User')
$env:ANDROID_HOME     = [Environment]::GetEnvironmentVariable('ANDROID_HOME','User')
$env:NDK_HOME         = [Environment]::GetEnvironmentVariable('NDK_HOME','User')
$env:ANDROID_NDK_ROOT = [Environment]::GetEnvironmentVariable('ANDROID_NDK_ROOT','User')
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:Path"
```

### 8.2 Windows Developer Mode es OBLIGATORIO para el build
Tauri symlinkea la `.so` compilada (`target/<abi>/debug/libjuegos_rapidos_lib.so`)
dentro de `app/src/main/jniLibs/<abi>/`. Windows bloquea crear symlinks sin permiso
→ el build falla en el ÚLTIMO paso con `Creation symbolic link is not allowed for
this system` (la compilación de Rust ya terminó OK). **Fix:** activar
*Settings → System → For developers → Developer Mode* (o correr el build elevado).
Es un toggle de sistema, una sola vez.

### 8.3 Ubicación del override (corregida) + `_comment` inválido
El override autorado vivía en `packages/client/tauri.android.conf.json`, un nivel
ARRIBA de `src-tauri/`. Tauri 2 lee `tauri.<plataforma>.conf.json` del MISMO dir que
`tauri.conf.json`, así que ahí NO se mergeaba. Se reubicó a
`packages/client/src-tauri/tauri.android.conf.json` (y se borró el original). Además
el archivo traía una clave `_comment` que el schema de Tauri rechaza
(`Additional properties are not allowed`) abortando el build → se removió. **Override
confirmado:** el build de Android corre `beforeBuildCommand: npm run empaquetar -w
@juegos/client` (NO `empaquetar:sidecar`) y `externalBin: []` (no empaqueta el
sidecar Node).

### 8.4 El manifest parcheado es código GENERADO (gitignored)
`src-tauri/gen/android/` está en `.gitignore`. El parche del `AndroidManifest.xml`
(landscape + `ACCESS_NETWORK_STATE`; `INTERNET` ya lo pone Tauri) vive sobre código
generado y **hay que reaplicarlo tras cada `tauri android init`**. El `<activity>`
principal generado es `.MainActivity` (con `configChanges`/`launchMode=singleTask`);
ahí se añade `android:screenOrientation="landscape"`.

### 8.5 Build OK
`npx tauri android build --debug --apk` produce
`src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`
(universal/debug, ~464 MB: incluye los 4 ABIs + símbolos; normal para debug).

### 8.6 Smoke test online (emulador host ↔ peer PC)
- Emulador (Pixel_7, x86_64): la app carga en **landscape** (`MainActivity`,
  display `2400x1080`, `overrideConfig … land … ROTATION_90`).
- "Online → Crear partida" desde el emulador → **Sala de espera con código** (rol
  anfitrión/autoridad: el `Orquestador` corre en el webview Android y se registró en
  el broker PeerJS).
- Peer PC (Edge sobre `npm run dev:client` en `localhost:5173`) → "Online → Unirse"
  con el código → **llegó a "Sala de espera"**: conectividad **WebRTC emulador↔PC
  confirmada** vía broker PeerJS público + ICE (STUN/TURN de `.env.local`).
- *Nota de automatización:* el WebView/`uiautomator` es opaco (un solo nodo); se
  manejó la UI vía **Chrome DevTools Protocol** (`adb forward` al socket
  `webview_devtools_remote`). No es parte del producto, solo método de prueba.
- *Pendiente* (no ejecutado en esta corrida): pulsar "Iniciar partida" y jugar manos
  end-to-end. La conectividad y el rol host-autoridad quedaron demostrados.

### 8.7 Layout en landscape de teléfono
El hub y las pantallas de conexión se ven bien a lo ancho, pero la pantalla de
perfil queda en una columna centrada más alta que el viewport corto (≈411dp de alto)
y su botón "Guardar" cae bajo el fold sin scroll táctil cómodo. Es exactamente el
trabajo de overlays/safe-areas responsive diferido a la **Sesión 2** (`PORT_ANDROID.md`),
no un bug de lógica.
