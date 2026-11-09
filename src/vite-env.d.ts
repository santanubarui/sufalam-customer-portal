/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SAP_BASE_URL?: string
  readonly VITE_SAP_COMPANY_DB?: string
  /** dev-only login prefill (.env.local) */
  readonly VITE_DEV_SAP_USER?: string
  readonly VITE_DEV_SAP_PASSWORD?: string
  readonly VITE_DEV_CARD_CODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
