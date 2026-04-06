/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  /** Optional pk_test_* used only when running Vite in dev (`import.meta.env.DEV`). */
  readonly VITE_CLERK_PUBLISHABLE_KEY_DEV?: string;
}
