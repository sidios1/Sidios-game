# HUB.md — Catálogo del hub (launcher)

El hub del cliente es un **launcher tipo biblioteca**: una grilla de tarjetas, una
por juego, con portada, nombre, jugadores y una acción. Es **100% game-agnostic**:
itera el registro (`packages/client/src/juego/catalogo.ts`) y nunca conoce un juego
por nombre. **Agregar un juego = registrar su ficha; no se toca `src/hub/`.**

## Contrato `FichaCatalogo`

Definido en `packages/client/src/juego/ficha.ts`. Es metadata **pura de
presentación**: vive solo en el cliente, nunca en los paquetes `*-core` ni en la
capa de motor/servidor.

```ts
export interface FichaCatalogo {
  readonly id: string;                 // game-id; == clave del motor en el servidor
  readonly nombre: string;
  readonly descriptorCorto?: string;   // línea breve bajo el nombre (opcional)
  readonly jugadores: { readonly min: number; readonly max: number | null }; // max:null = sin tope
  readonly estado: "jugable" | "en_desarrollo";
  readonly portada: Portada;
}

export type ComponentePortada = () => HTMLElement;

export type Portada =
  | { readonly tipo: "componente"; readonly componente: ComponentePortada }
  | { readonly tipo: "imagen"; readonly src: string }; // definida; sin uso en v1
```

`DefinicionJuego` (`juego/ijuego.ts`) **extiende** `FichaCatalogo` y agrega la
fábrica `crear(): IJuego`. El hub solo necesita la ficha para pintar la tarjeta; el
coordinador usa además `crear()` al lanzar la partida.

### Reglas de presentación

- **Línea de jugadores:** `max === null` → "Jugadores ilimitados"; si no,
  `"{min}–{max} jugadores"`.
- **`estado` gobierna la acción:**
  - `jugable` → botón "Jugar" cableado al flujo de conexión existente.
  - `en_desarrollo` → acción deshabilitada + badge "En desarrollo"; la tarjeta se
    muestra pero **no es lanzable**. Cambiar `estado` a `"jugable"` la vuelve
    lanzable sin ningún otro cambio.
- **Portadas:** componentes CSS/SVG autocontenidos (sin assets externos, sin
  Three.js, sin gradientes en v1). Viven en la carpeta del módulo
  (`juegos/<juego>/portada.ts`).

## Registrar un módulo nuevo

1. Crear `packages/client/src/juegos/<juego>/portada.ts` que exporte
   `() => HTMLElement` (la portada, SVG/CSS autocontenido).
2. En `packages/client/src/juegos/<juego>/definicion.ts` declarar la
   `DefinicionJuego` (ficha + `crear()`), importando la portada.
3. Añadir la definición a `CATALOGO` en `packages/client/src/juego/catalogo.ts`.
4. Registrar el motor en el servidor (`packages/server/src/registroMotores.ts`) con
   el mismo `id`.

La tarjeta aparece en el hub sin tocar `src/hub/`.
