import type { ControlUsageMetric } from "@nexus/contracts";
import type { ControlMessageKey } from "@nexus/i18n/control";

export const METRIC_KEY: Readonly<Record<ControlUsageMetric, ControlMessageKey>> = {
  learners: "p11.metric.learners",
  staff: "p11.metric.staff",
  storage_gb: "p11.metric.storageGb",
  ai_credits: "p11.metric.aiCredits",
  messages: "p11.metric.messages",
};
