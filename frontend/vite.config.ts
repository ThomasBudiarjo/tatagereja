import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Single Vite+ config: dev server proxies the API to the Go backend, and the
// production build emits hashed assets into the Go embed directory.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../internal/frontend/dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: false },
      "/healthz": { target: "http://localhost:8080", changeOrigin: false },
    },
  },
});
