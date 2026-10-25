/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Synoptic Data public token. Optional: without it the app uses NWS stations only. */
  readonly VITE_SYNOPTIC_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
