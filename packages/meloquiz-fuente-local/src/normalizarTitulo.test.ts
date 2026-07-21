import { describe, expect, it } from "vitest";

import {
  derivarDeNombreArchivo,
  normalizarTitulo,
  quitarExtension,
  resolverTituloYArtista,
} from "./normalizarTitulo.js";

describe("quitarExtension", () => {
  it("quita la extensión de los formatos soportados", () => {
    expect(quitarExtension("Tema.mp3")).toBe("Tema");
    expect(quitarExtension("Tema.flac")).toBe("Tema");
    expect(quitarExtension("Tema.opus")).toBe("Tema");
    expect(quitarExtension("Tema.m4a")).toBe("Tema");
  });

  it("no toca los puntos internos del nombre", () => {
    expect(quitarExtension("Mr. Brightside.mp3")).toBe("Mr. Brightside");
  });
});

describe("normalizarTitulo (tags ID3, que también vienen sucios)", () => {
  const casos: readonly [string, string][] = [
    ["Cancion_320kbps_HQ", "Cancion"],
    ["Otra Cancion (Official Video)", "Otra Cancion"],
    ["Tema [Lyrics]", "Tema"],
    ["Tema (Remastered 2011)", "Tema"],
    ["  Tema   con    espacios  ", "Tema con espacios"],
    ["www.mp3teca.com Tema", "Tema"],
    ["Tema - ", "Tema"],
  ];

  for (const [entrada, esperado] of casos) {
    it(`limpia ${JSON.stringify(entrada)}`, () => {
      expect(normalizarTitulo(entrada)).toBe(esperado);
    });
  }

  it("devuelve cadena vacía si no queda nada aprovechable", () => {
    expect(normalizarTitulo("___")).toBe("");
    expect(normalizarTitulo("320kbps")).toBe("");
  });
});

describe("derivarDeNombreArchivo (fallback cuando falta el tag, §1)", () => {
  it("limpia numeración de pista y ruido de calidad", () => {
    expect(derivarDeNombreArchivo("01 - Cancion_320kbps_HQ.mp3")).toEqual({
      titulo: "Cancion",
      artista: null,
    });
  });

  it("acepta las variantes de numeración: punto, guion bajo y paréntesis", () => {
    expect(derivarDeNombreArchivo("01. Cancion.mp3").titulo).toBe("Cancion");
    expect(derivarDeNombreArchivo("01_Cancion.mp3").titulo).toBe("Cancion");
    expect(derivarDeNombreArchivo("(01) Cancion.mp3").titulo).toBe("Cancion");
  });

  it("NO se come un número que es parte del título", () => {
    // Sin separador tras los dígitos no es numeración de pista.
    expect(derivarDeNombreArchivo("99 Luftballons.mp3").titulo).toBe("99 Luftballons");
    // Y con numeración real, el 99 del título sobrevive.
    expect(derivarDeNombreArchivo("03 - 99 Luftballons.mp3").titulo).toBe("99 Luftballons");
  });

  it("separa el patrón `Artista - Título`", () => {
    expect(derivarDeNombreArchivo("Artista - Tema.flac")).toEqual({
      titulo: "Tema",
      artista: "Artista",
    });
  });

  it("separa también con guiones bajos como espacios", () => {
    expect(derivarDeNombreArchivo("Artista_-_Tema.opus")).toEqual({
      titulo: "Tema",
      artista: "Artista",
    });
  });

  it("trata los puntos como separadores solo si el nombre no usa espacios", () => {
    expect(derivarDeNombreArchivo("Artista.Nombre.Tema.mp3").titulo).toBe(
      "Artista Nombre Tema",
    );
    expect(derivarDeNombreArchivo("Mr. Brightside.mp3").titulo).toBe("Mr. Brightside");
  });

  it("devuelve título vacío cuando el nombre es puro ruido", () => {
    expect(derivarDeNombreArchivo("___.mp3").titulo).toBe("");
  });
});

describe("resolverTituloYArtista", () => {
  it("el tag manda sobre el nombre de archivo", () => {
    expect(resolverTituloYArtista("Tema Real", "Artista Real", "01 - basura.mp3")).toEqual({
      titulo: "Tema Real",
      artista: "Artista Real",
    });
  });

  it("cae al nombre de archivo si falta el tag de título", () => {
    expect(resolverTituloYArtista(null, null, "Artista - Tema.mp3")).toEqual({
      titulo: "Tema",
      artista: "Artista",
    });
  });

  it("conserva el artista del tag aunque el título venga del nombre", () => {
    expect(resolverTituloYArtista(null, "Del Tag", "Otro - Tema.mp3")).toEqual({
      titulo: "Tema",
      artista: "Del Tag",
    });
  });

  it("trata un tag vacío o de puro ruido como ausente", () => {
    expect(resolverTituloYArtista("   ", null, "Tema Bueno.mp3").titulo).toBe("Tema Bueno");
    expect(resolverTituloYArtista("320kbps", null, "Tema Bueno.mp3").titulo).toBe("Tema Bueno");
  });

  it("limpia el ruido del tag de artista", () => {
    expect(resolverTituloYArtista("Tema", "Artista_HQ", "x.mp3").artista).toBe("Artista");
  });
});
