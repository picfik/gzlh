/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_OSS_AK: string;
  readonly VITE_OSS_SK: string;
  readonly VITE_OSS_BUCKET: string;
  readonly VITE_OSS_REGION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
