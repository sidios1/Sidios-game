// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  POOL_AVATARES,
  avatarPorDefecto,
  crearAvatar,
  esAvatarValido,
} from "./avatares.js";

describe("avatares", () => {
  it("el pool tiene ids únicos y suficientes para variedad", () => {
    expect(POOL_AVATARES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(POOL_AVATARES).size).toBe(POOL_AVATARES.length);
  });

  it("esAvatarValido reconoce los del pool y rechaza otros", () => {
    for (const id of POOL_AVATARES) expect(esAvatarValido(id)).toBe(true);
    expect(esAvatarValido("no-existe")).toBe(false);
  });

  it("avatarPorDefecto es determinista y siempre cae en el pool", () => {
    const a = avatarPorDefecto("Ana");
    expect(avatarPorDefecto("Ana")).toBe(a);
    expect(esAvatarValido(a)).toBe(true);
    expect(esAvatarValido(avatarPorDefecto("Beto"))).toBe(true);
  });

  it("crearAvatar devuelve un canvas del tamaño pedido (sin lanzar en jsdom)", () => {
    const canvas = crearAvatar(POOL_AVATARES[0] ?? "identicon-1", 64);
    expect(canvas.width).toBe(64);
    expect(canvas.height).toBe(64);
  });
});
