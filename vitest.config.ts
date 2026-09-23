import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Même alias que tsconfig : sans lui, tout module importé par un test et
  // écrivant "@/…" (les schémas, par exemple) reste intestable.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Tests d'intégration contre une vraie base : pas de parallélisme
    // pour garder un ordre d'inscription déterministe.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
