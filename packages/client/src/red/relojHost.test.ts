// El contrato del reloj del host: identidad sin muestras (la garantía FORMAL
// del modo entrenamiento — REGLAS MELOQUIZ §6: un jugador solo no sufre ninguna
// traslación) y sesiones con generación (un pong tardío de un transporte viejo
// jamás pisa la estimación del vigente).

import { describe, expect, it } from "vitest";
import { RelojHost } from "./relojHost.js";

describe("RelojHost", () => {
  it("sin muestras es la identidad: offset 0 y aHoraLocal(x) === x", () => {
    const reloj = new RelojHost();
    expect(reloj.muestras).toBe(0);
    expect(reloj.offsetMs).toBe(0);
    expect(reloj.aHoraLocal(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it("la sesión vigente escribe y aHoraLocal traduce reloj de host → local", () => {
    const reloj = new RelojHost();
    const sesion = reloj.nuevaSesion();
    sesion.actualizar(3_000); // el host va 3 s adelantado
    expect(reloj.offsetMs).toBe(3_000);
    expect(reloj.muestras).toBe(1);
    expect(reloj.aHoraLocal(10_000)).toBe(7_000);
  });

  it("abrir una sesión nueva invalida a la anterior (pong tardío no pisa)", () => {
    const reloj = new RelojHost();
    const vieja = reloj.nuevaSesion();
    vieja.actualizar(9_999);
    const nueva = reloj.nuevaSesion();
    expect(reloj.offsetMs).toBe(0); // la sesión nueva arranca de cero

    vieja.actualizar(-5_000); // el transporte viejo sigue vivo un instante más
    expect(reloj.offsetMs).toBe(0);
    expect(reloj.muestras).toBe(0);

    nueva.actualizar(120);
    expect(reloj.offsetMs).toBe(120);
    expect(reloj.muestras).toBe(1);
  });

  it("cerrar() invalida la propia sesión pero conserva la última estimación", () => {
    // Durante una reconexión el juego sigue montado: la última estimación es
    // mejor que nada hasta que la sesión nueva repueble.
    const reloj = new RelojHost();
    const sesion = reloj.nuevaSesion();
    sesion.actualizar(250);
    sesion.cerrar();
    expect(reloj.offsetMs).toBe(250);

    sesion.actualizar(9_999); // escribir tras cerrar: ignorado
    expect(reloj.offsetMs).toBe(250);
  });

  it("cerrar una sesión VIEJA no toca a la vigente", () => {
    const reloj = new RelojHost();
    const vieja = reloj.nuevaSesion();
    const nueva = reloj.nuevaSesion();
    nueva.actualizar(80);
    vieja.cerrar(); // el transporte viejo se limpia tarde: no invalida nada
    nueva.actualizar(85);
    expect(reloj.offsetMs).toBe(85);
    expect(reloj.muestras).toBe(2);
  });
});
