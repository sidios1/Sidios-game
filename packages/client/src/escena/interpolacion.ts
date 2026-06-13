// Tweening propio mínimo (sin dependencias): tiempo + easing + callbacks.
// PURO: no conoce Three ni DOM; quien lo usa escribe las poses en alAvanzar.

export type Easing = (t: number) => number;

export const easeInOut: Easing = (t) => t * t * (3 - 2 * t);
export const easeOut: Easing = (t) => 1 - (1 - t) * (1 - t);

export interface OpcionesTween {
  /** Duración en segundos (sin contar el retraso). */
  readonly duracion: number;
  /** Espera antes de empezar, en segundos (p. ej. stagger del reparto). */
  readonly retraso?: number;
  readonly easing?: Easing;
  /** Recibe el progreso [0,1] ya con easing aplicado. */
  readonly alAvanzar: (t: number) => void;
  readonly alTerminar?: () => void;
}

export interface ManejadorTween {
  /** Corta el tween donde está, sin completarlo ni avisar. */
  cancelar(): void;
  /** Salta al final: alAvanzar(1) + alTerminar. */
  terminar(): void;
}

interface TweenActivo {
  transcurrido: number;
  vivo: boolean;
  readonly opciones: OpcionesTween;
}

export class Interpolador {
  private tweens: TweenActivo[] = [];

  agregar(opciones: OpcionesTween): ManejadorTween {
    const tween: TweenActivo = { transcurrido: 0, vivo: true, opciones };
    this.tweens.push(tween);
    return {
      cancelar: () => {
        tween.vivo = false;
      },
      terminar: () => {
        if (!tween.vivo) return;
        tween.vivo = false;
        opciones.alAvanzar(1);
        opciones.alTerminar?.();
      },
    };
  }

  /** Avanza todos los tweens `dt` segundos. */
  actualizar(dt: number): void {
    const vivos: TweenActivo[] = [];
    for (const tween of this.tweens) {
      if (!tween.vivo) continue;
      tween.transcurrido += dt;
      const { duracion, retraso = 0, easing = easeInOut } = tween.opciones;
      const activo = tween.transcurrido - retraso;
      if (activo < 0) {
        vivos.push(tween);
        continue;
      }
      const t = duracion <= 0 ? 1 : Math.min(activo / duracion, 1);
      tween.opciones.alAvanzar(easing(t));
      if (t >= 1) {
        tween.vivo = false;
        tween.opciones.alTerminar?.();
      } else {
        vivos.push(tween);
      }
    }
    this.tweens = vivos;
  }

  /** Completa todo de inmediato (p. ej. antes de reconstruir la escena). */
  saltarTodo(): void {
    const pendientes = this.tweens;
    this.tweens = [];
    for (const tween of pendientes) {
      if (!tween.vivo) continue;
      tween.vivo = false;
      tween.opciones.alAvanzar(1);
      tween.opciones.alTerminar?.();
    }
  }

  get cantidadActiva(): number {
    return this.tweens.filter((t) => t.vivo).length;
  }
}
