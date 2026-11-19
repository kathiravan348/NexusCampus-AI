import type { ConflictResolution, DevicePlatform, DeviceStatus } from "@nexus/contracts";
import { formatDateTime, isPseudoLocale, SOURCE_LOCALE, type MessageKey } from "@nexus/i18n";
import type { OutboxStatus, SyncPriority } from "@nexus/offline";

export const OUTBOX_STATUS_KEY: Readonly<Record<OutboxStatus, MessageKey>> = {
  pending: "m10.outbox.status.pending",
  syncing: "m10.outbox.status.syncing",
  conflict: "m10.outbox.status.conflict",
  failed: "m10.outbox.status.failed",
};

export const OUTBOX_TONE: Readonly<Record<OutboxStatus, "info" | "brand" | "warning" | "danger">> =
  {
    pending: "info",
    syncing: "brand",
    conflict: "warning",
    failed: "danger",
  };

export const PRIORITY_KEY: Readonly<Record<SyncPriority, MessageKey>> = {
  critical: "m10.priority.critical",
  high: "m10.priority.high",
  normal: "m10.priority.normal",
  low: "m10.priority.low",
};

export const PLATFORM_KEY: Readonly<Record<DevicePlatform, MessageKey>> = {
  web: "m10.platform.web",
  android: "m10.platform.android",
  ios: "m10.platform.ios",
  edge: "m10.platform.edge",
};

export const DEVICE_STATUS_KEY: Readonly<Record<DeviceStatus, MessageKey>> = {
  active: "m10.device.status.active",
  revoke_pending: "m10.device.status.revokePending",
  revoked: "m10.device.status.revoked",
};

export const DEVICE_TONE: Readonly<Record<DeviceStatus, "success" | "warning" | "neutral">> = {
  active: "success",
  revoke_pending: "warning",
  revoked: "neutral",
};

export const RESOLUTION_KEY: Readonly<Record<ConflictResolution, MessageKey>> = {
  keep_server: "m10.conflicts.keepServer",
  keep_client: "m10.conflicts.keepClient",
  merged: "m10.conflicts.merged",
};

export function when(value: string, locale: string, timeZone: string): string {
  return formatDateTime(value, {
    locale: isPseudoLocale(locale) ? SOURCE_LOCALE : locale,
    timeZone,
  });
}
