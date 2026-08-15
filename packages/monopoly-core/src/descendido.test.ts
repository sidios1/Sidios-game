import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "./aleatorio.js";
import { exito } from "./apoyoPruebas.js";
import { CARTAS_PRENSA_DEPORTIVA } from "./cartasPrensa.js";
import { aplicarCartaPrensa } from "./cartasPrensaEfectos.js";
import { entrarADescendido, intentarSalirPorDobles, pagarMultaDescendido } from "./descendido.js";
import { jugadorDe, type EstadoMonopoly } from "./estado.js";
import { colaRng, dado, partidaDePrueba } from "./pruebasComunes.js";
import { tirarDados } from "./turnos.js";

function conJugador1(estado: EstadoMonopoly, cambios: Partial<EstadoMonopoly["jugadores"][number]>): EstadoMonopoly {
  return { ...estado, jugadores: estado.jugadores.map((j) => (j.id === "j1" ? { ...j, ...cambios } : j)) };
}

describe("Descendido: entrada (§4)", () => {
  it("entra al caer en la esquina Descenso a la B", () => {
    const estado = conJugador1(partidaDePrueba(), { posicion: 27 });
    const resultado = exito(tirarDados(estado, "j1", colaRng([dado(1), dado(2)]))); // suma 3: 27 -> 30
    const j1 = jugadorDe(resultado, "j1");
    expect(j1.enDescendido).toBe(true);
    expect(j1.posicion).toBe(10);
  });

  it("entra por 3 dobles seguidos", () => {
    const estado = partidaDePrueba();
    const p1 = exito(tirarDados(estado, "j1", colaRng([dado(2), dado(2)])));
    const p2 = exito(tirarDados(p1, "j1", colaRng([dado(4), dado(4)])));
    const p3 = exito(tirarDados(p2, "j1", colaRng([dado(6), dado(6)])));
    expect(jugadorDe(p3, "j1").enDescendido).toBe(true);
  });

  it("entra por la carta Prensa Deportiva #5 (Descendiste)", () => {
    const estado = partidaDePrueba();
    const carta = CARTAS_PRENSA_DEPORTIVA.find((c) => c.id === 5);
    if (carta === undefined) throw new Error("no existe la carta 5");
    const { estado: resultado } = aplicarCartaPrensa(estado, "j1", carta, false, crearGeneradorSemilla(1));
    expect(jugadorDe(resultado, "j1").enDescendido).toBe(true);
  });

  it("entrarADescendido fija la posición en la Cárcel (10) y resetea el contador", () => {
    const resultado = entrarADescendido(partidaDePrueba(), "j1");
    const j1 = jugadorDe(resultado, "j1");
    expect(j1.enDescendido).toBe(true);
    expect(j1.posicion).toBe(10);
    expect(j1.turnosEnDescendido).toBe(0);
  });
});

