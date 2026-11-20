import type { Channel, DeliveryStatus } from "@nexus/contracts";
import { formatDateTime, isPseudoLocale, SOURCE_LOCALE, type MessageKey } from "@nexus/i18n";

export const CHANNEL_KEY: Readonly<Record<Channel, MessageKey>> = {
  email: "m07.channel.email",
  sms: "m07.channel.sms",
  whatsapp: "m07.channel.whatsapp",
  push: "m07.channel.push",
  in_app: "m07.channel.inApp",
};

export const STATUS_KEY: Readonly<Record<DeliveryStatus, MessageKey>> = {
  queued: "m07.delivery.queued",
  sent: "m07.delivery.sent",
  delivered: "m07.delivery.delivered",
  failed: "m07.delivery.failed",
  suppressed: "m07.delivery.suppressed",
};

export const STATUS_TONE: Readonly<
  Record<DeliveryStatus, "info" | "brand" | "success" | "danger" | "neutral">
> = {
  queued: "info",
  sent: "brand",
  delivered: "success",
  failed: "danger",
  suppressed: "neutral",
};

/** Known Stage 1 events; any other event type shows its code. */
export const EVENT_KEY: Readonly<Record<string, MessageKey>> = {
  "m02.user.invited": "m07.event.userInvited",
  "m06.consent.requested": "m07.event.consentRequested",
  "m07.announcement.published": "m07.event.announcementPublished",
};

export function when(value: string, locale: string, timeZone: string): string {
  return formatDateTime(value, {
    locale: isPseudoLocale(locale) ? SOURCE_LOCALE : locale,
    timeZone,
  });
}
