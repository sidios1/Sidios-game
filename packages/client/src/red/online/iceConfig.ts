// Configuración ICE (STUN/TURN) y del broker de señalización, leída desde el
// entorno de Vite (`import.meta.env`). Las credenciales de TURN NUNCA se
// hardcodean ni se versionan: viven en packages/client/.env.local (gitignored);
// .env.example documenta las claves. El STUN público no es secreto, así que va
// como valor por defecto.
//
// Vite solo expone al cliente las variables con prefijo VITE_.

/** STUN público por defecto (no secreto): suele bastar para conexión directa. */
const STUN_POR_DEFECTO = "stun:stun.l.google.com:19302";
/** TURN de respaldo por defecto (gratis); requiere credenciales por entorno. */
const TURN_POR_DEFECTO = "turn:free.expressturn.com:3478";

/** Lee una variable de entorno de Vite, o `undefined` si está ausente/vacía. */
function leerEnv(clave: string): string | undefined {
  const valor = (import.meta.env as Record<string, string | undefined>)[clave];
  if (valor === undefined) return undefined;
  const limpio = valor.trim();
  return limpio.length === 0 ? undefined : limpio;
}

/** Configuración del broker de señalización (PeerJS). Vacío = broker público. */
export interface ConfigSenalizacion {
  readonly host?: string;
  readonly port?: number;
  readonly path?: string;
  readonly secure?: boolean;
  readonly key?: string;
}

/** Arma los `iceServers` para RTCPeerConnection con STUN público + TURN de respaldo. */
export function construirRTCConfig(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [
    { urls: leerEnv("VITE_STUN_URL") ?? STUN_POR_DEFECTO },
  ];

  const turnUrl = leerEnv("VITE_TURN_URL") ?? TURN_POR_DEFECTO;
  const turnUsuario = leerEnv("VITE_TURN_USERNAME");
  const turnCredencial = leerEnv("VITE_TURN_CREDENTIAL");
  // El TURN solo se agrega si hay credenciales: sin ellas el servidor las
  // rechazaría. Su ausencia degrada a "solo conexión directa", no rompe.
  if (turnUsuario !== undefined && turnCredencial !== undefined) {
    iceServers.push({
      urls: turnUrl,
      username: turnUsuario,
      credential: turnCredencial,
    });
  }

  return { iceServers };
}

/** Lee la configuración del broker de señalización desde el entorno. */
export function configSenalizacion(): ConfigSenalizacion {
  const host = leerEnv("VITE_PEERJS_HOST");
  const portRaw = leerEnv("VITE_PEERJS_PORT");
  const port = portRaw !== undefined ? Number(portRaw) : undefined;
  const path = leerEnv("VITE_PEERJS_PATH");
  const secure = leerEnv("VITE_PEERJS_SECURE");
  const key = leerEnv("VITE_PEERJS_KEY");
  return {
    ...(host !== undefined ? { host } : {}),
    ...(port !== undefined && Number.isFinite(port) ? { port } : {}),
    ...(path !== undefined ? { path } : {}),
    ...(secure !== undefined ? { secure: secure === "true" } : {}),
    ...(key !== undefined ? { key } : {}),
  };
}
