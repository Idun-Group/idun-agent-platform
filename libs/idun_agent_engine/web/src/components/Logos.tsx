/* eslint-disable @next/next/no-img-element */

export function IdunMark({ className = "" }: { className?: string }) {
  return (
    <img
      src="/logos/idun.svg"
      alt="Idun"
      className={`h-10 w-auto select-none ${className}`}
      draggable={false}
    />
  );
}
