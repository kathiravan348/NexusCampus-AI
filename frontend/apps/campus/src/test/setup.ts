import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { resetMockDb, TENANT } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { cleanup, configure } from "@testing-library/react";
import { transferableAbortController } from "node:util";
import { LOCALE_STORAGE_KEY } from "../app/TenantRuntime";

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

// Lazy module screens plus several queries can take over 1 s on a loaded machine (full workspace run).
configure({ asyncUtilTimeout: 5000 });

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
// Riverside opens in Hindi and Apex in Tamil (D42). Tests check behaviour in English, like a user who picked
// English; tests about language call `withInstitutionLocale()` (test/renderApp) to get the default back.
beforeEach(() => {
  localStorage.setItem(
    LOCALE_STORAGE_KEY,
    JSON.stringify({ [TENANT.riverside]: "en-GB", [TENANT.apex]: "en-IN" }),
  );
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetMockDb();
  sessionStorage.clear();
  localStorage.clear();
});
afterAll(() => server.close());
