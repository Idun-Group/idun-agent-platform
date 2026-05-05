import "@testing-library/jest-dom";

// ReactFlow requires ResizeObserver (not available in jsdom).
// Provide a no-op stub so canvas components can mount in tests.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
