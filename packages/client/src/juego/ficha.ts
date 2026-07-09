// Contrato de presentación que cada módulo aporta al catálogo del hub. Es
// METADATA PURA: lo único que el hub necesita para pintar la tarjeta del juego.
// No conoce IJuego ni cómo se instancia el juego (eso lo agrega DefinicionJuego
// extendiendo esta ficha en ijuego.ts). Vive solo en el cliente: no toca los
// paquetes *-core ni la capa de motor/servidor.

/**
 * Componente de portada autocontenido: construye y devuelve su nodo DOM. Las
 * portadas son CSS/SVG sin assets externos ni Three.js; el hub las monta dentro
 * de la tarjeta. Que sea una fábrica (no un nodo) evita compartir el mismo
 * elemento entre tarjetas si una ficha se renderizara más de una vez.
 */
export type ComponentePortada = () => HTMLElement;

/**
 * Portada de la tarjeta. Unión etiquetada: v1 usa siempre `componente`; la
 * variante `imagen` queda definida para portadas PNG futuras, sin uso todavía.
 */
export type Portada =
  | { readonly tipo: "componente"; readonly componente: ComponentePortada }
  | { readonly tipo: "imagen"; readonly src: string };

/**
 * Ficha de catálogo de un juego: lo que el launcher del hub muestra en su
 * tarjeta. El `estado` gobierna la acción de la tarjeta (jugable → lanzable;
 * en_desarrollo → muteada con badge). Ver HUB.md para cómo registrar un módulo.
 */
export interface FichaCatalogo {
  /** Game-id; coincide con la clave del motor en el registro del servidor. */
  readonly id: string;
  readonly nombre: string;
  /** Descripción breve bajo el nombre (opcional). */
  readonly descriptorCorto?: string;
  /** Rango de jugadores; `max: null` = sin tope (jugadores ilimitados). */
  readonly jugadores: { readonly min: number; readonly max: number | null };
  readonly estado: "jugable" | "en_desarrollo";
  readonly portada: Portada;
}
