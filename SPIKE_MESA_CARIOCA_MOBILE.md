# SPIKE — Mesa Carioca mobile: arquitectura de coexistencia PC/móvil

**Tipo:** spike de auditoría (solo lectura). No se modificó ni una línea de
código de producción.
**Fecha:** 2026-07-20
**Pregunta:** ¿cómo introducir un layout mobile-específico para Mesa Carioca sin
tocar ni arriesgar regresión en la vista PC?

Decisiones del usuario tomadas durante el spike, que fijan el marco de la
recomendación:

- Mobile es un **árbol de render distinto: DOM/2D puro**, sin Three.js.
- La vista mobile se selecciona **en runtime por viewport/orientación**.

---

## Resumen ejecutivo

1. El render de Carioca está **totalmente acoplado a un único layout landscape**.
   No existe ningún punto de extensión por plataforma o viewport: cero
   `matchMedia`, cero `@media`, cero detección de orientación.
2. El issue de `VistaJuego` **no existe en `MEJORAS.md`** y el union **ya está
   discriminado**. Lo que sí falla es `typecheck:tests` del servidor, por
   narrowing en helpers de test. Es **independiente**: no bloquea el trabajo
   mobile.
3. La zona ESCALAS Y TRIOS **no necesita ningún dato nuevo**. `MotorJuego` ya
   expone las cartas concretas de cada bajada con su `duenoId`, idénticas para
   todos los jugadores.
4. Mecanismo recomendado: **shell delegador dentro de `JuegoCarioca`** — el
   mismo patrón que ya usa `JuegoRumble`. Riesgo de regresión en PC **nulo por
   construcción**.

---

## Hallazgo 1 — El render está acoplado a un único layout landscape

### 1.1 Cámara

`packages/client/src/escena/escena.ts:70`

```ts
this.camara = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
```

FOV **vertical** de 50°, constante. El único resize handler
(`escena.ts:86-92`) actualiza exclusivamente `aspect` y el tamaño del renderer:

```ts
this.ajustar = () => {
  const ancho = contenedor.clientWidth || window.innerWidth;
  const alto = contenedor.clientHeight || window.innerHeight;
  this.camara.aspect = ancho / alto;
  this.camara.updateProjectionMatrix();
  this.renderer.setSize(ancho, alto);
};
```

No hay compensación de FOV, ni reposicionamiento de cámara, ni detección de
orientación. En un viewport portrait el frustum se estrecha en X manteniendo el
FOV vertical, sin compensación alguna.

El único recolocador de cámara es `ajustarMesa(numJugadores)` (`escena.ts:117-132`),
que solo reacciona al número de jugadores y es idempotente (`:119`).

### 1.2 Layout de la mesa

`packages/client/src/escena/disposicion.ts` — todas las poses son constantes
fijas:

| Constante | Línea | Valor |
|---|---|---|
| `POSE_MAZO` | 65-72 | `x: -1.3, z: 0.9` |
| `POSE_POZO` | 74-81 | `x: 1.3, z: 0.9` |
| `BASELINE_Y_MANO` | 87 | `1.15` |
| `Z_BASE_MANO` | 89 | `4.7` |
| `PASO_Z_MANO` | 90 | `0.02` |
| `GIRO_ABANICO` | 91 | `0.045` |

Mi asiento es literal (`disposicion.ts:112`):

```ts
if (jugadorId === vista.tuJugadorId) {
  return { x: 0, y: 1.1, z: 4.7, rotX: -0.5, rotY: 0, rotZ: 0 };
}
```

El ancho de la mano está topado por un número mágico landscape
(`disposicion.ts:157-159`):

```ts
const espaciado = montada
  ? Math.min(0.68, 8.4 / Math.max(total, 1))   // ← mano ≤ 8.4 unidades de mundo
  : espaciadoDesmontado(total);
```

Las bajadas usan una cuadrícula con columnas por ternario (`disposicion.ts:199-203`):

```ts
const columnas = numJugadores > 4 ? 4 : 3;
const baseX = (columna - (columnas - 1) / 2) * 4.5 * f;
const baseZ = -1.3 - fila * 1.75 * f;
```

