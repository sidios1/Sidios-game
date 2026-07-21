// El desfase de reloj contra el host: estado 100 % LOCAL del cliente (SPIKE
// MELOQUIZ §2.1 — el host jamás conoce el offset de nadie; cada cliente traduce
// el `faseInicioMs` de la vista a SU hora local). Lo ESCRIBE el transporte (el
// estimador que vive en el adaptador) y lo LEEN los juegos; mismo patrón de
// singleton compartido que `indiceLocal` de MeloQuiz.
//
// Sesiones con generación: el coordinador crea un transporte NUEVO por cada
// reintento de conexión, y durante un reintento pueden convivir dos transportes.
// Un pong tardío del viejo no debe pisar la estimación del nuevo, así que cada
// transporte abre su propia sesión y solo la sesión VIGENTE puede escribir —
// el mismo truco que la `gen` del coordinador, pero local al reloj.
//
// Sin muestras el offset es 0: la garantía del modo entrenamiento (REGLAS
// MELOQUIZ §6) y del host loopback (mismo proceso ⇒ desfase 0 por definición,
// ahí no se monta estimador).

/** El asa de escritura que recibe UN transporte; muere con su conexión. */
export interface SesionReloj {
  /** Publica el offset vigente del estimador; una sesión vieja no escribe. */
  actualizar(offsetMs: number): void;
  /** Invalida esta sesión (al cerrar el canal); la estimación queda como está. */
  cerrar(): void;
}

export class RelojHost {
  private gen = 0;
  private offset = 0;
  private cuenta = 0;

  /**
   * Abre una sesión NUEVA e invalida en silencio a la anterior. La estimación
   * vuelve a cero: una conexión nueva puede ser contra OTRO host, y "0 = no sé
   * nada todavía" es honesto — la ráfaga inicial del estimador la repuebla en
   * menos de un segundo.
   */
  nuevaSesion(): SesionReloj {
    this.gen += 1;
    const mia = this.gen;
    this.offset = 0;
    this.cuenta = 0;
    return {
      actualizar: (offsetMs) => {
        if (mia !== this.gen) return; // pong tardío de un transporte viejo.
        this.offset = offsetMs;
        this.cuenta += 1;
      },
      cerrar: () => {
        // Solo se auto-invalida: si ya hay una sesión más nueva, no la toca.
        if (mia === this.gen) this.gen += 1;
      },
    };
  }

  /** Ms que el reloj del host va POR DELANTE del local; 0 sin muestras. */
  get offsetMs(): number {
    return this.offset;
  }

  /** Actualizaciones aceptadas de la sesión vigente (0 = offset por defecto). */
  get muestras(): number {
    return this.cuenta;
  }

  /** Traduce un instante del reloj del HOST (p. ej. `faseInicioMs`) al local. */
  aHoraLocal(hostMs: number): number {
    return hostMs - this.offset;
  }
}

/**
 * Singleton compartido entre el transporte (escritor) y los juegos (lectores).
 * En el navegador hay UN transporte activo por vez, así que un solo reloj basta.
 */
export const relojHost = new RelojHost();
