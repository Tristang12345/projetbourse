import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Tauri expects a fixed port; use env for flexibility
  server: {
    port: 1420,
    strictPort: true,
  },
  // Production builds go to dist/
  build: {
    outDir: "dist",
    target: ["es2021", "chrome100", "safari13"],
  },
  envPrefix: ["VITE_", "TAURI_"],
});
