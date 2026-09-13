import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver; every responsive chart in the app observes its
// wrapper, so give tests a no-op implementation.
if (typeof globalThis.ResizeObserver === "undefined") {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
}
