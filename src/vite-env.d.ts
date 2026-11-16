/// <reference types="vite/client" />

// SAP connection details live on the portal backend only. The browser reads just the public DTS API address
// (sign-in / sign-out are called from the browser, like the DTS web app).
interface ImportMetaEnv {
  readonly VITE_SUFALAM_API_URL?: string
}
