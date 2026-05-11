/**
 * Shared RuntimeConfig builder for unit + e2e tests.
 *
 * Use this in tests that need to inject `window.__IDUN_CONFIG__` instead of
 * partial-stub objects. Spreads `DEFAULT_RUNTIME_CONFIG` so callers only
 * override what they care about and the resulting object is structurally
 * complete — consumers reading e.g. `cfg.theme.colors.light.background`
 * will not blow up.
 */

import {
  DEFAULT_RUNTIME_CONFIG,
  type RuntimeConfig,
} from "@/lib/runtime-config";

export function makeRuntimeConfig(
  overrides: Partial<RuntimeConfig> = {},
): RuntimeConfig {
  return {
    ...DEFAULT_RUNTIME_CONFIG,
    ...overrides,
    theme: {
      ...DEFAULT_RUNTIME_CONFIG.theme,
      ...(overrides.theme ?? {}),
    },
  };
}