describe("Descendido: salida (§4)", () => {
  it("sale pagando la multa; NO consume el turno (puede tirar a continuación)", () => {
    const estado = entrarADescendido(partidaDePrueba(), "j1");
    const resultado = exito(pagarMultaDescendido(estado, "j1"));
    const j1 = jugadorDe(resultado, "j1");
    expect(j1.enDescendido).toBe(false);
    expect(j1.presupuesto).toBe(1000 - 25);
    expect(resultado.palcoDelClub).toBe(25);
    expect(resultado.jugadorEnTurno).toBe("j1");
  });

  it("rechaza pagar la multa si el jugador no está en Descendido", () => {
    const resultado = pagarMultaDescendido(partidaDePrueba(), "j1");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe("NO_ESTAS_EN_DESCENDIDO");
  });

  it("sale tirando dobles, se mueve esa misma tirada, SIN bono de turno extra", () => {
    const estado = entrarADescendido(partidaDePrueba(), "j1"); // posición fija en 10 (Cárcel)
    const resultado = exito(tirarDados(estado, "j1", colaRng([dado(5), dado(5)]))); // doble, suma 10
    const j1 = jugadorDe(resultado, "j1");
    expect(j1.enDescendido).toBe(false);
    expect(j1.posicion).toBe(20); // 10 (Cárcel) + 10
    expect(resultado.jugadorEnTurno).toBe("j2"); // sin turno extra pese al doble
  });

  it("no logra salir en los primeros 2 intentos sin dobles: sigue en Descendido, sin perder cartas", () => {
    // Un intento fallido pasa el turno al siguiente jugador (como en el Monopoly
    // clásico: un tiro por turno propio, no reintentos seguidos) — se fuerza
    // `jugadorEnTurno` de vuelta a "j1" entre intentos para aislar el conteo de
    // `turnosEnDescendido` sin depender de la rotación completa (eso ya lo
    // cubre turnos.test.ts).
    const estado = entrarADescendido(partidaDePrueba(), "j1");
    const cartasAntes = jugadorDe(estado, "j1").miClub.length;
    const p1 = exito(tirarDados(estado, "j1", colaRng([dado(2), dado(5)]))); // suma 7, no doble
    expect(jugadorDe(p1, "j1").enDescendido).toBe(true);
    expect(jugadorDe(p1, "j1").turnosEnDescendido).toBe(1);
    expect(jugadorDe(p1, "j1").miClub).toHaveLength(cartasAntes); // sin cambios
    expect(p1.jugadorEnTurno).toBe("j2"); // el turno pasó: intento fallido, no reintento

    const devueltoAJ1 = { ...p1, jugadorEnTurno: "j1", indiceRotacion: 0 };
    const p2 = exito(tirarDados(devueltoAJ1, "j1", colaRng([dado(1), dado(6)])));
    expect(jugadorDe(p2, "j1").enDescendido).toBe(true);
    expect(jugadorDe(p2, "j1").turnosEnDescendido).toBe(2);
  });

  it("pierde un jugador aleatorio exactamente al 3er turno fallido, y sale forzado", () => {
    const base = partidaDePrueba();
    const conCarta = conJugador1(base, {
      enDescendido: true,
      turnosEnDescendido: 2,
      miClub: [{ tipo: "tecnico", id: "c1", tecnico: { id: "t1", nombre: "N", apellido: "A" } }],
    });
    const resultado = exito(tirarDados(conCarta, "j1", colaRng([dado(1), dado(6)]))); // suma 7, no doble: 3er intento
    const j1 = jugadorDe(resultado, "j1");
    expect(j1.enDescendido).toBe(false);
    expect(j1.turnosEnDescendido).toBe(0);
    expect(j1.miClub).toHaveLength(0);
  });

  it("si Mi Club está vacío al fallar el 3er turno, la pérdida es un no-op (igual sale liberado)", () => {
    const base = partidaDePrueba();
    const sinCartas = conJugador1(base, { enDescendido: true, turnosEnDescendido: 2, miClub: [] });
    const resultado = exito(tirarDados(sinCartas, "j1", colaRng([dado(1), dado(6)])));
    const j1 = jugadorDe(resultado, "j1");
    expect(j1.enDescendido).toBe(false);
    expect(j1.miClub).toHaveLength(0);
  });
});

describe("intentarSalirPorDobles (unidad)", () => {
  it("cuenta un intento fallido sin liberar antes del 3ro", () => {
    const estado = entrarADescendido(partidaDePrueba(), "j1");
    const paso = intentarSalirPorDobles(estado, "j1", { esDoble: false }, crearGeneradorSemilla(1));
    expect(paso.salio).toBe(false);
    expect(jugadorDe(paso.estado, "j1").turnosEnDescendido).toBe(1);
    expect(jugadorDe(paso.estado, "j1").enDescendido).toBe(true);
  });

  it("libera de inmediato con un doble", () => {
    const estado = entrarADescendido(partidaDePrueba(), "j1");
    const paso = intentarSalirPorDobles(estado, "j1", { esDoble: true }, crearGeneradorSemilla(1));
    expect(paso.salio).toBe(true);
    expect(jugadorDe(paso.estado, "j1").enDescendido).toBe(false);
  });
});
