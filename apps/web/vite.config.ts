import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/companies": { target: "http://localhost:3000", changeOrigin: true },
      "/approvals": { target: "http://localhost:3000", changeOrigin: true },
      "/templates": { target: "http://localhost:3000", changeOrigin: true },
      "/issues": { target: "http://localhost:3000", changeOrigin: true },
      "/action-nodes": { target: "http://localhost:3000", changeOrigin: true },
      "/heartbeat-runs": { target: "http://localhost:3000", changeOrigin: true },
      "/health": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
});
