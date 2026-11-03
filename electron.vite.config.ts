import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  main: {
    build: { rollupOptions: { input: "electron/index.ts" } },
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    build: { rollupOptions: { input: "electron/preload/index.ts" } },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: ".",
    plugins: [react()],
    build: { rollupOptions: { input: "index.html" } },
  },
});
