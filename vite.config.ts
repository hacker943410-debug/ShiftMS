import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  test: {
    pool: "forks",
    fileParallelism: false,
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  },
  resolve: {
    alias: {
      "@renderer": path.resolve(__dirname, "src/renderer"),
      "@shared": path.resolve(__dirname, "src/shared")
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/zrender")) {
            return "vendor-zrender";
          }

          if (
            id.includes("node_modules/echarts/charts") ||
            id.includes("node_modules/echarts/lib/chart") ||
            id.includes("node_modules/echarts/components") ||
            id.includes("node_modules/echarts/lib/component") ||
            id.includes("node_modules/echarts/core") ||
            id.includes("node_modules/echarts/lib/core") ||
            id.includes("node_modules/echarts/renderers") ||
            id.includes("node_modules/echarts/lib/renderer")
          ) {
            return "vendor-echarts";
          }

          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "vendor-react";
          }

          return undefined;
        }
      }
    }
  }
});
