import type { HttpHandler } from "msw";
import { m01Handlers } from "./m01";
import { m02Handlers } from "./m02";
import { m03Handlers } from "./m03";
import { m04Handlers } from "./m04";
import { m05Handlers } from "./m05";
import { m06Handlers } from "./m06";
import { m07Handlers } from "./m07";
import { m08Handlers } from "./m08";
import { m09Handlers } from "./m09";
import { m10Handlers } from "./m10";
import { m11Handlers } from "./m11";
import { m12Handlers } from "./m12";
import { m13Handlers } from "./m13";
import { m14Handlers } from "./m14";
import { m15Handlers } from "./m15";
import { m16Handlers } from "./m16";
import { m17Handlers } from "./m17";
import { m18Handlers } from "./m18";
import { m19Handlers } from "./m19";
import { m20Handlers } from "./m20";
import { m21Handlers } from "./m21";
import { m22Handlers } from "./m22";
import { m23Handlers } from "./m23";
import { m83Handlers, m83WriteHandlers } from "./m83";
import { m84Handlers } from "./m84";

export { API_BASE } from "./route";
export { DemoTenantEntrySchema, TenantResponseSchema } from "./m01";
export type { DemoTenantEntry, TenantResponse } from "./m01";
export { MeResponseSchema } from "./m02";
export type { MeResponse } from "./m02";
export { EffectiveThemeSchema, ThemeResponseSchema } from "./m03";
export type { EffectiveTheme, ThemeResponse } from "./m03";

/** Mock API handlers, grouped by module. */
export const handlers: HttpHandler[] = [
  ...m01Handlers,
  ...m02Handlers,
  ...m03Handlers,
  ...m04Handlers,
  ...m05Handlers,
  ...m06Handlers,
  ...m07Handlers,
  ...m08Handlers,
  ...m09Handlers,
  ...m10Handlers,
  ...m11Handlers,
  ...m12Handlers,
  ...m13Handlers,
  ...m14Handlers,
  ...m15Handlers,
  ...m16Handlers,
  ...m17Handlers,
  ...m18Handlers,
  ...m19Handlers,
  ...m20Handlers,
  ...m21Handlers,
  ...m22Handlers,
  ...m23Handlers,
  ...m83Handlers,
  ...m84Handlers,
  ...m83WriteHandlers,
];
