interface RuntimeConfig {
    API_URL: string;
    COPILOT_RUNTIME_URL: string;
    AUTH_DISABLE_USERNAME_PASSWORD: string;
    USE_MOCKS: string;
}

declare global {
    interface Window {
        __RUNTIME_CONFIG__?: Partial<RuntimeConfig>;
    }
}

function resolve(key: keyof RuntimeConfig, viteKey: string, fallback: string): string {
    const runtime = window.__RUNTIME_CONFIG__?.[key];
    if (runtime && runtime.trim().length > 0) return runtime;
    const vite = (import.meta as any)?.env?.[viteKey] as string | undefined;
    if (vite && vite.trim().length > 0) return vite;
    return fallback;
}

export const runtimeConfig: RuntimeConfig = {
    API_URL: resolve('API_URL', 'VITE_API_URL', ''),
    COPILOT_RUNTIME_URL: resolve('COPILOT_RUNTIME_URL', 'VITE_COPILOT_RUNTIME_URL', ''),
    AUTH_DISABLE_USERNAME_PASSWORD: resolve(
        'AUTH_DISABLE_USERNAME_PASSWORD',
        'VITE_AUTH_DISABLE_USERNAME_PASSWORD',
        'false',
    ),
    USE_MOCKS: resolve('USE_MOCKS', 'VITE_USE_MOCKS', 'false'),
};
