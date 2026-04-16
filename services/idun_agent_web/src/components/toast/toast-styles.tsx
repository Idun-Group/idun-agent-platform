import { createGlobalStyle } from 'styled-components';

/**
 * Custom toast notification styles for the Idun Platform.
 *
 * Overrides react-toastify defaults to produce dark, pill-shaped
 * notifications with Lucide icons, generous inner padding, a left
 * accent bar, and smooth slide animations.
 */
const ToastStyles = createGlobalStyle`
  /* ── Container ── */
  .Toastify__toast-container {
    padding: 0;
    width: 400px;
  }

  .Toastify__toast-container--top-right {
    top: 16px;
    right: 16px;
  }

  /* ── Base toast card ── */
  .Toastify__toast {
    font-family: 'IBM Plex Sans', 'Inter', 'SF Pro Display', -apple-system, system-ui, sans-serif;
    background: #141a26;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 0;
    margin-bottom: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    overflow: hidden;
    min-height: unset;
    cursor: default;
    position: relative;
  }

  /* ── Left accent stripe ── */
  .Toastify__toast::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: rgba(12, 92, 171, 0.5);
  }

  /* ── Hide default react-toastify icon (we use custom ones) ── */
  .Toastify__toast-icon {
    display: none !important;
  }

  /* ── Toast body ── */
  .Toastify__toast-body {
    padding: 14px 16px 14px 18px;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0;
    font-size: 13px;
    font-weight: 450;
    line-height: 1.5;
    letter-spacing: -0.006em;
    color: #e1e4e8;
  }

  .Toastify__toast-body > div:last-child {
    flex: 1;
  }

  /* ── Close button ── */
  .Toastify__close-button {
    color: #8899a6;
    opacity: 1;
    padding: 2px;
    margin: 12px 12px 0 0;
    align-self: flex-start;
    transition: color 0.15s ease, transform 0.15s ease;
    flex-shrink: 0;
  }

  .Toastify__close-button:hover {
    color: #e1e4e8;
    transform: scale(1.15);
  }

  .Toastify__close-button > svg {
    width: 18px;
    height: 18px;
  }

  /* ── Progress bar ── */
  .Toastify__progress-bar {
    height: 2px;
    border-radius: 0 0 10px 10px;
    background: rgba(12, 92, 171, 0.3);
  }

  .Toastify__progress-bar--bg {
    background: rgba(255, 255, 255, 0.02);
    height: 2px;
  }
    .Toastify__close-button {
    top: -3px !important;
    }

  /* ═══════ SUCCESS ═══════ */
  .Toastify__toast--success::before { background: #34d399; }
  .Toastify__toast--success .Toastify__progress-bar { background: #34d399; }

  /* ═══════ ERROR ═══════ */
  .Toastify__toast--error::before { background: #f87171; }
  .Toastify__toast--error .Toastify__progress-bar { background: #f87171; }

  /* ═══════ WARNING ═══════ */
  .Toastify__toast--warning::before { background: #f59e0b; }
  .Toastify__toast--warning .Toastify__progress-bar { background: #f59e0b; }

  /* ═══════ INFO ═══════ */
  .Toastify__toast--info::before { background: #0C5CAB; }
  .Toastify__toast--info .Toastify__progress-bar { background: #0C5CAB; }

  /* ═══════ ANIMATIONS ═══════ */
  @keyframes idunSlideIn {
    0%   { opacity: 0; transform: translateX(28px) scale(0.97); }
    100% { opacity: 1; transform: translateX(0) scale(1); }
  }
  @keyframes idunSlideOut {
    0%   { opacity: 1; transform: translateX(0) scale(1); }
    100% { opacity: 0; transform: translateX(20px) scale(0.98); }
  }
  .Toastify__slide-enter--top-right  { animation: idunSlideIn  0.3s cubic-bezier(0.22,1,0.36,1); }
  .Toastify__slide-exit--top-right   { animation: idunSlideOut 0.2s cubic-bezier(0.22,1,0.36,1); }
  .Toastify__bounce-enter--top-right { animation: idunSlideIn  0.3s cubic-bezier(0.22,1,0.36,1); }
  .Toastify__bounce-exit--top-right  { animation: idunSlideOut 0.2s cubic-bezier(0.22,1,0.36,1); }

  /* ═══════ HOVER ═══════ */
  .Toastify__toast:hover { border-color: rgba(255, 255, 255, 0.12); }
`;

export default ToastStyles;
