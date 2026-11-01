import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // Keep the browser Host/Origin (127.0.0.1:5173) so the server guard sees the real values (D-046).
    proxy: { "/api": { target: "http://127.0.0.1:3000", changeOrigin: false } },
  },
  // Served from localhost, so bundle size is not a network concern; revisit with zod/mini if it grows.
  build: { outDir: "dist", sourcemap: true, chunkSizeWarningLimit: 700 },
});
