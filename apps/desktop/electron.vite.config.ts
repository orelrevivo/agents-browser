import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: resolve(process.cwd(), "electron/main.ts"),
        external: ["better-sqlite3"],
      },
    },
    plugins: [externalizeDepsPlugin({ exclude: ["@groubot/db", "@groubot/ai"] })],
  },
  preload: {
    build: {
      rollupOptions: {
        input: resolve(process.cwd(), "electron/preload.ts"),
        output: {
          format: "cjs",
          entryFileNames: "preload.cjs",
        },
      },
    },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    base: "./",
    resolve: {
      alias: {
        "@": resolve(process.cwd(), "src"),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
