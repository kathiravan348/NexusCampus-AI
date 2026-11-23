import { ApiErrorSchema, type ApiError } from "@nexus/contracts";
import { API_BASE, type DataMode } from "./config";

/** Any schema with `parse` — a Zod schema from `@nexus/contracts` or a response schema built from them. */
export interface Parser<T> {
  parse(value: unknown): T;
}

export type ApiErrorBody = ApiError["error"];

/** Every failed call: `status` 0 + `offline` = the network was unreachable; else the HTTP status. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly error: ApiErrorBody;
  readonly offline: boolean;

  constructor(status: number, error: ApiErrorBody, offline = false) {
    super(`${error.code} (${status}): ${error.message}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.error = error;
    this.offline = offline;
  }
}

export interface ClientIdentity {
  readonly tenantId: string;
  readonly userId: string;
}

export interface ApiClientOptions {
  readonly mode: DataMode;
  readonly identity: () => ClientIdentity | null;
  /** Mock mode only: the `X-Nexus-Scenario` to send (empty / error / slow / offline). */
  readonly scenario?: () => string | null;
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  /** Real mode: the session cookie is gone or expired (`401`) — the app shows sign-in again. */
  readonly onUnauthorized?: () => void;
  /** Real and mock mode: a change was refused with `423 tenant_frozen` (D61, NEX-140). */
  readonly onTenantFrozen?: () => void;
  /** Real mode: this browser's registered device id, sent as `X-Device-Id` (own-device revoke check). */
  readonly deviceId?: () => string | null;
  /** Mock mode only: extra demo headers, e.g. Nexus Control's `X-Nexus-Staff` (NEX-071). */
  readonly mockHeaders?: () => Readonly<Record<string, string>>;
}

export type QueryParams = Readonly<Record<string, string | number | boolean | null | undefined>>;

export interface RequestOptions {
  readonly signal?: AbortSignal;
  readonly headers?: Readonly<Record<string, string>>;
}

export type WriteMethod = "POST" | "PUT" | "PATCH" | "DELETE";

export const HEADER = {
  tenant: "X-Nexus-Tenant",
  user: "X-Nexus-User",
  scenario: "X-Nexus-Scenario",
  idempotencyKey: "Idempotency-Key",
  csrf: "X-CSRF-Token",
  device: "X-Device-Id",
} as const;

/** The backend's double-submit CSRF cookie (readable by the page, D44). */
export const CSRF_COOKIE = "nexus_csrf";

/** The CSRF token to echo on unsafe requests in real mode; `null` when there is no cookie. */
export function readCsrfToken(cookies?: string): string | null {
  const source =
    cookies ?? (globalThis as { document?: { cookie?: string } }).document?.cookie ?? "";
  for (const part of source.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === CSRF_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function origin(): string {
  const location = (globalThis as { location?: { origin?: string } }).location;
  return location?.origin && location.origin !== "null" ? location.origin : "http://localhost";
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  return text === "" ? undefined : (JSON.parse(text) as unknown);
}

/** The one HTTP client: adds tenant/user/scenario headers and validates every body (D15). */
export class ApiClient {
  private readonly options: ApiClientOptions;

  constructor(options: ApiClientOptions) {
    this.options = options;
  }

  get<T>(path: string, schema: Parser<T>, query?: QueryParams, init?: RequestOptions): Promise<T> {
    return this.request("GET", path, undefined, schema, query, init);
  }

  send<T>(
    method: WriteMethod,
    path: string,
    body: unknown,
    schema: Parser<T>,
    init?: RequestOptions,
  ): Promise<T> {
    return this.request(method, path, body, schema, undefined, init);
  }

  private url(path: string, query?: QueryParams): string {
    const url = new URL(`${this.options.baseUrl ?? API_BASE}${path}`, origin());
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private headers(
    method: string,
    hasBody: boolean,
    extra?: Readonly<Record<string, string>>,
  ): Headers {
    const headers = new Headers({ Accept: "application/json", ...extra });
    if (hasBody) headers.set("Content-Type", "application/json");
    const identity = this.options.identity();
    if (this.options.mode === "real") {
      // The tenant comes from the signed session cookie, never a header; unsafe calls echo the CSRF cookie.
      const csrf = method === "GET" ? null : readCsrfToken();
      if (csrf) headers.set(HEADER.csrf, csrf);
      const device = this.options.deviceId?.() ?? null;
      if (device) headers.set(HEADER.device, device);
    } else {
      if (identity) headers.set(HEADER.tenant, identity.tenantId);
      if (identity) headers.set(HEADER.user, identity.userId);
      const scenario = this.options.scenario?.() ?? null;
      if (scenario) headers.set(HEADER.scenario, scenario);
      for (const [name, value] of Object.entries(this.options.mockHeaders?.() ?? {})) {
        headers.set(name, value);
      }
    }
    return headers;
  }

  private async request<T>(
    method: "GET" | WriteMethod,
    path: string,
    body: unknown,
    schema: Parser<T>,
    query?: QueryParams,
    init?: RequestOptions,
  ): Promise<T> {
    const doFetch = this.options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
    let response: Response;
    try {
      response = await doFetch(this.url(path, query), {
        method,
        headers: this.headers(method, body !== undefined, init?.headers),
        credentials: this.options.mode === "real" ? "include" : "same-origin",
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        ...(init?.signal ? { signal: init.signal } : {}),
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
      throw new ApiRequestError(0, { code: "internal", message: "Network unreachable" }, true);
    }

    let json: unknown;
    try {
      json = await readJson(response);
    } catch {
      json = undefined;
    }

    if (!response.ok) {
      if (response.status === 401 && this.options.mode === "real") this.options.onUnauthorized?.();
      const parsed = ApiErrorSchema.safeParse(json);
      if (response.status === 423 && parsed.success && parsed.data.error.code === "tenant_frozen") {
        this.options.onTenantFrozen?.();
      }
      throw new ApiRequestError(
        response.status,
        parsed.success
          ? parsed.data.error
          : { code: "internal", message: `HTTP ${response.status}` },
      );
    }

    try {
      return schema.parse(json);
    } catch {
      // The server broke its contract: never hand unvalidated data to a screen.
      throw new ApiRequestError(response.status, {
        code: "internal",
        message: "Response does not match its contract",
      });
    }
  }
}
