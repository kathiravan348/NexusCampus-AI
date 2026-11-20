import type {
  Channel,
  DeliveryStatus,
  NotificationDelivery,
  NotificationPreference,
  NotificationTemplate,
} from "@nexus/contracts";
import { PERSON, TENANT, USER } from "./ids";
import { UPDATED_AT } from "./tenants";

/** The three event types every demo tenant has templates for. */
export const NOTIFICATION_EVENTS = [
  "m02.user.invited",
  "m06.consent.requested",
  "m07.announcement.published",
] as const;
type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

interface Text {
  readonly subject: string;
  readonly body: string;
}

const EN: Record<NotificationEvent, Text> = {
  "m02.user.invited": {
    subject: "You are invited to {institution}",
    body: "Hello {name}, {institution} has invited you to sign in. The invitation expires on {expiresAt, date, medium}.",
  },
  "m06.consent.requested": {
    subject: "Consent needed for {learner}",
    body: "Hello {name}, please review and answer the consent request for {learner}.",
  },
  "m07.announcement.published": {
    subject: "New announcement: {title}",
    body: "{institution} posted a new announcement: {title}.",
  },
};

const HI: Record<NotificationEvent, Text> = {
  "m02.user.invited": {
    subject: "{institution} में शामिल होने का आमंत्रण",
    body: "नमस्ते {name}, {institution} ने आपको साइन इन करने के लिए आमंत्रित किया है। आमंत्रण {expiresAt, date, medium} को समाप्त होगा।",
  },
  "m06.consent.requested": {
    subject: "{learner} के लिए सहमति चाहिए",
    body: "नमस्ते {name}, कृपया {learner} के सहमति अनुरोध को देखें और उत्तर दें।",
  },
  "m07.announcement.published": {
    subject: "नई घोषणा: {title}",
    body: "{institution} ने एक नई घोषणा की है: {title}।",
  },
};

const TA: Record<NotificationEvent, Text> = {
  "m02.user.invited": {
    subject: "{institution} இல் சேர அழைப்பு",
    body: "வணக்கம் {name}, {institution} உங்களை உள்நுழைய அழைத்துள்ளது. அழைப்பு {expiresAt, date, medium} அன்று காலாவதியாகும்.",
  },
  "m06.consent.requested": {
    subject: "{learner} க்கு ஒப்புதல் தேவை",
    body: "வணக்கம் {name}, {learner} க்கான ஒப்புதல் கோரிக்கையைப் பார்த்துப் பதிலளிக்கவும்.",
  },
  "m07.announcement.published": {
    subject: "புதிய அறிவிப்பு: {title}",
    body: "{institution} ஒரு புதிய அறிவிப்பை வெளியிட்டுள்ளது: {title}.",
  },
};

const short = (eventType: string) => eventType.split(".").slice(0, 2).join("-");
const localeTag = (locale: string) => locale.split("-")[0];

export const templateId = (tenantId: string, eventType: string, channel: Channel, locale: string) =>
  `ntp-${tenantId.replace(/^ten-/, "")}-${short(eventType)}-${channel}-${localeTag(locale)}`;

const templatesFor = (tenantId: string, locale: string, texts: Record<NotificationEvent, Text>) =>
  NOTIFICATION_EVENTS.flatMap((eventType) =>
    (["email", "in_app"] as const).map((channel): NotificationTemplate => ({
      id: templateId(tenantId, eventType, channel, locale),
      tenantId,
      eventType,
      channel,
      locale,
      subject: channel === "email" ? texts[eventType].subject : null,
      body: texts[eventType].body,
      version: 1,
      enabled: true,
      updatedAt: UPDATED_AT,
    })),
  );

/** 3 events × email + in-app per tenant in its default locale; Riverside (Hindi) and Apex (Tamil) also have English. */
export const NOTIFICATION_TEMPLATES: readonly NotificationTemplate[] = [
  ...templatesFor(TENANT.littleSteps, "en-IN", EN),
  ...templatesFor(TENANT.riverside, "hi-IN", HI),
  ...templatesFor(TENANT.riverside, "en-GB", EN),
  ...templatesFor(TENANT.northbridge, "en-US", EN),
  ...templatesFor(TENANT.apex, "ta-IN", TA),
  ...templatesFor(TENANT.apex, "en-IN", EN),
  ...templatesFor(TENANT.harmony, "en-SG", EN),
];

