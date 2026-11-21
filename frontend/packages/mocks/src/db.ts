import * as F from "./fixtures";

/** A mutable deep copy, so screen tasks' write handlers can change rows without touching the fixtures. */
function clone<T>(items: readonly T[]): T[] {
  return structuredClone(items) as T[];
}

function createDb() {
  return {
    groups: clone(F.GROUPS),
    institutions: clone(F.INSTITUTIONS),
    campuses: clone(F.CAMPUSES),
    typeProfiles: clone(F.INSTITUTION_TYPE_PROFILES),
    calendars: clone(F.ACADEMIC_CALENDARS),
    people: clone(F.PEOPLE),
    roleProfiles: clone(F.ROLE_PROFILES),
    guardianLinks: clone(F.GUARDIAN_LINKS),
    users: clone(F.USERS),
    sessions: clone(F.SESSIONS),
    ssoProviders: clone(F.SSO_PROVIDERS),
    permissions: clone(F.PERMISSIONS),
    roles: clone(F.ROLES),
    roleAssignments: clone(F.ROLE_ASSIGNMENTS),
    demoTenants: clone(F.DEMO_TENANTS),
    demoPersonas: clone(F.DEMO_PERSONAS),
    fonts: clone(F.FONTS),
    themes: clone(F.THEMES),
    textOverrides: clone(F.TEXT_OVERRIDES),
    textOverrideRevisions: clone(F.TEXT_OVERRIDE_REVISIONS),
    plans: clone(F.PLANS),
    tenantPlans: { ...F.TENANT_PLANS } as Record<string, string>,
    entitlements: [...clone(F.ENTITLEMENTS), ...clone(F.INSTALL_ENTITLEMENTS)],
    installs: structuredClone(F.INSTALLS) as Record<string, F.DemoInstall>,
    usageMeters: clone(F.USAGE_METERS),
    auditEvents: clone(F.AUDIT_EVENTS),
    consents: clone(F.CONSENTS),
    dataRequests: clone(F.DATA_SUBJECT_REQUESTS),
    compliancePacks: clone(F.COMPLIANCE_PACKS),
    tenantCompliance: structuredClone(F.TENANT_COMPLIANCE) as Record<string, string[]>,
    notificationTemplates: clone(F.NOTIFICATION_TEMPLATES),
    notificationDeliveries: clone(F.NOTIFICATION_DELIVERIES),
    notificationPreferences: clone(F.NOTIFICATION_PREFERENCES),
    devices: clone(F.DEVICE_SYNCS),
    syncConflicts: clone(F.SYNC_CONFLICTS),
    aiSettings: clone(F.AI_SETTINGS),
    aiCredits: clone(F.AI_CREDITS),
    keyStatuses: clone(F.KEY_STATUSES),
    accessRequests: clone(F.ACCESS_REQUESTS),
    accessGrants: clone(F.ACCESS_GRANTS),
    breakGlassNotices: clone(F.BREAK_GLASS_NOTICES),
  };
}

export type MockDb = ReturnType<typeof createDb>;

/** The in-memory mock database every handler reads. Tests call `resetMockDb()` between cases. */
export const mockDb: MockDb = createDb();

export function resetMockDb(): void {
  Object.assign(mockDb, createDb());
}