### 1.3 El único eje de variación existente es `numJugadores`

`packages/client/src/escena/dimensionesMesa.ts` es el único módulo que
parametriza dimensiones, y lo hace sobre un solo eje:

```ts
export function factorEscala(numJugadores: number): number {   // :16
  return Math.max(1, Math.sqrt(Math.max(numJugadores, 1) / 4));
}
export function camaraPara(numJugadores: number): VistaCamara { // :40
  const f = factorEscala(numJugadores);
  return { x: 0, y: 7.6 * f, z: 8.6 * f, miraX: 0, miraY: 0, miraZ: 0.4 };
}
```

No hay ningún parámetro de viewport, aspect ni orientación.

### 1.4 Puntos de extensión por plataforma: **cero**

Barrido verificado sobre `packages/client/src`:

| Búsqueda | Resultado |
|---|---|
| `matchMedia` | **0 ocurrencias** |
| `@media` en `src/estilos.css` (1704 líneas, único CSS del cliente) | **0** |
| `orientation` / `portrait` / `landscape` | **0** |
| `esMovil` / `plataforma` / breakpoint | **0** |
| `touchstart` / `TouchEvent` | **0** |

Lo que sí existe, y **no** es extensibilidad de layout:

- `escena.ts:76` — `Math.min(window.devicePixelRatio, 2)`, solo calidad de
  render, aplicado una vez en el constructor.
- `red/servidorEmbebido.ts:15-25` — `window.isTauri === true`, usado
  **exclusivamente** en `hub/coordinador.ts:146` para decidir si se ofrece
  "Crear partida LAN". Nunca para render.
- `escena/seleccion.ts:60-62` — Pointer Events API, que funciona con táctil por
  herencia pero sin gestos ni multi-touch.
- `index.html:5` — `<meta name="viewport" content="width=device-width, initial-scale=1.0">`.

### 1.5 Precedente cultural del repo (informativo)

`OpcionesEscena` (`escena.ts:23-32`) ya parametriza la escena, y UNO la usa
(`juegos/uno/juegoUno.ts:55`) para lograr estética propia sin motor nuevo. Es el
patrón del repo: **parametrizar, no bifurcar**. Pero cubre **solo estética**
(colores, luces, qué zonas armar) — no geometría ni cámara. No es un enganche
aprovechable para portrait.

### 1.6 Duplicación preexistente a tener en cuenta

`juegos/uno/disposicionUno.ts:30-35` **duplica literalmente** las constantes de
mano de Carioca (`BASELINE_Y_MANO = 1.15`, `Z_BASE_MANO = 4.7`,
`PASO_Z_MANO = 0.02`, `GIRO_ABANICO = 0.045`) con el comentario *"mismos valores
que Carioca para una estética consistente"*, y repite el mismo
`Math.min(0.68, 8.4 / total)` (`:69`). No afecta a este trabajo (mobile no usa
Three), pero queda registrado.

---

## Hallazgo 2 — El issue de `VistaJuego` es independiente

### 2.1 La premisa del brief está desactualizada

`MEJORAS.md` (585 líneas, Mejoras 1–11) **no contiene** ningún issue de
`VistaJuego`. Grep de `VistaJuego|typecheck:tests|discrimin` sobre el archivo:
**0 coincidencias**. Los temas del documento son: mazos escalables (1),
perfil/avatar (2), drag & drop (3), metadatos Tauri (4), hover (5), modal de
bajar (6), layout de mesa (7), conectividad (8), fix z-order (9 ✅), fix GUI
(10 ✅), estabilidad LAN (11).

### 2.2 El union **sí está discriminado** hoy

`packages/server/src/vistaJuego.ts:19`

```ts
export type VistaJuego = VistaPartida | VistaRumble | VistaMentiroso | VistaUno;
```

Con literal en `juego` en las cuatro variantes:

