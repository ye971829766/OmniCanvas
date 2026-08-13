/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_APP_TITLE?: string;
  readonly VITE_ENABLE_AGENT?: string;
  readonly VITE_ENABLE_IMAGE_GEN?: string;
  readonly VITE_ENABLE_VIDEO_GEN?: string;
  readonly VITE_ENABLE_REMOVE_BG?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_API_CRYPTO?: string;
  readonly VITE_API_CRYPTO_SECRET?: string;
  readonly VITE_API_CRYPTO_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