const delivery = (
  id: string,
  tenantId: string,
  template: [string, Channel, string],
  recipientPersonId: string,
  status: DeliveryStatus,
  queuedAt: string,
  sentAt: string | null,
  reason: string | null = null,
): NotificationDelivery => ({
  id,
  tenantId,
  templateId: templateId(tenantId, template[0], template[1], template[2]),
  recipientPersonId,
  channel: template[1],
  status,
  reason,
  queuedAt,
  sentAt,
});

const QUIET = "Quiet hours";

/** Delivery log: mixed statuses, incl. a bounced email and an in-app message held for quiet hours. */
export const NOTIFICATION_DELIVERIES = [
  delivery(
    "ndl-ls-01",
    TENANT.littleSteps,
    ["m06.consent.requested", "email", "en-IN"],
    PERSON.lsSunita,
    "delivered",
    "2026-09-10T04:00:00Z",
    "2026-09-10T04:00:05Z",
  ),
  delivery(
    "ndl-ls-02",
    TENANT.littleSteps,
    ["m02.user.invited", "email", "en-IN"],
    PERSON.lsDeepak,
    "failed",
    "2026-09-12T05:00:00Z",
    "2026-09-12T05:00:04Z",
    "Mailbox unavailable",
  ),
  delivery(
    "ndl-rv-01",
    TENANT.riverside,
    ["m07.announcement.published", "in_app", "en-GB"],
    PERSON.rvGrace,
    "suppressed",
    "2026-09-10T21:30:00Z",
    null,
    QUIET,
  ),
  delivery(
    "ndl-rv-02",
    TENANT.riverside,
    ["m06.consent.requested", "email", "en-GB"],
    PERSON.rvAmira,
    "sent",
    "2026-09-10T08:00:00Z",
    "2026-09-10T08:00:03Z",
  ),
  delivery(
    "ndl-nb-01",
    TENANT.northbridge,
    ["m07.announcement.published", "email", "en-US"],
    PERSON.nbPatricia,
    "delivered",
    "2026-09-11T14:00:00Z",
    "2026-09-11T14:00:06Z",
  ),
  delivery(
    "ndl-ax-01",
    TENANT.apex,
    ["m07.announcement.published", "in_app", "ta-IN"],
    PERSON.axLakshmi,
    "delivered",
    "2026-09-13T06:00:00Z",
    "2026-09-13T06:00:01Z",
  ),
  delivery(
    "ndl-ax-02",
    TENANT.apex,
    ["m07.announcement.published", "email", "en-IN"],
    PERSON.axSuresh,
    "queued",
    "2026-09-15T11:58:00Z",
    null,
  ),
  delivery(
    "ndl-hm-01",
    TENANT.harmony,
    ["m02.user.invited", "email", "en-SG"],
    PERSON.hmMei,
    "delivered",
    "2026-09-01T02:00:00Z",
    "2026-09-01T02:00:04Z",
  ),
] satisfies readonly NotificationDelivery[];

/** Users' channel choices. Grace's in-app quiet hours explain the suppressed delivery above. */
export const NOTIFICATION_PREFERENCES = [
  {
    userId: USER.lsSunita,
    channel: "email",
    eventType: null,
    enabled: true,
    quietHours: { start: "21:00", end: "07:00" },
    timeZone: "Asia/Kolkata",
  },
  {
    userId: USER.rvGrace,
    channel: "in_app",
    eventType: null,
    enabled: true,
    quietHours: { start: "21:00", end: "07:00" },
    timeZone: "Europe/London",
  },
  {
    userId: USER.nbPatricia,
    channel: "sms",
    eventType: null,
    enabled: false,
    quietHours: null,
    timeZone: "America/New_York",
  },
  {
    userId: USER.axLakshmi,
    channel: "in_app",
    eventType: "m07.announcement.published",
    enabled: true,
    quietHours: { start: "22:00", end: "06:00" },
    timeZone: "Asia/Kolkata",
  },
  {
    userId: USER.hmMei,
    channel: "email",
    eventType: "m07.announcement.published",
    enabled: false,
    quietHours: null,
    timeZone: "Asia/Singapore",
  },
] satisfies readonly NotificationPreference[];
