import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// base "./" keeps asset URLs relative, so the build works under any GitHub Pages sub-path.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // data/sample.json lives one level up, at the repository root, shared with the Python engine.
  server: { fs: { allow: [".."] } },
  build: { outDir: "dist", sourcemap: true, target: "es2020" },
});
