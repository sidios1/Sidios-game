import { fileURLToPath } from "node:url";

import { validarPoolSobres } from "@juegos/monopoly-core";
import { describe, expect, it } from "vitest";

import { cargarCatalogoClubes, crearFuenteDatosArchivo } from "./fuenteDatosArchivo.js";

const RUTA_DATOS = fileURLToPath(new URL("../../../datos", import.meta.url));

describe("crearFuenteDatosArchivo (adaptador Node, IFuenteSobres real)", () => {
  it("cargar() lee datos/ reales y produce un PoolSobres válido", async () => {
    const fuente = crearFuenteDatosArchivo(RUTA_DATOS);
    expect(fuente.id).toBe("datos-reales");
    const pool = await fuente.cargar();
    expect(validarPoolSobres(pool).ok).toBe(true);
  });
});

describe("cargarCatalogoClubes", () => {
  it("lee clubes_monopoly.json real y devuelve los 207 clubes con ids únicos", async () => {
    const clubes = await cargarCatalogoClubes(RUTA_DATOS);
    expect(clubes).toHaveLength(207);
    expect(new Set(clubes.map((c) => c.id)).size).toBe(207);
    for (const club of clubes) {
      expect(club.imagenClaraUrl.length).toBeGreaterThan(0);
      expect(club.imagenOscuraUrl.length).toBeGreaterThan(0);
    }
  });
});
