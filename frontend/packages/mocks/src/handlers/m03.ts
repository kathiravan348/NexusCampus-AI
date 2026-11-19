import {
  AssetUrlSchema,
  AuditEventSchema,
  ColorTokenNameSchema,
  DensitySchema,
  FontSchema,
  HexColorSchema,
  IdSchema,
  ThemeSchema,
  TokenNameSchema,
  pageSchema,
  type ApiErrorDetail,
  type AuditEvent,
  type Theme,
} from "@nexus/contracts";
import { COLOR_TOKEN_NAMES, RADIUS_TOKEN_NAMES, checkTheme } from "@nexus/ui-core/contrast";
import { http } from "msw";
import { z } from "zod";
import {
  ApiFailure,
  entitled,
  failureResponse,
  ofTenant,
  readViewer,
  type Viewer,
} from "../context";
import { mockDb } from "../db";
import { auditHashInput } from "../fixtures/audit";
import { applyScenario, readScenario } from "../scenarios";
import { API_BASE, found, get, list, ok, param } from "./route";

const M = { module: "M03" } as const;
const MANAGE = "m03.theme.manage";
const ORDER = { platform: 0, group: 1, institution: 2, campus: 3 } as const;
const RadiusTokenNameSchema = z.string().regex(/^radius-[a-z0-9]+(-[a-z0-9]+)*$/);
const PxSchema = z.string().regex(/^\d+(\.\d+)?px$/);
const FontsFieldSchema = z.strictObject({ sans: IdSchema.nullable(), mono: IdSchema.nullable() });
const AssetsFieldSchema = z.strictObject({
  logoUrl: AssetUrlSchema.nullable(),
  faviconUrl: AssetUrlSchema.nullable(),
  loginImageUrl: AssetUrlSchema.nullable(),
});

/** The merged theme a screen applies (outer layers first; a locked token cannot be changed below). */
export const EffectiveThemeSchema = z.strictObject({
  light: z.record(ColorTokenNameSchema, HexColorSchema),
  dark: z.record(ColorTokenNameSchema, HexColorSchema),
  fonts: FontsFieldSchema,
  radius: z.record(TokenNameSchema, PxSchema),
  density: DensitySchema.nullable(),
  assets: AssetsFieldSchema,
});
export type EffectiveTheme = z.infer<typeof EffectiveThemeSchema>;

export const ThemeResponseSchema = z.strictObject({
  effective: EffectiveThemeSchema,
  layers: z.array(ThemeSchema),
  lockedTokens: z.array(TokenNameSchema),
});
export type ThemeResponse = z.infer<typeof ThemeResponseSchema>;

export const ThemeUpdateInputSchema = z.strictObject({
  light: z.record(ColorTokenNameSchema, HexColorSchema),
  dark: z.record(ColorTokenNameSchema, HexColorSchema),
  fonts: FontsFieldSchema,
  radius: z.record(RadiusTokenNameSchema, PxSchema),
  density: DensitySchema.nullable(),
  assets: AssetsFieldSchema,
});
export type ThemeUpdateInput = z.infer<typeof ThemeUpdateInputSchema>;

function mergeTokens(
  into: Record<string, string>,
  from: Readonly<Record<string, string>>,
  locked: ReadonlySet<string>,
): void {
  for (const [token, value] of Object.entries(from)) if (!locked.has(token)) into[token] = value;
}

export function mergeThemes(layers: readonly Theme[]): {
  effective: EffectiveTheme;
  lockedTokens: string[];
} {
  const effective: EffectiveTheme = {
    light: {},
    dark: {},
    fonts: { sans: null, mono: null },
    radius: {},
    density: null,
    assets: { logoUrl: null, faviconUrl: null, loginImageUrl: null },
  };
  const locked = new Set<string>();
  for (const layer of layers) {
    mergeTokens(effective.light, layer.light, locked);
    mergeTokens(effective.dark, layer.dark, locked);
    mergeTokens(effective.radius, layer.radius, locked);
    effective.fonts = {
      sans: layer.fonts.sans ?? effective.fonts.sans,
      mono: layer.fonts.mono ?? effective.fonts.mono,
    };
    effective.density = layer.density ?? effective.density;
    effective.assets = {
      logoUrl: layer.assets.logoUrl ?? effective.assets.logoUrl,
      faviconUrl: layer.assets.faviconUrl ?? effective.assets.faviconUrl,
      loginImageUrl: layer.assets.loginImageUrl ?? effective.assets.loginImageUrl,
    };
    for (const token of layer.lockedTokens) locked.add(token);
  }
  return { effective, lockedTokens: [...locked].sort() };
}

async function parseThemeInput(request: Request): Promise<ThemeUpdateInput> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiFailure("invalid_request", [{ path: "", message: "Invalid JSON body" }]);
  }
  const parsed = ThemeUpdateInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiFailure(
      "invalid_request",
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  const input = parsed.data;
  const bad: ApiErrorDetail[] = [];
  for (const mode of ["light", "dark"] as const) {
    for (const token of Object.keys(input[mode])) {
      if (!COLOR_TOKEN_NAMES.has(token)) {
        bad.push({ path: `${mode}.${token}`, message: `Unknown colour token: ${token}` });
      }
    }
  }
  for (const token of Object.keys(input.radius)) {
    if (!RADIUS_TOKEN_NAMES.has(token)) {
      bad.push({ path: `radius.${token}`, message: `Unknown radius token: ${token}` });
    }
  }
  const fontIds = new Set(mockDb.fonts.map((f) => f.id));
  if (input.fonts.sans !== null && !fontIds.has(input.fonts.sans)) {
    bad.push({ path: "fonts.sans", message: `Unknown font id: ${input.fonts.sans}` });
  }
  if (input.fonts.mono !== null && !fontIds.has(input.fonts.mono)) {
    bad.push({ path: "fonts.mono", message: `Unknown font id: ${input.fonts.mono}` });
  }
  if (bad.length > 0) throw new ApiFailure("invalid_request", bad);
  return input;
}

