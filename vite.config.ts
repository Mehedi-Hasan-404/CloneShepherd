// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Only used in `vite dev`, ignored in `vite build`
  server: {
    port: 5000,
    host: true, // only binds to 0.0.0.0 if CLI uses --host
    // allowedHosts defaults to "auto" (safe)
  },
});
