import { DeviceSyncSchema, SyncConflictSchema, pageSchema } from "@nexus/contracts";
import { ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { get, list } from "./route";

const M = { module: "M10", permission: "m10.device.read" } as const;

/** Device managers (`m10.device.wipe`) see every device of the tenant; others only their own. */
function visibleDevices(viewer: Viewer) {
  const devices = ofTenant(mockDb.devices, viewer.tenantId);
  return viewer.permissions.has("m10.device.wipe")
    ? devices
    : devices.filter((d) => d.userId === viewer.userId);
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
];
