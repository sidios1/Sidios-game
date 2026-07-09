# MEDICION_RELOJ_ANDROID.md — Reloj del host-autoridad en background

> **Entregable principal de la Sesión 1** (ver `PORT_ANDROID.md`, secuencia paso 2).
> Mide qué le pasa a un `setTimeout` del orquestador-host cuando la app Android va a
> background, para definir la forma del futuro `ProgramadorResiliente` con datos
> reales. La mitigación NO se implementa todavía.
>
> **Estado: PENDIENTE DE EJECUCIÓN EN DISPOSITIVO.** La instrumentación está
> autorada y aislada (`src/red/medicionReloj.ts`, gated por `VITE_MEDICION_RELOJ`);
> faltan instalar el toolchain Android + conectar el dispositivo físico (decisión de
> la Sesión 1: el usuario instala). Las tablas de abajo se llenan al correr el
> experimento.

---

## 1. Por qué se mide (riesgo)

En LAN, el orquestador-autoridad corría en un **sidecar Node** (proceso aparte,
reloj inmune al throttling del webview). En online-host sobre Android, ese mismo
orquestador corre **dentro del webview del teléfono que hostea**. Agenda con
`setTimeout` global (default `programadorReal`, `orquestador.ts`):

- la **gracia de reconexión** (`GRACIA_MS = 10s`, `orquestador.ts`), y
- el **salto de turno** de un jugador ausente.

Si Android pausa/throttla los timers del webview en background, esos callbacks
pueden dispararse tarde — tratando minutos como segundos — y **corromper el estado
de autoridad para todos los remotos**. El cliente-jugador ya mitiga su lado con
`visibilitychange`; el host-autoridad es nuevo en este contexto y es lo que acá se
mide.

---

## 2. Método del experimento

**Instrumentación:** `packages/client/src/red/medicionReloj.ts` (temporal, marcada).
Mide un `setTimeout` GLOBAL — el mismo API path que usa el orquestador — sin tocar
`orquestador.ts` ni la lógica de juego. Emite a:
- el **visor de log embebido** en pantalla (singleton `registro`), y
- `console.log` → capturado por el WebView → `adb logcat` (con timestamp del SO).

Grepear por el prefijo `[MEDICION_RELOJ]`.

**Sondas:**
- **One-shot** a `5s`, `30s`, `120s`: registran `programadoEn`,
  `esperadoEn = programadoEn + ms` y, al disparar, `realEn` y
  `delta = realEn − esperadoEn`.
- **Ticker repetitivo** de `1000ms`: loguea el intervalo real de cada tick cuando se
  desvía >250ms del esperado (revela el patrón de throttle).
- **Lifecycle:** `visibilitychange`, `pagehide/pageshow`, `blur/focus` con timestamp,
  para cruzar las ventanas de background con los deltas.

### Procedimiento (dispositivo físico)
1. Build de medición: `VITE_MEDICION_RELOJ=1 npx tauri android dev` (o `build` +
   install). Ver `BUILD_ANDROID.md`.
2. Conectar `adb logcat` (opcional pero recomendado): filtrar por la app y por
   `MEDICION_RELOJ`.
3. En el teléfono: **"Online → Crear partida"** (Android = host/autoridad). Conectar
   1 peer desde PC. Confirmar que la sala llega a **iniciada** con el orquestador
   corriendo en el webview (jugada de smoke: que el peer vea estado).
4. Apenas la sala arranca, la sonda se monta y PROGRAMA los timers (se ven en el
   visor). Tomar nota de `t0`.
5. **Una corrida por duración de background** (5s / 30s / 2min):
   - Mandar la app a background (botón Home; NO matarla).
   - Cronometrar la duración objetivo.
   - Volver al frente.
   - Leer en el visor / logcat los `DISPARO` + `delta` y el patrón del ticker.
   - Reabrir/re-montar para re-programar antes de la siguiente duración.
6. Anotar el modelo/versión y si el dispositivo aplica Doze/optimización de batería
   a la app.

