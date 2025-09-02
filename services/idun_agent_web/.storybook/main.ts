import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
    stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
    addons: [
        '@chromatic-com/storybook',
        '@storybook/addon-docs',
        '@storybook/addon-onboarding',
        '@storybook/addon-a11y',
        '@storybook/addon-vitest',
        '@storybook/addon-themes',
    ],
    framework: {
        name: '@storybook/react-vite',
        options: {},
    },

    // 👇 Ajoute ceci
    viteFinal: async (viteConfig) => {
        const ngrokHost = process.env.NGROK_DOMAIN; // ex: 821330a8908f.ngrok-free.app

        viteConfig.server = {
            ...(viteConfig.server ?? {}),
            // Autorise ton domaine externe
            allowedHosts: ['.ngrok-free.app'],
            // Écoute toutes interfaces (utile en tunnel)
            host: true,
            // HMR fiable derrière ngrok (HTTPS + WSS)
            hmr: {
                ...(viteConfig.server &&
                typeof viteConfig.server.hmr === 'object' &&
                viteConfig.server.hmr !== null
                    ? viteConfig.server.hmr
                    : {}),
                protocol: 'wss',
                clientPort: 443,
                host: ngrokHost, // optionnel mais aide si HMR hésite
            },
            // (optionnel) force l’origin si besoin
            // origin: ngrokHost ? `https://${ngrokHost}` : undefined,
        };

        return viteConfig;
    },
};

export default config;
