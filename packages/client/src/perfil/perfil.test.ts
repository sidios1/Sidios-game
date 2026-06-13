import { describe, expect, it } from "vitest";
import { POOL_AVATARES, esAvatarValido } from "./avatares.js";
import { borrarPerfil, guardarPerfil, leerPerfil } from "./perfil.js";

/** Storage mínimo en memoria. */
function almacenFalso(): Storage {
  const datos = new Map<string, string>();
  return {
    get length() {
      return datos.size;
    },
    clear: () => datos.clear(),
    getItem: (k) => datos.get(k) ?? null,
    key: (i) => [...datos.keys()][i] ?? null,
    removeItem: (k) => {
      datos.delete(k);
    },
    setItem: (k, v) => {
      datos.set(k, v);
    },
  };
}

const AVATAR = POOL_AVATARES[0] ?? "identicon-1";

describe("perfil", () => {
  it("guarda y lee el perfil", () => {
    const almacen = almacenFalso();
    guardarPerfil(almacen, { nickname: "Ana", avatarId: AVATAR });
    expect(leerPerfil(almacen)).toEqual({ nickname: "Ana", avatarId: AVATAR });
  });

  it("sin perfil guardado devuelve null", () => {
    expect(leerPerfil(almacenFalso())).toBeNull();
  });

  it("ante datos corruptos devuelve null", () => {
    const almacen = almacenFalso();
    almacen.setItem("juegos-perfil", "{rotos");
    expect(leerPerfil(almacen)).toBeNull();
  });

  it("recorta el nickname y descarta nicknames vacíos", () => {
    const almacen = almacenFalso();
    guardarPerfil(almacen, { nickname: "  Ana  ", avatarId: AVATAR });
    expect(leerPerfil(almacen)?.nickname).toBe("Ana");
    almacen.setItem("juegos-perfil", JSON.stringify({ nickname: "   ", avatarId: AVATAR }));
    expect(leerPerfil(almacen)).toBeNull();
  });

  it("si el avatar guardado no existe, cae a uno válido del pool", () => {
    const almacen = almacenFalso();
    almacen.setItem(
      "juegos-perfil",
      JSON.stringify({ nickname: "Ana", avatarId: "borrado" }),
    );
    const perfil = leerPerfil(almacen);
    expect(perfil).not.toBeNull();
    expect(esAvatarValido(perfil?.avatarId ?? "")).toBe(true);
  });

  it("permite borrar el perfil", () => {
    const almacen = almacenFalso();
    guardarPerfil(almacen, { nickname: "Ana", avatarId: AVATAR });
    borrarPerfil(almacen);
    expect(leerPerfil(almacen)).toBeNull();
  });
});
