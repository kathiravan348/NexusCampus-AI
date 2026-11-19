import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { afterAll, afterEach, beforeAll } from "vitest";
import { resetMockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { cleanup } from "@testing-library/react";
import { transferableAbortController } from "node:util";

// jsdom replaces AbortController/AbortSignal, but Node's fetch (used by MSW in tests) only accepts
// its own signals. Put Node's classes back; browsers have one implementation, so the app is unaffected.
const nodeController = transferableAbortController();
globalThis.AbortController = nodeController.constructor as typeof AbortController;
globalThis.AbortSignal = nodeController.signal.constructor as typeof AbortSignal;

// jsdom omits ResizeObserver, which Radix primitives use for form control sizing.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetMockDb();
  sessionStorage.clear();
  localStorage.clear();
});
afterAll(() => server.close());
