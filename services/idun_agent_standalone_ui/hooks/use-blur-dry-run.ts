"use client";

import { useRef } from "react";

type Args<T> = {
  mutationFn: (value: string) => Promise<T>;
  onError: (err: unknown) => void;
};

/**
 * Triggers a dry-run mutation when the user pauses (typically on
 * `onBlur`) and skips re-runs when the value is identical to the
 * last one.
 *
 * No debounce, no in-flight cancellation, no race handling — when the
 * user pauses, the call runs once. If they keep editing and tab out
 * again with a different value, it runs again.
 */
export function useBlurDryRun<T>({ mutationFn, onError }: Args<T>) {
  const last = useRef<string | null>(null);

  async function run(value: string): Promise<void> {
    if (value === last.current) return;
    last.current = value;
    try {
      await mutationFn(value);
    } catch (err) {
      onError(err);
    }
  }

  function reset(): void {
    last.current = null;
  }

  return { run, reset };
}
