import { crearPartida, REGLAS_MELOQUIZ } from "@juegos/meloquiz-core";
import { describe, expect, it } from "vitest";

import { crearFuenteLocal, FRACCION_INICIO } from "./fuenteLocal.js";
import type { ILectorMetadatos, MetadatosCrudos } from "./metadatos.js";
import type { ArchivoLocal, ISistemaArchivos } from "./sistemaArchivos.js";

// ── Dobles ────────────────────────────────────────────────────────────────
// Los puertos permiten ejercitar toda la fuente sin fixtures de audio reales:
// el disco y el parser de tags se sustituyen por objetos en memoria.

interface ArchivoFalso {
  readonly nombre: string;
  /** Bytes que "tiene" el archivo; alimentan la huella del id. */
  readonly contenido: Uint8Array;
  /** Tamaño declarado; por defecto el del contenido. Sirve para forzar colisiones. */
  readonly tamanoBytes?: number;
  /** Metadatos que devuelve el lector, o `"ilegible"` para que reviente. */
  readonly metadatos: MetadatosCrudos | "ilegible";
  /** Categoría (subcarpeta simulada, §11); por defecto suelto (`null`). */
  readonly categoria?: string | null;
}

function bytes(texto: string): Uint8Array {
  return new TextEncoder().encode(texto);
}

function metadatos(parcial: Partial<MetadatosCrudos>): MetadatosCrudos {
  return {
    titulo: null,
    artista: null,
    duracionSegundos: 200,
    caratula: null,
    ...parcial,
  };
}

function crearDobles(archivos: readonly ArchivoFalso[]): {
  sistemaArchivos: ISistemaArchivos;
  lectorMetadatos: ILectorMetadatos;
} {
  const porNombre = new Map(archivos.map((a) => [a.nombre, a]));
  const buscar = (clave: string): ArchivoFalso => {
    const archivo = porNombre.get(clave);
    if (archivo === undefined) throw new Error(`archivo inexistente: ${clave}`);
    return archivo;
  };

  const sistemaArchivos: ISistemaArchivos = {
    listar(): Promise<readonly ArchivoLocal[]> {
      return Promise.resolve(
        archivos.map((a) => ({
          clave: a.nombre,
          nombre: a.nombre,
          tamanoBytes: a.tamanoBytes ?? a.contenido.length,
          categoria: a.categoria ?? null,
        })),
      );
    },
    leerPrefijo(clave: string, cantidad: number): Promise<Uint8Array> {
      return Promise.resolve(buscar(clave).contenido.subarray(0, cantidad));
    },
    abrirFlujo(): Promise<ReadableStream<Uint8Array>> {
      throw new Error("el lector falso no abre flujos");
    },
  };

  const lectorMetadatos: ILectorMetadatos = {
    leer(archivo: ArchivoLocal): Promise<MetadatosCrudos> {
      const falso = buscar(archivo.clave);
      if (falso.metadatos === "ilegible") {
        return Promise.reject(new Error("archivo corrupto"));
      }
      return Promise.resolve(falso.metadatos);
    },
  };

  return { sistemaArchivos, lectorMetadatos };
}

function cargar(
  archivos: readonly ArchivoFalso[],
  categoriasSeleccionadas?: readonly string[] | null,
) {
  return crearFuenteLocal({
    carpeta: "/musica",
    ...crearDobles(archivos),
    ...(categoriasSeleccionadas !== undefined ? { categoriasSeleccionadas } : {}),
  }).cargarDetallado();
}

/** Cuatro canciones sanas: el mínimo del reglamento. */
function cuatroSanas(): ArchivoFalso[] {
  return [1, 2, 3, 4].map((n) => ({
    nombre: `Tema ${n}.mp3`,
    contenido: bytes(`audio-${n}`),
    metadatos: metadatos({ titulo: `Tema ${n}`, artista: `Artista ${n}` }),
  }));
}

// ── Casos ─────────────────────────────────────────────────────────────────