- `server/src/vista.ts:49` → `readonly juego: "carioca";`
- `server/src/juegos/carioca/vistaRumble.ts:50-53` → `"carioca-rumble"` (vía
  `Omit<VistaPartida,"juego"> & …`; el comentario en `:47-48` explica que un `&`
  con literales distintos colapsaría a `never`)
- `server/src/juegos/mentiroso/vistaMentiroso.ts:54` → `"mentiroso"`
- `packages/uno-core/src/vista.ts:19` → `"uno"`

### 2.3 Lo que realmente falla

`typecheck:tests` no existe como script raíz; se corre por workspace
(`packages/server/package.json:53`, `packages/client/package.json:13`, ambos
`tsc -p tsconfig.pruebas.json`).

- **Cliente: PASA.**
- **Servidor: falla con 7 errores.** Tres tocan el union, y son **falta de
  narrowing en el consumidor**, no falta de discriminante:

```
src/orquestador.test.ts(114,62): TS2322: Type 'VistaJuego' is not assignable to type 'VistaPartida'.
src/pruebas/guion.ts(424,26): TS2345: (igual)
src/pruebas/guion.ts(425,29): TS2339: Property 'fase' does not exist on type 'VistaJuego'.
src/pruebas/guion.ts(429,41): TS2345: (igual)
```

`orquestador.test.ts:111-117` declara un helper `ultimaVista(): VistaPartida` y
devuelve `mensaje.vista` sin estrechar por `mensaje.vista.juego === "carioca"`.
`pruebas/guion.ts:423-432` empuja y lee el union directamente; `fase` existe en
`VistaPartida`/`VistaRumble` pero no en `VistaMentiroso`.

Los otros 4 errores son ruido no relacionado
(`descubridorTroll.test.ts:24`, `integracionRumble.test.ts:201`,
`motorMentiroso.test.ts:50`).

El fix, cuando se aborde, **no** es "discriminar el union" (ya lo está) sino
estrechar en esos dos helpers de test.

### 2.4 Intersección con el trabajo mobile: **ninguna**

- Los errores viven en **tests del servidor**; mobile es 100 % cliente, cuyo
  `typecheck:tests` pasa.
- La vista mobile declarará `sincronizarEstado(vista: VistaPartida)` apoyándose
  en la **bivarianza de parámetros de método**, el mismo mecanismo que ya usa
  `juegos/carioca/juegoCarioca.ts:94` y que documenta `juego/ijuego.ts:37-41`.
  No lo agrava ni depende de él.

**No bloquea, no complica. Es independiente.**

---

## Hallazgo 3 — ESCALAS Y TRIOS: no falta ningún dato

`packages/server/src/vista.ts:62`

```ts
readonly mesa: readonly CombinacionEnMesa[];
```

`packages/carioca-core/src/partida.ts:86-89`

```ts
export interface CombinacionEnMesa {
  readonly duenoId: string;
  readonly combinacion: Combinacion;
}
```

`packages/carioca-core/src/combinaciones.ts:16-21`

```ts
export type TipoCombinacion = "trio" | "escala" | "escalaSucia" | "escalaReal";

export interface Combinacion {
  readonly tipo: TipoCombinacion;
  readonly cartas: readonly Carta[];
}
```

Respuestas concretas:

- **¿Cartas concretas o conteos?** Cartas **concretas y completas**: `tipo` +
  array ordenado de `Carta` + `duenoId`.
- **¿Igual para ambas plataformas y para todos los jugadores?** Sí.
  `construirVista` hace `mesa: estado.mesa` (`vista.ts:142`) **sin filtrar por
  jugador**. Es correcto: las bajadas son información pública (necesaria para
  pegar). Contrasta con lo oculto, que sí se reduce a conteo
  (`numeroCartas`, `vista.ts:24` y `:129`).
- **Rumble** lo hereda sin cambios (`vistaRumble.ts:50`); lo único que oculta
  selectivamente es `pozoTope` bajo PESAO (`:65-69`).
- **`MotorJuego.construirVista`** (`server/src/motor.ts:87-92`) es el canal
  genérico; cada motor devuelve su forma. Nada que añadir.

