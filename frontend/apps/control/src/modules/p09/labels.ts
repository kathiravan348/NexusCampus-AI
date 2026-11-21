import type { TicketPriority, TicketStatus } from "@nexus/contracts";
import type { ControlMessageKey } from "@nexus/i18n/control";
import type { BadgeProps } from "@nexus/ui-core";

type Tone = NonNullable<BadgeProps["tone"]>;

export const TICKET_STATUS: Readonly<Record<TicketStatus, { key: ControlMessageKey; tone: Tone }>> =
  {
    new: { key: "p09.status.new", tone: "info" },
    open: { key: "p09.status.open", tone: "brand" },
    waiting_customer: { key: "p09.status.waitingCustomer", tone: "warning" },
    resolved: { key: "p09.status.resolved", tone: "success" },
    closed: { key: "p09.status.closed", tone: "neutral" },
  };

export const PRIORITY_TONE: Readonly<Record<TicketPriority, Tone>> = {
  p1: "danger",
  p2: "warning",
  p3: "info",
  p4: "neutral",
};

export const priorityLevel = (p: TicketPriority) => Number(p.slice(1));

export const CHANNEL_KEY: Readonly<Record<"portal" | "email" | "phone", ControlMessageKey>> = {
  portal: "p09.channel.portal",
  email: "p09.channel.email",
  phone: "p09.channel.phone",
};
