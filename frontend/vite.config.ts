import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

// The SPA is served by the Go binary from the site root (base "/"), with hashed
// assets cached at the Cloudflare edge. Output is embedded via go:embed
// (internal/spa/dist).
export default defineConfig({
  base: "/",
  plugins: [solid(), tailwindcss()],
  build: {
    outDir: "../internal/spa/dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8080",
      "/health": "http://localhost:8080",
    },
  },
});
