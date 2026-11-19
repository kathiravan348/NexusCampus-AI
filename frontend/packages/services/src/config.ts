/** Where data comes from: the MSW mock API (`mock`) or the real backend (`real`). One code path for both. */
export type DataMode = "mock" | "real";

/** Every endpoint lives under this path, in both modes. */
export const API_BASE = "/api/v1";

/** `mock` by default in dev, `real` otherwise; any other value is a build mistake, so it throws. */
export function resolveDataMode(value: string | undefined, dev: boolean): DataMode {
  if (value === undefined || value === "") return dev ? "mock" : "real";
  if (value === "mock" || value === "real") return value;
  throw new Error(`Invalid VITE_DATA_MODE "${value}": use "mock" or "real"`);
}

interface ViteEnv {
  readonly VITE_DATA_MODE?: string;
  readonly DEV?: boolean;
}

const env: ViteEnv = (import.meta as ImportMeta & { readonly env?: ViteEnv }).env ?? {};

/** The build's data mode, read once from `VITE_DATA_MODE`. */
export const DATA_MODE: DataMode = resolveDataMode(env.VITE_DATA_MODE, env.DEV === true);
