/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  // El cliente solo importa subpaths de @juegos/server (protocolo, vista,
  // transporte): la raíz arrastraría ws/node:os y rompería el bundle.
  build: {
    // dist/ es la salida de tsc -b (project references); el bundle va aparte.
    outDir: "dist-web",
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
