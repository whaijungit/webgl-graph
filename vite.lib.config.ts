import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  build: {
    target: "es2022",
    outDir: "dist-lib",
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL("./src/lib/index.ts", import.meta.url)),
      formats: ["es"],
      fileName: "traffic-graph",
    },
  },
});
