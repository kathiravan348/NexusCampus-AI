import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

/** Browser mock API (DATA_MODE=mock, NEX-011/012). Needs `public/mockServiceWorker.js` in the app. */
export const worker = setupWorker(...handlers);