function assertUnlocked(input: ThemeUpdateInput, locked: ReadonlySet<string>): void {
  const conflicts: ApiErrorDetail[] = [];
  for (const section of ["light", "dark", "radius"] as const) {
    for (const token of Object.keys(input[section])) {
      if (locked.has(token)) {
        conflicts.push({
          path: `${section}.${token}`,
          message: `Token ${token} is locked by a parent theme layer`,
        });
      }
    }
  }
  if (conflicts.length > 0) throw new ApiFailure("conflict", conflicts);
}

async function appendAudit(viewer: Viewer, targetId: string): Promise<void> {
  const tenantEvents = ofTenant(mockDb.auditEvents, viewer.tenantId);
  const prevHash = tenantEvents[tenantEvents.length - 1]?.hash ?? null;
  const id = `aud-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  const occurredAt = new Date().toISOString();
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      auditHashInput({ id, occurredAt, action: "m03.theme.updated", prevHash }),
    ),
  );
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  const event: AuditEvent = AuditEventSchema.parse({
    id,
    tenantId: viewer.tenantId,
    occurredAt,
    actorKind: "user",
    actorId: viewer.userId,
    grantId: null,
    action: "m03.theme.updated",
    moduleId: "M03",
    targetType: "theme",
    targetId,
    deviceId: null,
    changes: ["light", "dark", "fonts", "radius", "density", "assets"].map((field) => ({
      field,
      sensitive: false,
    })),
    prevHash,
    hash,
  });
  mockDb.auditEvents.push(event);
}

export const m03Handlers = [
  /** `?campusId=` adds that campus's layer and its institution's; without it, all institution layers. */
  get("/theme", M, (ctx) => {
    const tenantId = ctx.viewer.tenantId;
    const campusId = param(ctx.url, "campusId");
    const campus =
      campusId === null
        ? undefined
        : found(ofTenant(mockDb.campuses, tenantId).find((c) => c.id === campusId));
    const layers = ofTenant(mockDb.themes, tenantId)
      .filter((t) => {
        if (t.scope.kind === "campus")
          return campus !== undefined && t.scope.targetId === campus.id;
        if (t.scope.kind === "institution" && campus) {
          return t.scope.targetId === campus.institutionId;
        }
        return true;
      })
      .sort((a, b) => ORDER[a.scope.kind] - ORDER[b.scope.kind]);
    return ok(ThemeResponseSchema, { ...mergeThemes(layers), layers });
  }),

  http.put(`*${API_BASE}/theme`, async ({ request }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const viewer = readViewer(request);
      if (!entitled(viewer.tenantId, "M03")) throw new ApiFailure("module_disabled");
      if (!viewer.permissions.has(MANAGE)) throw new ApiFailure("forbidden");

      const institutionId = param(new URL(request.url), "institutionId");
      const ownInstitutions = ofTenant(mockDb.institutions, viewer.tenantId);
      const institution = found(
        institutionId === null
          ? ownInstitutions[0]
          : ownInstitutions.find((i) => i.id === institutionId),
      );
      const tenantLayers = ofTenant(mockDb.themes, viewer.tenantId).filter(
        (t) => t.scope.kind !== "campus",
      );
      const outerLayers = tenantLayers
        .filter((t) => t.scope.kind === "platform" || t.scope.kind === "group")
        .sort((a, b) => ORDER[a.scope.kind] - ORDER[b.scope.kind]);
      const existing = found(
        tenantLayers.find(
          (t) => t.scope.kind === "institution" && t.scope.targetId === institution.id,
        ),
      );

      const input = await parseThemeInput(request);
      assertUnlocked(input, new Set(outerLayers.flatMap((l) => l.lockedTokens)));

      const updated: Theme = ThemeSchema.parse({
        ...existing,
        ...input,
        version: existing.version + 1,
        updatedBy: viewer.userId,
        updatedAt: new Date().toISOString(),
      });
      const nextLayers = [...outerLayers, updated];
      const merged = mergeThemes(nextLayers);
      const failures = checkTheme({ light: merged.effective.light, dark: merged.effective.dark });
      if (failures.length > 0) {
        throw new ApiFailure(
          "invalid_request",
          failures.map((f) => ({
            path: `${f.theme}.${f.fg}`,
            message: `${f.fg} on ${f.bg} is ${f.ratio.toFixed(2)}:1 (needs ${f.minRatio}:1)`,
          })),
        );
      }

      const themes = mockDb.themes as Theme[];
      themes[themes.findIndex((t) => t.id === existing.id)] = updated;
      await appendAudit(viewer, updated.id);
      return ok(ThemeResponseSchema, { ...merged, layers: nextLayers });
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  }),

  get("/fonts", M, (ctx) => list(ctx, mockDb.fonts, pageSchema(FontSchema))),
];
