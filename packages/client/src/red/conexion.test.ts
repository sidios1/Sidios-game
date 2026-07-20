import { describe, expect, it } from "vitest";
import type { MensajeServidor } from "@juegos/server/protocolo";
import { serializarServidor } from "@juegos/server/protocolo";
import type { OyentesCliente, TransporteCliente } from "@juegos/server/transporte";
import type { VistaPartida } from "@juegos/server/vista";
import { Conexion } from "./conexion.js";
import type { OyentesConexion } from "./conexion.js";
import { borrarSesion, guardarSesion, leerSesion } from "./sesion.js";

/** Transporte falso en memoria: registra lo enviado y permite inyectar mensajes. */
class TransporteFalso implements TransporteCliente {
  readonly enviados: string[] = [];
  oyentes: OyentesCliente | null = null;
  desconectado = false;

  conectar(_codigo: string, oyentes: OyentesCliente): Promise<void> {
    this.oyentes = oyentes;
    return Promise.resolve();
  }

  enviar(datos: string): void {
    this.enviados.push(datos);
  }

  desconectar(): Promise<void> {
    this.desconectado = true;
    return Promise.resolve();
  }

  recibirDelServidor(mensaje: MensajeServidor): void {
    this.oyentes?.alRecibir(serializarServidor(mensaje));
  }
}

interface Registro {
  bienvenidas: { jugadorId: string; token: string }[];
  vistas: VistaPartida[];
  errores: { codigo: string; mensaje: string }[];
  cierres: string[];
  desconexiones: number;
}

function crearOyentes(): { oyentes: OyentesConexion; registro: Registro } {
  const registro: Registro = {
    bienvenidas: [],
    vistas: [],
    errores: [],
    cierres: [],
    desconexiones: 0,
  };
  const oyentes: OyentesConexion = {
    alBienvenida: (jugadorId, token) => registro.bienvenidas.push({ jugadorId, token }),
    alEstadoSala: () => {},
    alConfigSala: () => {},
    // Esta sala hospeda Carioca: la vista es siempre "carioca" (narrowing seguro
    // por el discriminante de VistaJuego).
    alVista: (vista) => {
      if (vista.juego === "carioca") registro.vistas.push(vista);
    },
    alError: (codigo, mensaje) => registro.errores.push({ codigo, mensaje }),
    alSalaCerrada: (motivo) => registro.cierres.push(motivo),
    alDesconectar: () => {
      registro.desconexiones += 1;
    },
  };
  return { oyentes, registro };
}

/** Storage mínimo en memoria para los tests de sesión. */
function crearAlmacenFalso(): Storage {
  const datos = new Map<string, string>();
  return {
    get length() {
      return datos.size;
    },
    clear: () => datos.clear(),
    getItem: (clave: string) => datos.get(clave) ?? null,
    key: (indice: number) => [...datos.keys()][indice] ?? null,
    removeItem: (clave: string) => {
      datos.delete(clave);
    },
    setItem: (clave: string, valor: string) => {
      datos.set(clave, valor);
    },
  };
}

describe("Conexion", () => {
  it("unirse sin avatar ni token no incluye esas propiedades", async () => {
    const transporte = new TransporteFalso();
    const conexion = new Conexion(transporte);
    await conexion.conectar("127.0.0.1:35711", crearOyentes().oyentes);
    conexion.unirse("Ana");
    // toEqual es estricto con claves extra: prueba que avatar y token NO viajan.
    expect(JSON.parse(transporte.enviados[0] ?? "")).toEqual({
      tipo: "unirse",
      nombre: "Ana",
    });
  });

  it("unirse incluye el avatar cuando se pasa", async () => {
    const transporte = new TransporteFalso();
    const conexion = new Conexion(transporte);
    await conexion.conectar("127.0.0.1:35711", crearOyentes().oyentes);
    conexion.unirse("Ana", "identicon-2");
    expect(JSON.parse(transporte.enviados[0] ?? "")).toEqual({
      tipo: "unirse",
      nombre: "Ana",
      avatar: "identicon-2",
    });
  });

  it("unirse con avatar y token los incluye (reconexión)", async () => {
    const transporte = new TransporteFalso();
    const conexion = new Conexion(transporte);
    await conexion.conectar("127.0.0.1:35711", crearOyentes().oyentes);
    conexion.unirse("Ana", "identicon-2", "token-abc");
    expect(JSON.parse(transporte.enviados[0] ?? "")).toEqual({
      tipo: "unirse",
      nombre: "Ana",
      avatar: "identicon-2",
      token: "token-abc",
    });
  });

  it("enruta bienvenida, error y salaCerrada a sus oyentes", async () => {
    const transporte = new TransporteFalso();
    const conexion = new Conexion(transporte);
    const { oyentes, registro } = crearOyentes();
    await conexion.conectar("127.0.0.1:35711", oyentes);
    transporte.recibirDelServidor({
      tipo: "bienvenida",
      jugadorId: "j1",
      token: "tok",
    });
    transporte.recibirDelServidor({
      tipo: "error",
      codigo: "salaLlena",
      mensaje: "la sala está llena",
    });
    transporte.recibirDelServidor({ tipo: "salaCerrada", motivo: "adiós" });
    expect(registro.bienvenidas).toEqual([{ jugadorId: "j1", token: "tok" }]);
    expect(registro.errores).toEqual([
      { codigo: "salaLlena", mensaje: "la sala está llena" },
    ]);
    expect(registro.cierres).toEqual(["adiós"]);
  });

  it("ignora mensajes malformados y avisa la desconexión", async () => {
    const transporte = new TransporteFalso();
    const conexion = new Conexion(transporte);
    const { oyentes, registro } = crearOyentes();
    await conexion.conectar("127.0.0.1:35711", oyentes);
    transporte.oyentes?.alRecibir("esto no es JSON");
    transporte.oyentes?.alRecibir('{"tipo":"desconocido"}');
    transporte.oyentes?.alDesconectar();
    expect(registro.errores).toEqual([]);
    expect(registro.desconexiones).toBe(1);
  });
});

describe("sesion", () => {
  it("guarda y lee la sesión por código de sala", () => {
    const almacen = crearAlmacenFalso();
    guardarSesion(almacen, "10.0.0.5:35711", { token: "t1", nombre: "Ana" });
    expect(leerSesion(almacen, "10.0.0.5:35711")).toEqual({
      token: "t1",
      nombre: "Ana",
    });
    expect(leerSesion(almacen, "10.0.0.6:35711")).toBeNull();
  });

  it("devuelve null ante datos corruptos y permite borrar", () => {
    const almacen = crearAlmacenFalso();
    almacen.setItem("carioca-sesion:x", "{rotos");
    expect(leerSesion(almacen, "x")).toBeNull();
    guardarSesion(almacen, "y", { token: "t", nombre: "n" });
    borrarSesion(almacen, "y");
    expect(leerSesion(almacen, "y")).toBeNull();
  });
});
