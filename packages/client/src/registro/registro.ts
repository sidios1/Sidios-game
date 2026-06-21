// Núcleo del visor de log técnico embebido: un registro en memoria, acotado y
// observable. No depende del DOM ni de la red — es una utilidad pura y testeable
// que la UI (panelRegistro.ts) y las capas de observación (captura global,
// decoradores de transporte) alimentan y consumen.

export type NivelLog = "info" | "warn" | "error";

export interface EntradaLog {
  /** Marca de tiempo (epoch ms) de cuando se registró. */
  readonly ts: number;
  readonly nivel: NivelLog;
  readonly mensaje: string;
}

/** Tope del buffer circular: descarta las entradas más viejas al superarlo. */
export const MAX_ENTRADAS = 300;

type Suscriptor = (entradas: readonly EntradaLog[]) => void;

class Registro {
  private readonly buffer: EntradaLog[] = [];
  private readonly suscriptores = new Set<Suscriptor>();

  registrar(nivel: NivelLog, mensaje: string): void {
    this.buffer.push({ ts: Date.now(), nivel, mensaje });
    if (this.buffer.length > MAX_ENTRADAS) {
      this.buffer.splice(0, this.buffer.length - MAX_ENTRADAS);
    }
    this.notificar();
  }

  info(mensaje: string): void {
    this.registrar("info", mensaje);
  }

  warn(mensaje: string): void {
    this.registrar("warn", mensaje);
  }

  error(mensaje: string): void {
    this.registrar("error", mensaje);
  }

  /** Copia inmutable de las entradas actuales (de la más vieja a la más nueva). */
  entradas(): readonly EntradaLog[] {
    return this.buffer.slice();
  }

  limpiar(): void {
    this.buffer.length = 0;
    this.notificar();
  }

  /** Suscribe un oyente a cada cambio; devuelve la función para desuscribirlo. */
  suscribir(cb: Suscriptor): () => void {
    this.suscriptores.add(cb);
    return () => {
      this.suscriptores.delete(cb);
    };
  }

  private notificar(): void {
    const copia = this.entradas();
    for (const cb of this.suscriptores) cb(copia);
  }
}

/** Registro singleton compartido por toda la app cliente. */
export const registro = new Registro();
