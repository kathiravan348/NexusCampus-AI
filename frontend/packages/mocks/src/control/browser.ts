import { setupWorker } from "msw/browser";
import { controlHandlers } from "./handlers";

/** Browser mock Control API for `apps/control` in mock mode (D50). */
export const controlWorker = setupWorker(...controlHandlers);
