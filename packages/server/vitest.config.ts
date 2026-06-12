import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Resuelve el core a su fuente TS: los tests no exigen un build previo.
      "@juegos/carioca-core": fileURLToPath(
        new URL("../carioca-core/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
