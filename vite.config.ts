import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import UnoCSS from "unocss/vite";
import { fileURLToPath, URL } from "node:url";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { PrimeVueResolver } from "@primevue/auto-import-resolver";
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    UnoCSS(),
    AutoImport({
      imports: ["vue"],
      dts: "src/auto-imports.d.ts",
    }),
    Components({
      resolvers: [PrimeVueResolver()],
      dts: "src/components.d.ts",
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ["leafer-x-easy-snap"],
  },
  // Docker/low-memory builds: skip sourcemaps & gzip size reporting (prevents OOM / exit 139)
  build: {
    sourcemap: process.env.DOCKER_BUILD === "1" ? false : undefined,
    reportCompressedSize: process.env.DOCKER_BUILD !== "1",
    chunkSizeWarningLimit: 2000,
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
