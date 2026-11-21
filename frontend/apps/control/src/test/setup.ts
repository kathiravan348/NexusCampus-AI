import "@testing-library/jest-dom/vitest";
import { controlHandlers, resetControlDb } from "@nexus/mocks/control";
import { cleanup, configure } from "@testing-library/react";
import { setupServer } from "msw/node";
import { transferableAbortController } from "node:util";
import { afterAll, afterEach, beforeAll } from "vitest";

// jsdom replaces AbortController; Node fetch (MSW in tests) only accepts the Node one (same fix as campus).
const nodeController = transferableAbortController();
globalThis.AbortController = nodeController.constructor as typeof AbortController;
globalThis.AbortSignal = nodeController.signal.constructor as typeof AbortSignal;

// jsdom omits ResizeObserver, which Radix primitives (checkbox, switch) use for sizing.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

configure({ asyncUtilTimeout: 5000 });

export const server = setupServer(...controlHandlers);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetControlDb();
  sessionStorage.clear();
  localStorage.clear();
});
afterAll(() => server.close());
