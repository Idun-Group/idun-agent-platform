/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
// import { nodePolyfills } from 'vite-plugin-node-polyfills';

const dirname =
    typeof __dirname !== 'undefined'
        ? __dirname
        : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
    plugins: [
        react(),
        /*
        nodePolyfills({
            // To exclude specific polyfills, add them to this list.
            exclude: [
                'fs', // Excludes the polyfill for `fs` and `node:fs`.
            ],
            // Whether to polyfill specific globals.
            globals: {
                Buffer: true, // can also be 'build', 'dev', or false
                global: true,
                process: true,
            },
            // Whether to polyfill `node:` protocol imports.
            protocolImports: true,
        }),
        */
    ],
    define: {
        'process.env': {},
    },
    resolve: {
    },
    server: {
        proxy: {
            '/copilotkit-virtual': {
                // Default to localhost:8001 for local dev. Docker compose sets VITE_COPILOT_RUNTIME_URL to http://copilot-runtime:8001
                target: process.env.VITE_COPILOT_RUNTIME_URL || 'http://localhost:8001',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/copilotkit-virtual/, '/copilotkit'),
                secure: false,
            },
            '/api': {
                // In docker-compose, backend service is agent-manager-dev
                target: process.env.VITE_API_PROXY_TARGET || 'http://agent-manager-dev:8000',
                changeOrigin: true,
                secure: false,
            },
        },
    },
    test: {
        projects: [
            {
                extends: true,
                plugins: [
                    // The plugin will run tests for the stories defined in your Storybook config
                    // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
                    storybookTest({
                        configDir: path.join(dirname, '.storybook'),
                    }),
                ],
                test: {
                    name: 'storybook',
                    browser: {
                        enabled: true,
                        headless: true,
                        provider: 'playwright',
                        instances: [
                            {
                                browser: 'chromium',
                            },
                        ],
                    },
                    setupFiles: ['.storybook/vitest.setup.ts'],
                },
            },
        ],
    },
});