describe("crearFuenteLocal — armado del pool", () => {
  it("cumple el contrato IFuenteCatalogo con id 'local'", () => {
    expect(crearFuenteLocal({ carpeta: "/musica", ...crearDobles([]) }).id).toBe("local");
  });

  it("arma un pool con las canciones válidas de una carpeta mixta", async () => {
    const resultado = await cargar([
      ...cuatroSanas(),
      {
        nombre: "05 - Sin_Tag_320kbps.flac",
        contenido: bytes("audio-5"),
        metadatos: metadatos({ duracionSegundos: 100 }),
      },
      { nombre: "notas.txt", contenido: bytes("x"), metadatos: metadatos({}) },
      { nombre: "roto.mp3", contenido: bytes("audio-roto"), metadatos: "ilegible" },
    ]);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const { canciones } = resultado.valor.pool;
    expect(canciones).toHaveLength(5);
    // El tag manda; donde falta, el título sale del nombre ya normalizado (§1, §2).
    expect(canciones.map((c) => c.titulo)).toEqual([
      "Tema 1",
      "Tema 2",
      "Tema 3",
      "Tema 4",
      "Sin Tag",
    ]);
    expect(resultado.valor.descartados).toMatchObject({
      total: 2,
      porFormatoNoSoportado: 1,
      porIlegible: 1,
      porSinDuracion: 0,
      porSinTitulo: 0,
    });
    expect(resultado.valor.descartados.nombres).toEqual(["notas.txt", "roto.mp3"]);
  });

  it("acepta los cuatro formatos de §1 y descarta el resto", async () => {
    const soportados = ["a.mp3", "b.m4a", "c.flac", "d.opus", "e.AAC"];
    const resultado = await cargar([
      ...soportados.map((nombre) => ({
        nombre,
        contenido: bytes(nombre),
        metadatos: metadatos({ titulo: nombre }),
      })),
      { nombre: "video.mkv", contenido: bytes("v"), metadatos: metadatos({}) },
      { nombre: "clip.avi", contenido: bytes("v"), metadatos: metadatos({}) },
    ]);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.valor.pool.canciones).toHaveLength(5);
    expect(resultado.valor.descartados.porFormatoNoSoportado).toBe(2);
  });

  it("fija el inicio del clip en ~30% de la duración (§1)", async () => {
    const archivos = cuatroSanas();
    archivos[0] = { ...archivos[0]!, metadatos: metadatos({ duracionSegundos: 240 }) };

    const resultado = await cargar(archivos);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.valor.pool.canciones[0]?.segundoInicio).toBeCloseTo(240 * FRACCION_INICIO);
    expect(FRACCION_INICIO).toBe(0.3);
  });

  it("descarta el archivo sin duración utilizable y lo cuenta", async () => {
    const resultado = await cargar([
      ...cuatroSanas(),
      { nombre: "sin-dur.mp3", contenido: bytes("x"), metadatos: metadatos({ duracionSegundos: null }) },
      { nombre: "dur-cero.mp3", contenido: bytes("y"), metadatos: metadatos({ duracionSegundos: 0 }) },
    ]);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.valor.pool.canciones).toHaveLength(4);
    expect(resultado.valor.descartados.porSinDuracion).toBe(2);
  });

  it("expone la carátula embebida y deja claveCaratula en null si falta (§1)", async () => {
    const archivos = cuatroSanas();
    const arte = bytes("bytes-de-la-tapa");
    archivos[0] = {
      ...archivos[0]!,
      metadatos: metadatos({
        titulo: "Con tapa",
        caratula: { bytes: arte, tipoMime: "image/jpeg" },
      }),
    };

    const resultado = await cargar(archivos);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const [conTapa, sinTapa] = resultado.valor.pool.canciones;
    expect(conTapa?.claveCaratula).not.toBeNull();
    expect(sinTapa?.claveCaratula).toBeNull();
    expect(resultado.valor.caratulas.get(conTapa!.claveCaratula!)).toEqual({
      bytes: arte,
      tipoMime: "image/jpeg",
    });
  });

  it("indexa claveArchivo → ruta real sin meter la ruta en el pool", async () => {
    const resultado = await cargar(cuatroSanas());
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const primera = resultado.valor.pool.canciones[0]!;
    expect(resultado.valor.indiceArchivos.get(primera.claveArchivo)).toBe("Tema 1.mp3");
  });
});

