import { useCallback } from 'react';
import { usePostHog } from '@posthog/react';
import { runtimeConfig } from '../utils/runtime-config';

const enabled = runtimeConfig.POSTHOG_ENABLED !== 'false';

export function useAnalytics() {
    const posthog = usePostHog();

    const identify = useCallback(
        (userId: string, properties?: Record<string, unknown>) => {
            if (!enabled) return;
            try {
                posthog.identify(userId, properties);
            } catch (e) {
                console.warn('PostHog identify failed', e);
            }
        },
        [posthog],
    );

    const reset = useCallback(() => {
        if (!enabled) return;
        try {
            posthog.reset();
        } catch (e) {
            console.warn('PostHog reset failed', e);
        }
    }, [posthog]);

    return { identify, reset };
}
