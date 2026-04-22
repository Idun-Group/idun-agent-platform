import { createGlobalStyle } from 'styled-components';

/**
 * Toast styles — "Option A / Minimal Bar".
 *
 * Design goals:
 *  1. Single accent layer (3px left stripe) — no background gradients.
 *  2. Close X is absolutely positioned; stays aligned at every viewport.
 *  3. Container is responsive: 360px desktop, full-width minus 16px at ≤480px.
 *  4. No `!important`, no negative `top` hacks, no `anchor-center`.
 */
const ToastStyles = createGlobalStyle`
  /* ─── Container ──────────────────────────────────────────────── */
  .Toastify__toast-container {
    width: 360px;
    padding: 0;
    box-sizing: border-box;
  }

  .Toastify__toast-container--top-right {
    top: 16px;
    right: 16px;
  }

  @media (max-width: 480px) {
    .Toastify__toast-container {
      width: calc(100vw - 32px);
    }
    .Toastify__toast-container--top-right {
      top: 12px;
      right: 16px;
      left: 16px;
    }
  }

  /* ─── Base toast card ────────────────────────────────────────── */
  .Toastify__toast {
    position: relative;
    font-family: 'Inter', 'SF Pro Display', -apple-system, system-ui, sans-serif;
    background: hsl(var(--surface-elevated));
    border: 1px solid hsl(var(--border));
    border-radius: 10px;
    padding: 0;
    margin-bottom: 10px;
    min-height: unset;
    overflow: hidden;
    cursor: default;
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.25),
      0 1px 4px rgba(0, 0, 0, 0.15);
    transition: border-color 150ms ease;
  }

  /* Left accent stripe — the only color layer */
  .Toastify__toast::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    border-radius: 10px 0 0 10px;
    background: hsl(var(--muted-foreground));
  }

  /* Hide react-toastify's default icon (we render our own inside the body) */
  .Toastify__toast-icon {
    display: none !important;
  }

  /* ─── Body ───────────────────────────────────────────────────── */
  .Toastify__toast-body {
    margin: 0;
    padding: 13px 40px 13px 18px; /* right padding reserves space for the abs close button */
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.5;
    letter-spacing: -0.005em;
    color: hsl(var(--foreground));
  }

  /* react-toastify wraps content in a div; make it flex-grow */
  .Toastify__toast-body > div:last-child {
    flex: 1;
    min-width: 0;
  }

  /* ─── Close button — absolute, predictable, no hacks ─────────── */
  .Toastify__close-button {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    margin: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: hsl(var(--muted-foreground));
    opacity: 1;
    cursor: pointer;
    transition: color 150ms ease, background 150ms ease;
  }

  .Toastify__close-button:hover {
    color: hsl(var(--foreground));
    background: var(--overlay-medium);
  }

  .Toastify__close-button > svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
  }

  /* ─── Variant accents — stripe + hover border only ───────────── */
  .Toastify__toast--success::before { background: hsl(var(--success, 142 71% 45%)); }
  .Toastify__toast--success:hover   { border-color: hsl(var(--success, 142 71% 45%) / 0.35); }

  .Toastify__toast--error::before   { background: hsl(var(--destructive, 0 72% 51%)); }
  .Toastify__toast--error:hover     { border-color: hsl(var(--destructive, 0 72% 51%) / 0.35); }

  .Toastify__toast--warning::before { background: hsl(var(--warning, 45 93% 47%)); }
  .Toastify__toast--warning:hover   { border-color: hsl(var(--warning, 45 93% 47%) / 0.35); }

  .Toastify__toast--info::before    { background: hsl(var(--primary)); }
  .Toastify__toast--info:hover      { border-color: hsl(var(--primary) / 0.35); }

  /* ─── Progress bar — hidden in Option A (keep the rule so
     re-enabling is one prop flip on <ToastContainer />) ────────── */
  .Toastify__progress-bar {
    display: none;
  }

  /* ─── Animations ─────────────────────────────────────────────── */
  @keyframes idunToastIn {
    from {
      opacity: 0;
      transform: translateX(24px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateX(0) scale(1);
    }
  }
  @keyframes idunToastOut {
    from {
      opacity: 1;
      transform: translateX(0) scale(1);
    }
    to {
      opacity: 0;
      transform: translateX(24px) scale(0.97);
    }
  }

  .Toastify__slide-enter--top-right,
  .Toastify__bounce-enter--top-right {
    animation: idunToastIn 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .Toastify__slide-exit--top-right,
  .Toastify__bounce-exit--top-right {
    animation: idunToastOut 0.22s cubic-bezier(0.22, 1, 0.36, 1);
  }
`;

export default ToastStyles;