**Lo único ausente es una agrupación por jugador**, y no está ausente del dato
sino del layout: `disposicion.ts:299-308` posiciona por `mesaIdx` lineal
ignorando `duenoId`. Agrupar por dueño es **presentación pura de cliente** —
cero cambios en vista, core o servidor.

El cliente ya consume estas cartas concretas en cuatro sitios, lo que confirma
que el dato es suficiente: render 3D (`disposicion.ts:299`), diff de animaciones
(`estado/difVista.ts:114-150`), validación de cortesía al pegar
(`estado/maquinaInteraccion.ts:337-360`, que necesita las cartas ajenas para
elegir extremo) y tooltip (`juegoCarioca.ts:198-217`).

---

## Hallazgo 4 — Mecanismos de coexistencia evaluados

| Mecanismo | Riesgo regresión PC | Complejidad | Encaje arquitectónico |
|---|---|---|---|
| **A.** Parametrizar `disposicion.ts` + `camaraPara` con un eje "forma" | **Alto** — toca las funciones que PC ejecuta en cada frame | Media | Bueno en abstracto (sigue el patrón `OpcionesEscena`), pero **incompatible** con la decisión de DOM/2D |
| **B.** Nueva entrada en `catalogo.ts` (`carioca-movil` como juego aparte) | Nulo | Baja | **Malo** — ver abajo |
| **C.** Shell delegador dentro de `JuegoCarioca` | **Nulo por construcción** | Media | **Excelente** — es el patrón que ya usa `JuegoRumble` |

**Por qué A queda descartado:** su valor está en reusar el pipeline 3D
(`Escena`, `Sincronizador`, `Seleccionador`, raycast). Con mobile en DOM/2D ese
valor desaparece, y solo queda el riesgo de editar el código caliente de PC.

**Por qué B falla, concretamente:** `juegos/carioca-rumble/juegoRumble.ts:16`
hace

```ts
private readonly base = new JuegoCarioca();
```

Si mobile fuera otra entrada de catálogo, Rumble seguiría instanciando la
implementación PC y **nunca tendría vista mobile**. Además el `id` de
`FichaCatalogo` es el game-id del servidor (ver `registroMotores.ts:36-43`);
inventar un id de cliente rompe ese contrato.

---

## Recomendación: mecanismo C — shell delegador

`JuegoCarioca` pasa a ser una cáscara fina que implementa `IJuego` y delega en
una de dos implementaciones hermanas:

```
JuegoCarioca (shell, implements IJuego)
├── VistaCariocaPc      ← el JuegoCarioca actual, movido tal cual, SIN editar
└── VistaCariocaMovil   ← nuevo, DOM/2D puro (patrón de juegoMentiroso.ts)
```

### Por qué es seguro para PC

1. **PC es un `git mv`.** El cuerpo actual de `juegoCarioca.ts` se mueve sin
   editar una línea de lógica. `escena/`, `disposicion.ts`, `dimensionesMesa.ts`,
   `insigniasMesa.ts` y `seleccion.ts` **no se tocan en absoluto**. Si el
   breakpoint no matchea, el código que ejecuta PC es idéntico byte a byte.
2. **`coordinador.ts` y `catalogo.ts` no cambian.** El coordinador crea el juego
   una sola vez y luego solo sincroniza (`hub/coordinador.ts:357-363`):

   ```ts
   if (this.juego === null) {
     const definicion = this.juegoSeleccionado;
     if (definicion === null) return;
     this.juego = definicion.crear();
     this.juego.iniciar(this.crearContexto());
   }
   this.juego.sincronizarEstado(vista);
   ```

   La cáscara respeta ese contrato exactamente.
3. **Rumble hereda mobile gratis**, sin tocar `juegoRumble.ts`, porque delega en
   `JuegoCarioca` (`:16`, `:20`, `:35`) — que ahora es el shell.