> Nota de validez: medir en **dispositivo físico**; los emuladores no reproducen
> Doze/throttle de OEM. Probar también con la pantalla apagada (Doze entra más
> agresivo) si interesa el peor caso.

---

## 3. Datos crudos (A COMPLETAR en dispositivo)

### Dispositivo / entorno
| Campo | Valor |
|-------|-------|
| Modelo | _(p. ej. Samsung Galaxy A54)_ |
| Android / One UI | _(p. ej. Android 14)_ |
| Fabricante / capa | _____ |
| WebView version | _(Chrome/Android System WebView)_ |
| Optimización de batería de la app | _(activada / desactivada)_ |
| Pantalla | _(encendida / apagada durante background)_ |
| Build / commit | _____ |
| Fecha | _____ |

### Sondas one-shot: esperado vs. real
| Duración background | Sonda (ms) | `transcurrido_real` (ms) | `delta = real − esperado` (ms) | ¿Disparó en background o al resume? |
|---------------------|-----------|--------------------------|-------------------------------|-------------------------------------|
| ~5 s   | 5000   | | | |
| ~5 s   | 30000  | | | |
| ~30 s  | 30000  | | | |
| ~30 s  | 120000 | | | |
| ~2 min | 120000 | | | |

### Ticker 1000ms: patrón observado
| Duración background | ¿Ticks durante background? | Intervalo máx. observado (ms) | ¿Ráfaga de catch-up al resume? (#ticks) |
|---------------------|----------------------------|-------------------------------|------------------------------------------|
| ~5 s   | | | |
| ~30 s  | | | |
| ~2 min | | | |

### Log crudo (pegar extractos relevantes de `[MEDICION_RELOJ]`)
```
(pegar acá)
```

---

## 4. Interpretación → forma del `ProgramadorResiliente`

Mapear el comportamiento observado (sección 3) a una de las hipótesis. **Completar
tras medir.**

| Comportamiento observado | Implicación para el ProgramadorResiliente |
|--------------------------|-------------------------------------------|
| **Pausa dura** — el timer no dispara en background; al volver al frente dispara una vez con `delta` ≈ duración del background. | **Recompute-on-resume basta.** Al recibir resume/`visibilitychange→visible`, recomputar contra `Date.now()` qué transiciones (gracia, salto) ya vencieron y aplicarlas; reprogramar el remanente. No hace falta mantener el reloj vivo. |
| **Throttle suave** — dispara tarde pero progresa en background (intervalos espaciados, p. ej. ~1/min). | Recompute-on-resume **+** re-chequeo periódico tolerante: la lógica no debe asumir precisión del callback; cada disparo recomputa contra wall-clock en vez de confiar en "pasaron N ms". |
| **Ráfaga / catch-up** — al volver al frente se disparan varios callbacks atrasados en cadena. | Recompute **idempotente** + **colapsar** disparos atrasados: una sola pasada que liquide todo lo vencido por wall-clock; descartar callbacks redundantes (igual que la `gen` ya idempotente de la reconexión). |
| **Mixto / depende de Doze** | Documentar el umbral (p. ej. cambia tras X min o con pantalla apagada) y dimensionar el peor caso para el recompute. |

### Recomendación concreta (A ESCRIBIR con los datos)
_(Una vez medido: indicar qué hipótesis se confirmó en qué dispositivo/versión, y la
forma recomendada — recompute-on-resume solo, o con re-chequeo periódico, o con
colapso de catch-up. Señalar explícitamente cualquier tramo no medido y por qué.)_

---

## 5. Limpieza

Al cerrar la medición, remover la instrumentación temporal del grafo de producción:
- borrar `packages/client/src/red/medicionReloj.ts`,
- borrar el bloque gated `VITE_MEDICION_RELOJ` de `packages/client/src/main.ts`,
- quitar la flag comentada de `packages/client/.env.example`,
- `grep -r "medicionReloj\|VITE_MEDICION_RELOJ"` debe dar cero en el grafo de
  producción.
