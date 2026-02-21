/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_URL?: string;
    readonly VITE_COPILOT_RUNTIME_URL?: string;
    readonly VITE_AUTH_DISABLE_USERNAME_PASSWORD?: string;
    readonly VITE_USE_MOCKS?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
