import type {
  BackupJob,
  DiagnosticBundle,
  Entitlement,
  InstallStatus,
  UpdateOffer,
} from "@nexus/contracts";
import { TENANT } from "./ids";

/**
 * The install agent (M84) runs inside an install on the institution's own servers, not in our SaaS backend, so its
 * entitlement and data live in the mock database only (not in the backend seed export). Apex Coaching is the demo
 * install: `hybrid` in Nexus Control, its exam centres run local nodes (NEX-090).
 */
export const INSTALL_ENTITLEMENTS: readonly Entitlement[] = [
  { tenantId: TENANT.apex, moduleId: "M84", enabled: true, source: "core", expiresAt: null },
];

/** One install per demo tenant that has one; the contracts carry no tenant id, the mock keys them by tenant. */
export interface DemoInstall {
  readonly status: InstallStatus;
  readonly update: UpdateOffer | null;
  readonly backups: readonly BackupJob[];
  readonly diagnostics: readonly DiagnosticBundle[];
}

export const INSTALLS: Readonly<Record<string, DemoInstall>> = {
  [TENANT.apex]: {
    status: {
      installId: "ins-apex-1",
      version: "2.4.1",
      channel: "stable",
      licence: {
        edition: "standard",
        state: "active",
        expiresAt: "2027-03-31",
        supportEndsAt: "2027-03-31",
        learnerCap: 1500,
        learnersUsed: 1284,
        campusCap: 5,
        campusesUsed: 3,
        graceEndsAt: null,
      },
      airGapped: false,
      telemetryEnabled: true,
      lastUpdateCheckAt: "2026-09-15T02:00:00Z",
      lastBackupAt: "2026-09-15T01:00:00Z",
    },
    update: {
      version: "2.4.2",
      channel: "stable",
      source: "online",
      signatureValid: true,
      securityFix: true,
      releaseNotes:
        "Fixes a session-timeout bug on shared exam-centre computers and updates the PDF library.",
      coveredBySupport: true,
    },
    backups: [
      {
        id: "bkp-0915",
        kind: "backup",
        status: "done",
        encrypted: true,
        sizeBytes: 4_831_838_208,
        startedAt: "2026-09-15T01:00:00Z",
        finishedAt: "2026-09-15T01:22:00Z",
      },
      {
        id: "bkp-0914",
        kind: "backup",
        status: "done",
        encrypted: true,
        sizeBytes: 4_829_741_056,
        startedAt: "2026-09-14T01:00:00Z",
        finishedAt: "2026-09-14T01:21:00Z",
      },
    ],
    diagnostics: [
      {
        id: "dgn-0914",
        status: "ready_for_review",
        scrubbed: true,
        sizeBytes: 18_874_368,
        ticketRef: "TCK-2291",
        createdAt: "2026-09-14T10:30:00Z",
        reviewedBy: null,
        sentAt: null,
      },
    ],
  },
};