4. **Rehidratación local en el swap, sin red.** El shell retiene la última
   `VistaPartida` (`JuegoCarioca` ya la guarda en `this.estado.vista`, usada en
   `juegoCarioca.ts:95`). Al cruzar el breakpoint: `finalizar()` la
   implementación vieja → `iniciar()` la nueva → re-`sincronizarEstado(ultimaVista)`.
   **Sin round-trip al servidor** y sin tocar la capa de red ni el orquestador.

### Reutilización que habilita (para no duplicar reglas ni estado)

Reusable al 100 % por mobile, por ser agnóstico del render:

- `estado/maquinaInteraccion.ts` — **pura**, opera sobre `VistaPartida` + eventos.
- `estado/manoPresentacion.ts`, `estado/propuesta.ts`
- `hud/formatoCarta.ts`, `perfil/preferencias.ts`

No reusable (atado a Three): `Escena`, `Sincronizador`, `Seleccionador`,
`InsigniasMesa`, `disposicion.ts`, `difVista.ts`.

### Aislamiento de CSS (crítico)

Los estilos mobile van en un **archivo nuevo** (p. ej. `estilosMovil.css`) con
todas las reglas bajo un scope raíz (`.movil …`). `src/estilos.css` **no se
modifica**. Esto evita el riesgo de que un `@media` inyectado en el CSS de PC
altere el layout actual — recordar que ese archivo tiene hoy 0 media queries y
una lista blanca de `pointer-events: auto` enumerada a mano (`estilos.css:33-44`).

---

## Preguntas abiertas para `REGLAS_MESA_CARIOCA_MOBILE.md`

A resolver **antes** de cualquier sesión de implementación:

1. **Definición exacta del breakpoint.** Debe ser imposible que un PC lo
   dispare. Propuesta a validar:
   `(orientation: portrait) and (max-width: Npx) and (pointer: coarse)`. Fijar
   `N`, y decidir si `pointer: coarse` entra — excluirlo permite probar mobile en
   el navegador de escritorio (coherente con la selección por viewport elegida),
   pero entonces la histéresis del punto 2 se vuelve obligatoria.
2. **Histéresis del swap.** Con árboles de render distintos, arrastrar el borde
   de la ventana alrededor del umbral destruiría y reconstruiría la UI en bucle.
   Definir margen muerto y/o debounce.
3. **Swap a mitad de interacción.** Qué ocurre al rotar el dispositivo con un
   modal de bajada abierto o cartas seleccionadas. `EstadoInteraccion` es
   serializable: decidir si se transfiere o se resetea a `ESTADO_INICIAL`.
4. **HUD: ¿compartido o propio?** `hud/hud.ts:43-51` monta 5 secciones absolutas
   y `.hud-top` es un grid de 3 lanes (`estilos.css:307-318`) — forma PC.
   Decidir entre un `HudMovil` propio (riesgo: duplicar lógica de botones de
   acción) o reusar el `Hud` actual con CSS scoped.
5. **Insignias de jugadores.** `insigniasMesa.ts` proyecta 3D→DOM y no aplica en
   mobile. Definir cómo se representan los rivales en la zona HUB.
6. **Regla de la doble etapa.** Formalizar el predicado 4-zonas vs 5-zonas en
   términos de la vista: presumiblemente `vista.mesa.length > 0`. Confirmar que
   es eso y no "algún jugador se bajó" (`JugadorVista.seBajo`, `vista.ts:26`),
   que no es equivalente.
7. **Agrupación por `duenoId`** en la zona ESCALAS Y TRIOS: confirmar que se
   agrupa por dueño. El dato está disponible; hoy PC no lo usa.

**No es prerequisito:** el issue de `typecheck:tests` del servidor (Hallazgo 2).

---

## Criterio de hecho — cobertura

| Requisito | Sección |
|---|---|
| Cómo está acoplado hoy el render a un único layout | Hallazgo 1 |
| Si el issue de `VistaJuego` intersecta y cómo | Hallazgo 2 (no intersecta) |
| Qué datos faltan en `MotorJuego`/`IJuego` para ESCALAS Y TRIOS | Hallazgo 3 (ninguno) |
| Mecanismo recomendado sin riesgo para PC, con justificación | Hallazgo 4 + Recomendación |
