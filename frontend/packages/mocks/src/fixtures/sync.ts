import type { DevicePlatform, DeviceStatus, DeviceSync, SyncConflict } from "@nexus/contracts";
import { TENANT, USER } from "./ids";

/** Device ids; the ones that also appear in `SESSIONS` keep the same id and user. */
export const DEVICE = {
  lsOfficePc: "dev-ls-office-pc",
  lsArjunTablet: "dev-ls-arjun-tablet",
  rvHelenLaptop: "dev-rv-helen-laptop",
  rvNorthTablet: "dev-rv-north-tablet",
  rvTomPhone: "dev-rv-tom-phone",
  nbRobertMac: "dev-nb-robert-mac",
  nbElenaPhone: "dev-nb-elena-phone",
  axKhalidPhone: "dev-ax-khalid-phone",
  axFatimaLaptop: "dev-ax-fatima-laptop",
  hmWeiLingPc: "dev-hm-weiling-pc",
  hmDanielTablet: "dev-hm-daniel-tablet",
} as const;

interface DeviceState {
  readonly lastSyncAt?: string | null;
  readonly pendingCount?: number;
  readonly conflictCount?: number;
  readonly lostWriteCount?: number;
  readonly status?: DeviceStatus;
  readonly revokedAt?: string | null;
}

const device = (
  tenantId: string,
  id: string,
  userId: string,
  label: string,
  platform: DevicePlatform,
  s: DeviceState = {},
): DeviceSync => ({
  id,
  tenantId,
  userId,
  label,
  platform,
  lastSyncAt: s.lastSyncAt === undefined ? "2026-09-15T07:50:00Z" : s.lastSyncAt,
  pendingCount: s.pendingCount ?? 0,
  conflictCount: s.conflictCount ?? 0,
  lostWriteCount: s.lostWriteCount ?? 0,
  status: s.status ?? "active",
  revokedAt: s.revokedAt ?? null,
});

const LS = TENANT.littleSteps;
const RV = TENANT.riverside;
const NB = TENANT.northbridge;
const AX = TENANT.apex;
const HM = TENANT.harmony;

/** M10 device registry. `conflictCount` = open conflicts in `SYNC_CONFLICTS` (checked by tests). */
export const DEVICE_SYNCS = [
  device(LS, DEVICE.lsOfficePc, USER.lsPriya, "Office PC", "web"),
  device(LS, DEVICE.lsArjunTablet, USER.lsArjun, "Classroom tablet", "android", {
    lastSyncAt: "2026-09-14T10:05:00Z",
    pendingCount: 3,
    conflictCount: 1,
  }),
  device(RV, DEVICE.rvHelenLaptop, USER.rvHelen, "Helen's laptop", "web"),
  device(RV, DEVICE.rvNorthTablet, USER.rvTom, "North campus tablet", "android", {
    lastSyncAt: "2026-09-15T06:40:00Z",
    pendingCount: 5,
    conflictCount: 2,
  }),
  device(RV, DEVICE.rvTomPhone, USER.rvTom, "Tom's phone", "ios", {
    lastSyncAt: "2026-09-11T16:00:00Z",
    pendingCount: 2,
    status: "revoke_pending",
  }),
  device(NB, DEVICE.nbRobertMac, USER.nbRobert, "Robert's Mac", "web"),
  device(NB, DEVICE.nbElenaPhone, USER.nbElena, "Elena's phone (lost)", "ios", {
    lastSyncAt: "2026-09-06T20:15:00Z",
    lostWriteCount: 2,
    status: "revoked",
    revokedAt: "2026-09-07T09:00:00Z",
  }),
  device(AX, DEVICE.axKhalidPhone, USER.axKhalid, "هاتف خالد", "android"),
  device(AX, DEVICE.axFatimaLaptop, USER.axFatima, "حاسوب فاطمة", "web", { conflictCount: 1 }),
  device(HM, DEVICE.hmWeiLingPc, USER.hmWeiLing, "Front desk PC", "web"),
  device(HM, DEVICE.hmDanielTablet, USER.hmDaniel, "Studio iPad", "ios", {
    lastSyncAt: null,
  }),
] satisfies readonly DeviceSync[];

const conflict = (
  id: string,
  tenantId: string,
  deviceId: string,
  summaryKey: string,
  createdAt: string,
  resolution: SyncConflict["resolution"] = null,
  resolvedAt: string | null = null,
): SyncConflict => ({
  id,
  tenantId,
  deviceId,
  moduleId: "M02",
  operation: "person.update",
  mergeRule: "lww-audited",
  summaryKey,
  clientVersion: 3,
  serverVersion: 4,
  status: resolution === null ? "open" : "resolved",
  resolution,
  createdAt,
  resolvedAt,
});

/** Open conflicts plus a few resolved ones; carries no payload, only a message key. */
export const SYNC_CONFLICTS = [
  conflict(
    "scf-ls-01",
    LS,
    DEVICE.lsArjunTablet,
    "m10.conflict.phoneChanged",
    "2026-09-14T10:05:00Z",
  ),
  conflict(
    "scf-ls-02",
    LS,
    DEVICE.lsArjunTablet,
    "m10.conflict.nameChanged",
    "2026-09-03T09:10:00Z",
    "keep_server",
    "2026-09-03T11:00:00Z",
  ),
  conflict(
    "scf-rv-01",
    RV,
    DEVICE.rvNorthTablet,
    "m10.conflict.phoneChanged",
    "2026-09-15T06:40:00Z",
  ),
  conflict(
    "scf-rv-02",
    RV,
    DEVICE.rvNorthTablet,
    "m10.conflict.nameChanged",
    "2026-09-15T06:41:00Z",
  ),
  conflict(
    "scf-rv-03",
    RV,
    DEVICE.rvHelenLaptop,
    "m10.conflict.emailChanged",
    "2026-09-09T13:00:00Z",
    "merged",
    "2026-09-09T13:30:00Z",
  ),
  conflict(
    "scf-ax-01",
    AX,
    DEVICE.axFatimaLaptop,
    "m10.conflict.emailChanged",
    "2026-09-14T08:20:00Z",
  ),
] satisfies readonly SyncConflict[];
