import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  root: resolve(process.cwd(), "src/renderer"),
  publicDir: resolve(process.cwd(), "public"),
  resolve: {
    alias: { "@": resolve(process.cwd(), "src") },
  },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(process.cwd(), "dist/renderer"),
    emptyOutDir: true,
  },
});
