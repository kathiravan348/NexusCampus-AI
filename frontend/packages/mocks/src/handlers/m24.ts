import {
  MeetingBookingSchema,
  MeetingSlotSchema,
  MessageThreadSchema,
  NoticeSchema,
  ThreadMessageSchema,
  pageSchema,
} from "@nexus/contracts";
import { familyOf, ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { SYSTEM_ROLE_KEYS, roleId } from "../fixtures";
import { found, get, list, param } from "./route";

const M = { module: "M24" } as const;
export const MESSAGES_READ = "m24.messages.read";
export const NOTICES_READ = "m24.notices.read";
const NOTICES_PUBLISH = "m24.notices.publish";
const MEETINGS_READ = "m24.meetings.read";
const MEETINGS_MANAGE = "m24.meetings.manage";

export function viewerThreads(viewer: Viewer) {
  return ofTenant(mockDb.messageThreads, viewer.tenantId).filter((thread) =>
    thread.participantPersonIds.includes(viewer.personId),
  );
}

function familyClassGroups(viewer: Viewer) {
  const people = familyOf(viewer);
  const learnerIds = new Set(
    ofTenant(mockDb.learners, viewer.tenantId)
      .filter((learner) => people.has(learner.personId))
      .map((learner) => learner.id),
  );
  return new Set(
    ofTenant(mockDb.enrolments, viewer.tenantId)
      .filter((row) => row.status === "active" && learnerIds.has(row.learnerId))
      .map((row) => row.classGroupId),
  );
}

export function viewerNotices(viewer: Viewer, now: Date) {
  const { tenantId, userId, personId, permissions } = viewer;
  const notices = ofTenant(mockDb.notices, tenantId);
  if (permissions.has(NOTICES_PUBLISH)) return notices;

  const roleIds = new Set(
    ofTenant(mockDb.roleAssignments, tenantId)
      .filter((assignment) => assignment.userId === userId)
      .map((assignment) => assignment.roleId),
  );
  const roleKeys = new Set<string>();
  for (const role of ofTenant(mockDb.roles, tenantId)) {
    if (!roleIds.has(role.id)) continue;
    if ("key" in role && typeof role.key === "string") {
      roleKeys.add(role.key);
    }
    const systemKey = SYSTEM_ROLE_KEYS.find((key) => role.id === roleId(tenantId, key));
    if (role.system && systemKey) roleKeys.add(systemKey);
  }
  const classGroups = familyClassGroups(viewer);
  return notices.filter(({ status, publishAt, expiresAt, audience }) => {
    if (
      status !== "published" ||
      Date.parse(publishAt) > now.getTime() ||
      (expiresAt !== null && Date.parse(expiresAt) <= now.getTime())
    ) {
      return false;
    }
    switch (audience.kind) {
      case "everyone":
        return true;
      case "class_groups":
        return audience.ids.some((id) => classGroups.has(id));
      case "roles":
        return audience.ids.some((id) => roleKeys.has(id));
      case "people":
        return audience.ids.includes(personId);
    }
  });
}

export const m24Handlers = [
  get("/message-threads", { ...M, permission: MESSAGES_READ }, (ctx) =>
    list(ctx, viewerThreads(ctx.viewer), pageSchema(MessageThreadSchema)),
  ),
  get("/message-threads/:id/messages", { ...M, permission: MESSAGES_READ }, (ctx) => {
    const thread = found(viewerThreads(ctx.viewer).find((row) => row.id === ctx.params["id"]));
    const messages = ofTenant(mockDb.threadMessages, ctx.viewer.tenantId).filter(
      (row) => row.threadId === thread.id,
    );
    return list(ctx, messages, pageSchema(ThreadMessageSchema));
  }),
  get("/notices", { ...M, permission: NOTICES_READ }, (ctx) =>
    list(ctx, viewerNotices(ctx.viewer, new Date()), pageSchema(NoticeSchema)),
  ),
  get("/meeting-slots", { ...M, permission: MEETINGS_READ }, (ctx) => {
    const { tenantId } = ctx.viewer;
    const staffProfileId = param(ctx.url, "staffProfileId");
    if (staffProfileId !== null) {
      found(
        ofTenant(mockDb.roleProfiles, tenantId).find(
          (row) => row.kind === "staff" && row.id === staffProfileId,
        ),
      );
    }
    const slots = ofTenant(mockDb.meetingSlots, tenantId).filter(
      (row) => staffProfileId === null || row.staffProfileId === staffProfileId,
    );
    return list(ctx, slots, pageSchema(MeetingSlotSchema));
  }),
  get("/meeting-bookings", { ...M, permission: MEETINGS_READ }, (ctx) => {
    const { tenantId, personId, permissions } = ctx.viewer;
    const bookings = ofTenant(mockDb.meetingBookings, tenantId);
    if (permissions.has(MEETINGS_MANAGE)) {
      return list(ctx, bookings, pageSchema(MeetingBookingSchema));
    }

    const profiles = ofTenant(mockDb.roleProfiles, tenantId).filter(
      (row) => row.personId === personId,
    );
    const isGuardian = profiles.some((row) => row.kind === "guardian");
    const staffIds = new Set(profiles.filter((row) => row.kind === "staff").map((row) => row.id));
    const slotIds = new Set(
      ofTenant(mockDb.meetingSlots, tenantId)
        .filter((row) => staffIds.has(row.staffProfileId))
        .map((row) => row.id),
    );
    const ownBooking = (row: { guardianPersonId: string }) =>
      isGuardian && row.guardianPersonId === personId;
    const visible = bookings
      .filter((row) => ownBooking(row) || slotIds.has(row.slotId))
      .map((row) => (ownBooking(row) ? row : { ...row, note: null }));
    return list(ctx, visible, pageSchema(MeetingBookingSchema));
  }),
];