describe("crearFuenteLocal — identificador de pista (invariante de ocultamiento)", () => {
  it("el id es opaco: no filtra el título ni el nombre del archivo", async () => {
    const resultado = await cargar(cuatroSanas());
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    for (const cancion of resultado.valor.pool.canciones) {
      expect(cancion.id).toMatch(/^[0-9a-f]{64}$/);
      expect(cancion.id.toLowerCase()).not.toContain(cancion.titulo.toLowerCase());
      expect(cancion.id).not.toContain(cancion.claveArchivo);
    }
  });

  it("el mismo contenido bajo otro nombre da el MISMO id (deriva del contenido)", async () => {
    const [uno, dos] = await Promise.all([
      cargar([
        { nombre: "a.mp3", contenido: bytes("igual"), metadatos: metadatos({ titulo: "A" }) },
        ...cuatroSanas(),
      ]),
      cargar([
        { nombre: "z.mp3", contenido: bytes("igual"), metadatos: metadatos({ titulo: "Z" }) },
        ...cuatroSanas(),
      ]),
    ]);

    expect(uno.ok && dos.ok).toBe(true);
    if (!uno.ok || !dos.ok) return;
    expect(uno.valor.pool.canciones[0]?.id).toBe(dos.valor.pool.canciones[0]?.id);
  });

  it("el TAMAÑO entra en la huella: mismo prefijo y distinto tamaño ⇒ ids distintos", async () => {
    // Es el caso que hace viable la huella parcial: dos archivos del mismo
    // álbum/encoder pueden compartir los primeros 64 KB.
    const resultado = await cargar([
      { nombre: "a.mp3", contenido: bytes("prefijo-comun"), tamanoBytes: 5_000_000, metadatos: metadatos({ titulo: "A" }) },
      { nombre: "b.mp3", contenido: bytes("prefijo-comun"), tamanoBytes: 7_000_000, metadatos: metadatos({ titulo: "B" }) },
      ...cuatroSanas(),
    ]);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const [a, b] = resultado.valor.pool.canciones;
    expect(a?.id).not.toBe(b?.id);
  });

  it("una COLISIÓN corta la carga con error: nunca se descarta en silencio", async () => {
    // Mismo prefijo Y mismo tamaño ⇒ misma huella. Dos canciones con el mismo id
    // producirían un pistaId ambiguo y corromperían el voto→respuesta.
    const resultado = await cargar([
      { nombre: "original.mp3", contenido: bytes("identico"), metadatos: metadatos({ titulo: "A" }) },
      { nombre: "copia.mp3", contenido: bytes("identico"), metadatos: metadatos({ titulo: "B" }) },
      ...cuatroSanas(),
    ]);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.codigo).toBe("POOL_INVALIDO");
    expect(resultado.error.mensaje).toContain("original.mp3");
    expect(resultado.error.mensaje).toContain("copia.mp3");
  });
});

describe("crearFuenteLocal — mínimo de canciones (§2)", () => {
  it("bloquea con mensaje claro si hay menos del mínimo del reglamento", async () => {
    const resultado = await cargar(cuatroSanas().slice(0, 3));

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.codigo).toBe("POOL_INVALIDO");
    expect(resultado.error.mensaje).toContain(String(REGLAS_MELOQUIZ.minimoCanciones));
  });

  it("cuenta solo las VÁLIDAS: una carpeta llena de descartes también bloquea", async () => {
    const resultado = await cargar([
      ...cuatroSanas().slice(0, 3),
      { nombre: "roto.mp3", contenido: bytes("x"), metadatos: "ilegible" },
      { nombre: "leeme.txt", contenido: bytes("x"), metadatos: metadatos({}) },
    ]);

    expect(resultado.ok).toBe(false);
  });

  it("`cargar()` (el contrato de S1) rechaza con el mensaje de bloqueo", async () => {
    const fuente = crearFuenteLocal({
      carpeta: "/musica",
      ...crearDobles(cuatroSanas().slice(0, 2)),
    });
    await expect(fuente.cargar()).rejects.toThrow(/al menos 4 canciones/);
  });
});

