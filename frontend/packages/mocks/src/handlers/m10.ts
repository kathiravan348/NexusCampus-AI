import {
  ConflictResolutionSchema,
  DeviceSyncSchema,
  SyncConflictSchema,
  pageSchema,
  type DeviceSync,
  type SyncConflict,
} from "@nexus/contracts";
import { z } from "zod";
import { ApiFailure, ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { found, get, list, ok } from "./route";
import { appendAudit, readBody, writeRoute } from "./write";

const M = { module: "M10", permission: "m10.device.read" } as const;
/** Device managers: see every device, revoke and resolve server-side conflicts (catalogue NEX-010). */
const WIPE = "m10.device.wipe";

export const ResolveConflictInputSchema = z.strictObject({ resolution: ConflictResolutionSchema });

/** Device managers (`m10.device.wipe`) see every device of the tenant; others only their own. */
function visibleDevices(viewer: Viewer) {
  const devices = ofTenant(mockDb.devices, viewer.tenantId);
  return viewer.permissions.has(WIPE) ? devices : devices.filter((d) => d.userId === viewer.userId);
}

export const m10Handlers = [
  get("/devices", M, (ctx) => list(ctx, visibleDevices(ctx.viewer), pageSchema(DeviceSyncSchema))),

  get("/sync-conflicts", M, (ctx) => {
    const deviceIds = new Set(visibleDevices(ctx.viewer).map((d) => d.id));
    const conflicts = ofTenant(mockDb.syncConflicts, ctx.viewer.tenantId).filter((c) =>
      deviceIds.has(c.deviceId),
    );
    return list(ctx, conflicts, pageSchema(SyncConflictSchema));
  }),

  /**
   * Remote wipe request (O-3): `active` → `revoke_pending`; the device wipes itself on its next contact
   * (build step). Its pending writes become lost writes. Already pending or revoked → 409.
   */
  writeRoute("post", "/devices/:id/revoke", { module: "M10", permission: WIPE }, async (ctx) => {
    const rows = mockDb.devices as DeviceSync[];
    const device = found(
      ofTenant(rows, ctx.viewer.tenantId).find((d) => d.id === ctx.params["id"]),
    );
    if (device.status !== "active") {
      throw new ApiFailure("conflict", [{ path: "status", message: `Device is ${device.status}` }]);
    }
    const updated = DeviceSyncSchema.parse({
      ...device,
      status: "revoke_pending",
      lostWriteCount: device.lostWriteCount + device.pendingCount,
      pendingCount: 0,
    });
    rows[rows.indexOf(device)] = updated;
    await appendAudit(ctx.viewer, {
      module: "M10",
      action: "m10.device.revokeRequested",
      targetType: "device",
      targetId: updated.id,
      fields: ["status"],
    });
    return ok(DeviceSyncSchema, updated);
  }),

  /** Resolve a server-side conflict; the device's open-conflict count drops by one. Resolved → 409. */
  writeRoute(
    "post",
    "/sync-conflicts/:id/resolve",
    { module: "M10", permission: WIPE },
    async (ctx) => {
      const { resolution } = await readBody(ctx.request, ResolveConflictInputSchema);
      const rows = mockDb.syncConflicts as SyncConflict[];
      const conflict = found(
        ofTenant(rows, ctx.viewer.tenantId).find((c) => c.id === ctx.params["id"]),
      );
      if (conflict.status === "resolved") {
        throw new ApiFailure("conflict", [{ path: "status", message: "Already resolved" }]);
      }
      const updated = SyncConflictSchema.parse({
        ...conflict,
        status: "resolved",
        resolution,
        resolvedAt: new Date().toISOString(),
      });
      rows[rows.indexOf(conflict)] = updated;
      const devices = mockDb.devices as DeviceSync[];
      const device = devices.find((d) => d.id === conflict.deviceId);
      if (device) {
        devices[devices.indexOf(device)] = DeviceSyncSchema.parse({
          ...device,
          conflictCount: Math.max(0, device.conflictCount - 1),
        });
      }
      await appendAudit(ctx.viewer, {
        module: "M10",
        action: "m10.conflict.resolved",
        targetType: "syncConflict",
        targetId: updated.id,
        fields: ["status", "resolution"],
      });
      return ok(SyncConflictSchema, updated);
    },
  ),
];
