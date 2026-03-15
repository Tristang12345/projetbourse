import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // ─── Dev server ────────────────────────────────────────────
  // Tauri expects the dev server on a fixed port
  server: {
    port: 1420,
    strictPort: true,
  },

  // ─── Build ─────────────────────────────────────────────────
  build: {
    // Tauri uses ES modules on macOS/Linux, CommonJS on Windows
    target: process.env.TAURI_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },

  // ─── Vitest ────────────────────────────────────────────────
  test: {
    // Run tests in a Node-like jsdom environment (no browser needed)
    environment: "node",
    // Include all *.test.ts and *.spec.ts files
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Coverage config (optional — run with `npm run test:coverage`)
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/utils/**", "src/services/**", "src/store/**"],
      exclude: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    },
  },
});
