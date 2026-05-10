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

// jsdom does not enable Web Storage by default in this Vitest setup
// ("--localstorage-file was not provided" warning). Ship a tiny in-
// memory shim so components that read/write `localStorage` (e.g. the
// SqliteBanner dismiss state) work in unit tests.
if (typeof window !== "undefined" && typeof window.localStorage === "undefined") {
  const store = new Map<string, string>();
  const shim: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(window, "localStorage", {
    value: shim,
    writable: true,
    configurable: true,
  });
}
