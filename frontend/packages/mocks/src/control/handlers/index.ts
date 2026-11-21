import type { HttpHandler } from "msw";
import { commercialHandlers } from "./commercial";
import { deliveryHandlers } from "./delivery";
import { demoHandlers } from "./demo";
import { p01Handlers } from "./p01";
import { p02Handlers } from "./p02";
import { p03Handlers } from "./p03";
import { p04Handlers } from "./p04";
import { p05Handlers } from "./p05";
import { p07Handlers } from "./p07";
import { p09Handlers } from "./p09";
import { p10Handlers } from "./p10";
import { operationsHandlers } from "./operations";

/** Every mock Control API handler (one line per file). Screen tasks add their write handlers here. */
export const controlHandlers: HttpHandler[] = [
  ...demoHandlers,
  ...operationsHandlers,
  ...commercialHandlers,
  ...deliveryHandlers,
  ...p01Handlers,
  ...p02Handlers,
  ...p03Handlers,
  ...p04Handlers,
  ...p05Handlers,
  ...p07Handlers,
  ...p09Handlers,
  ...p10Handlers,
];
