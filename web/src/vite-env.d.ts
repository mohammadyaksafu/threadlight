/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API base path for live mode, e.g. "/api" on the VPS. Unset = offline demo only. */
  readonly VITE_API_BASE?: string;
}
