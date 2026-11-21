import type { HttpHandler } from "msw";
import { commercialHandlers } from "./commercial";
import { deliveryHandlers } from "./delivery";
import { operationsHandlers } from "./operations";

/** Every mock Control API handler (one line per file). Screen tasks add their write handlers here. */
export const controlHandlers: HttpHandler[] = [
  ...operationsHandlers,
  ...commercialHandlers,
  ...deliveryHandlers,
];
