import type { HttpHandler } from "msw";
import { m01Handlers } from "./m01";
import { m02Handlers } from "./m02";
import { m03Handlers } from "./m03";
import { m04Handlers } from "./m04";
import { m05Handlers } from "./m05";
import { m06Handlers } from "./m06";
import { m07Handlers } from "./m07";
import { m10Handlers } from "./m10";
import { m11Handlers } from "./m11";
import { m83Handlers, m83WriteHandlers } from "./m83";
import { m84Handlers } from "./m84";

export { API_BASE } from "./route";
export { DemoTenantEntrySchema, TenantResponseSchema } from "./m01";
export type { DemoTenantEntry, TenantResponse } from "./m01";
export { MeResponseSchema } from "./m02";
export type { MeResponse } from "./m02";
export { EffectiveThemeSchema, ThemeResponseSchema } from "./m03";
export type { EffectiveTheme, ThemeResponse } from "./m03";

/** Every Stage 1 read handler (one line per module file). Screen tasks add their write handlers here. */
export const handlers: HttpHandler[] = [
  ...m01Handlers,
  ...m02Handlers,
  ...m03Handlers,
  ...m04Handlers,
  ...m05Handlers,
  ...m06Handlers,
  ...m07Handlers,
  ...m10Handlers,
  ...m11Handlers,
  ...m83Handlers,
  ...m84Handlers,
  ...m83WriteHandlers,
];
