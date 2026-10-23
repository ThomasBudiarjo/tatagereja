/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_SERVER_URL?: string;
  readonly VITE_DEFAULT_SERVER_NAME?: string;
  /** "1" routes the component gallery at /c/:churchId/ui in a production build. */
  readonly VITE_UI_GALLERY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Every feature message in one language (`vite.config.ts`, `localeMessages`). */
declare module 'virtual:locale-messages/*' {
  const messages: Record<string, unknown>;
  export default messages;
}
