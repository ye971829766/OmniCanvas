import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // Share monorepo root .env (VITE_API_CRYPTO, VITE_API_BASE_URL, secrets)
  envDir: path.resolve(__dirname, ".."),
  server: {
    host: "0.0.0.0",
    port: 5174,
  },
});
