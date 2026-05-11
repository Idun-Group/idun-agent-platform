"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  /** Text or value to copy. Non-strings are JSON-stringified. */
  value: unknown;
  /** Accessible label for screen readers. Defaults to "Copy to clipboard". */
  label?: string;
  /** Optional class overrides on the button. */
  className?: string;
  /** Show the inline "Copied" text alongside the icon (default true). */
  showText?: boolean;
};

/**
 * Small ghost-style copy button. Swaps to a check + "Copied" for 1.5s on
 * success. Fails silently when the clipboard API rejects (sandboxed
 * iframes, vitest jsdom) so callers don't have to guard.
 */
export function CopyButton({
  value,
  label = "Copy to clipboard",
  className,
  showText = true,
}: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const handleClick = useCallback(() => {
    const text =
      typeof value === "string" ? value : JSON.stringify(value, null, 2);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(true);
          if (timerRef.current !== null) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            setCopied(false);
            timerRef.current = null;
          }, 1500);
        })
        .catch(() => {
          // Swallow — sandboxed envs, vitest jsdom. Don't crash the host.
        });
    }
  }, [value]);

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition hover:bg-card hover:text-foreground",
        className,
      )}
    >
      {copied ? (
        <>
          <CheckIcon className="size-3" />
          {showText && "Copied"}
        </>
      ) : (
        <>
          <CopyIcon className="size-3" />
          {showText && "Copy"}
        </>
      )}
    </button>
  );
}
