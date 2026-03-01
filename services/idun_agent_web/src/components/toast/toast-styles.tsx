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
    font-family: 'Inter', 'SF Pro Display', -apple-system, system-ui, sans-serif;
    background: #0d0c1e;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    padding: 0;
    margin-bottom: 12px;
    box-shadow:
      0 12px 40px rgba(0, 0, 0, 0.5),
      0 4px 12px rgba(0, 0, 0, 0.3);
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
    background: rgba(140, 82, 255, 0.5);
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
    color: rgba(226, 228, 240, 0.92);
  }

  .Toastify__toast-body > div:last-child {
    flex: 1;
  }

  /* ── Close button ── */
  .Toastify__close-button {
    color: rgba(226, 228, 240, 0.2);
    opacity: 1;
    padding: 2px;
    margin: 12px 12px 0 0;
    align-self: flex-start;
    transition: color 0.15s ease, transform 0.15s ease;
    flex-shrink: 0;
  }

  .Toastify__close-button:hover {
    color: rgba(226, 228, 240, 0.6);
    transform: scale(1.15);
  }

  .Toastify__close-button > svg {
    width: 18px;
    height: 18px;
  }

  /* ── Progress bar ── */
  .Toastify__progress-bar {
    height: 2px;
    border-radius: 0 0 12px 12px;
    background: rgba(140, 82, 255, 0.3);
  }

  .Toastify__progress-bar--bg {
    background: rgba(255, 255, 255, 0.03);
    height: 2px;
  }
    .Toastify__close-button {
    top: -3px !important;
    }

  /* ═══════ SUCCESS ═══════ */
  .Toastify__toast--success {
    background: linear-gradient(135deg, #0d0c1e 0%, #091a11 100%);
    border-color: rgba(52, 211, 153, 0.1);
  }
  .Toastify__toast--success::before { background: #34d399; }
  .Toastify__toast--success .Toastify__progress-bar {
    background: linear-gradient(90deg, rgba(52, 211, 153, 0.5) 0%, rgba(52, 211, 153, 0.08) 100%);
  }
  .Toastify__toast--success .Toastify__progress-bar--bg { background: rgba(52, 211, 153, 0.04); }

  /* ═══════ ERROR ═══════ */
  .Toastify__toast--error {
    background: linear-gradient(135deg, #0d0c1e 0%, #1c0b0e 100%);
    border-color: rgba(248, 113, 113, 0.12);
  }
  .Toastify__toast--error::before { background: #f87171; }
  .Toastify__toast--error .Toastify__progress-bar {
    background: linear-gradient(90deg, rgba(248, 113, 113, 0.5) 0%, rgba(248, 113, 113, 0.08) 100%);
  }
  .Toastify__toast--error .Toastify__progress-bar--bg { background: rgba(248, 113, 113, 0.04); }

  /* ═══════ WARNING ═══════ */
  .Toastify__toast--warning {
    background: linear-gradient(135deg, #0d0c1e 0%, #1a1609 100%);
    border-color: rgba(251, 191, 36, 0.1);
  }
  .Toastify__toast--warning::before { background: #fbbf24; }
  .Toastify__toast--warning .Toastify__progress-bar {
    background: linear-gradient(90deg, rgba(251, 191, 36, 0.5) 0%, rgba(251, 191, 36, 0.08) 100%);
  }
  .Toastify__toast--warning .Toastify__progress-bar--bg { background: rgba(251, 191, 36, 0.04); }

  /* ═══════ INFO ═══════ */
  .Toastify__toast--info {
    background: linear-gradient(135deg, #0d0c1e 0%, #100d1e 100%);
    border-color: rgba(140, 82, 255, 0.12);
  }
  .Toastify__toast--info::before { background: #8c52ff; }
  .Toastify__toast--info .Toastify__progress-bar {
    background: linear-gradient(90deg, rgba(140, 82, 255, 0.5) 0%, rgba(140, 82, 255, 0.08) 100%);
  }
  .Toastify__toast--info .Toastify__progress-bar--bg { background: rgba(140, 82, 255, 0.04); }

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
  .Toastify__toast:hover                { border-color: rgba(255,255,255,0.1); }
  .Toastify__toast--success:hover       { border-color: rgba(52,211,153,0.18); }
  .Toastify__toast--error:hover         { border-color: rgba(248,113,113,0.2); }
  .Toastify__toast--warning:hover       { border-color: rgba(251,191,36,0.18); }
  .Toastify__toast--info:hover          { border-color: rgba(140,82,255,0.2); }
`;

export default ToastStyles;
