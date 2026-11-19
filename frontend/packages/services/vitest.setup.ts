import "fake-indexeddb/auto";
import { transferableAbortController } from "node:util";

// jsdom replaces AbortController/AbortSignal, but Node's fetch (used by MSW in tests) only accepts
// its own signals. Put Node's classes back; browsers have one implementation, so the app is unaffected.
const nodeController = transferableAbortController();
globalThis.AbortController = nodeController.constructor as typeof AbortController;
globalThis.AbortSignal = nodeController.signal.constructor as typeof AbortSignal;