describe("crearFuenteLocal — selección de categorías (§11)", () => {
  function archivosDeDosCategorias(): ArchivoFalso[] {
    // 3 Facil + 1 suelto = 4 (justo el mínimo del reglamento §2), para poder
    // filtrar a una sola categoría sin que el pool quede insuficiente.
    const facil = [1, 2, 3].map((n) => ({
      nombre: `Facil ${n}.mp3`,
      contenido: bytes(`facil-${n}`),
      metadatos: metadatos({ titulo: `Facil ${n}` }),
      categoria: "Facil",
    }));
    const dificil = [1, 2].map((n) => ({
      nombre: `Dificil ${n}.mp3`,
      contenido: bytes(`dificil-${n}`),
      metadatos: metadatos({ titulo: `Dificil ${n}` }),
      categoria: "Dificil",
    }));
    const suelto = {
      nombre: "Suelto.mp3",
      contenido: bytes("suelto"),
      metadatos: metadatos({ titulo: "Suelto" }),
      categoria: null,
    };
    return [...facil, ...dificil, suelto];
  }

  it("sin selección (undefined/null), entran todas las categorías", async () => {
    const resultado = await cargar(archivosDeDosCategorias());
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.valor.pool.canciones).toHaveLength(6);
  });

  it("filtra a solo la categoría marcada, pero deja pasar los sueltos", async () => {
    const resultado = await cargar(archivosDeDosCategorias(), ["Facil"]);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const titulos = resultado.valor.pool.canciones.map((c) => c.titulo).sort();
    expect(titulos).toEqual(["Facil 1", "Facil 2", "Facil 3", "Suelto"]);
  });

  it("propaga la categoría de cada archivo al CancionPool", async () => {
    const resultado = await cargar(archivosDeDosCategorias());
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const porTitulo = new Map(resultado.valor.pool.canciones.map((c) => [c.titulo, c.categoria]));
    expect(porTitulo.get("Facil 1")).toBe("Facil");
    expect(porTitulo.get("Dificil 1")).toBe("Dificil");
    expect(porTitulo.get("Suelto")).toBeNull();
  });

  it("una selección de categorías inexistentes deja solo los sueltos", async () => {
    const resultado = await cargar(archivosDeDosCategorias(), ["Extremo"]);
    expect(resultado.ok).toBe(false); // 1 suelto < mínimo de 4 (§2)
  });
});

describe("criterio de hecho: el núcleo de S1 consume el pool sin cambios", () => {
  it("crearPartida acepta el PoolPartida que produjo la fuente local", async () => {
    const fuente = crearFuenteLocal({ carpeta: "/musica", ...crearDobles(cuatroSanas()) });
    const pool = await fuente.cargar();

    const partida = crearPartida(
      [
        { id: "j1", nombre: "Ana" },
        { id: "j2", nombre: "Bruno" },
      ],
      pool,
      {},
      () => 0.5,
      0,
    );

    expect(partida.ok).toBe(true);
    if (!partida.ok) return;

    // La ronda 1 quedó armada con una canción DEL pool que produjo la fuente
    // (§4, pivote: ya no hay opciones ni distractores, solo la que suena).
    const ronda = partida.valor.rondaActual;
    expect(ronda).not.toBeNull();
    expect(pool.canciones.some((c) => c.id === ronda?.cancionId)).toBe(true);
  });
});
