import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:3000" },
  },
  // Served from localhost, so bundle size is not a network concern; revisit with zod/mini if it grows.
  build: { outDir: "dist", sourcemap: true, chunkSizeWarningLimit: 700 },
});
