// Lanzador del SERVIDOR LAN EMBEBIDO (Fase 5). Cuando la app corre dentro de
// Tauri, "Crear partida" arranca aquí el sidecar `binaries/servidor` (el servidor
// Node de la Fase 2 empaquetado con Node SEA), que escucha en la LAN e imprime su
// código `ip:puerto`. El host se une luego a ese mismo código.
//
// Este es el ÚNICO módulo del cliente que conoce `@tauri-apps/*`, y lo importa de
// forma DINÁMICA: en el navegador (dev web) y en los tests nunca se ejecuta, así
// que no arrastra Tauri al bundle web ni rompe jsdom. La detección de Tauri vive
// en hayServidorEmbebido(); el resto del cliente solo ve este puerto y estas
// funciones, nunca WebSocket ni procesos.

/** Puerto en el que el servidor embebido escucha (env PUERTO del sidecar). */
export const PUERTO_EMBEBIDO = 35711;

/** Tauri v2 marca el webview con `window.isTauri`. */
declare global {
  interface Window {
    readonly isTauri?: boolean;
  }
}

/** ¿Corremos dentro de la app de escritorio (y por tanto podemos arrancar el sidecar)? */
export function hayServidorEmbebido(): boolean {
  return typeof window !== "undefined" && window.isTauri === true;
}

/** Tipo mínimo del proceso hijo que necesitamos (kill); evita depender del tipo de Tauri. */
interface ProcesoSidecar {
  kill(): Promise<void>;
}

let procesoActual: ProcesoSidecar | null = null;

const MARCADOR = /CODIGO=(.+)/;
const TIEMPO_LIMITE_MS = 10_000;

/**
 * Arranca el sidecar del servidor y resuelve con el código de sala `ip:puerto`
 * que imprime en su salida. `juego` es el game-id que la sala embebida correrá
 * (viaja como env JUEGO; el sidecar lo lee en embebido.ts). Rechaza si no
 * arranca a tiempo o si el proceso muere antes de anunciar el código.
 */
export async function iniciarServidorEmbebido(juego = "carioca"): Promise<string> {
  await detenerServidorEmbebido();
  const { Command } = await import("@tauri-apps/plugin-shell");
  const comando = Command.sidecar("binaries/servidor", [], {
    env: { PUERTO: String(PUERTO_EMBEBIDO), JUEGO: juego },
  });

  return await new Promise<string>((resolver, rechazar) => {
    let acumulado = "";
    let resuelto = false;

    const finalizar = (fn: () => void) => {
      if (resuelto) return;
      resuelto = true;
      clearTimeout(temporizador);
      fn();
    };

    const temporizador = setTimeout(() => {
      finalizar(() => {
        void procesoActual?.kill();
        procesoActual = null;
        rechazar(new Error("el servidor embebido no respondió a tiempo"));
      });
    }, TIEMPO_LIMITE_MS);

    comando.stdout.on("data", (linea: string) => {
      acumulado += linea.endsWith("\n") ? linea : `${linea}\n`;
      const codigo = MARCADOR.exec(acumulado)?.[1];
      if (codigo !== undefined) {
        finalizar(() => resolver(codigo.trim()));
      }
    });
    comando.on("error", (mensaje: string) => {
      finalizar(() => {
        procesoActual = null;
        rechazar(new Error(`no se pudo arrancar el servidor: ${mensaje}`));
      });
    });
    comando.on("close", () => {
      finalizar(() => {
        procesoActual = null;
        rechazar(new Error("el servidor embebido se cerró antes de abrir la sala"));
      });
    });

    comando.spawn().then(
      (hijo) => {
        // Si ya nos rendimos (timeout/cierre), no dejes el proceso huérfano.
        if (resuelto) void hijo.kill();
        else procesoActual = hijo;
      },
      (error: unknown) => {
        finalizar(() =>
          rechazar(error instanceof Error ? error : new Error(String(error))),
        );
      },
    );
  });
}

/** Detiene el sidecar si está corriendo (al volver al hub o cerrar la partida). */
export async function detenerServidorEmbebido(): Promise<void> {
  const proceso = procesoActual;
  procesoActual = null;
  if (proceso !== null) await proceso.kill();
}
