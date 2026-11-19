import {
  explainMessage,
  MESSAGE_KEYS,
  type InstitutionType,
  type MessageExplanation,
  type MessageKey,
  type TextOverrides,
} from "@nexus/i18n";

export interface MessageRow {
  readonly key: MessageKey;
  readonly explanation: MessageExplanation;
  readonly lockedByGroup: boolean;
  readonly hasInstitutionOverride: boolean;
  readonly isOverridden: boolean;
}

export function buildMessageRows(
  locale: string,
  typePack: InstitutionType | undefined,
  layers: {
    readonly group: TextOverrides;
    readonly institution: TextOverrides;
    readonly campus: TextOverrides;
  },
): MessageRow[] {
  return MESSAGE_KEYS.map((key) => {
    const explanation = explainMessage(key, {
      locale,
      ...(typePack ? { typePack } : {}),
      group: layers.group,
      institution: layers.institution,
      campus: layers.campus,
    });
    const lockedByGroup = explanation.layers.group !== null;
    const hasInstitutionOverride = explanation.layers.institution !== null;
    const isOverridden =
      lockedByGroup || hasInstitutionOverride || explanation.layers.campus !== null;
    return { key, explanation, lockedByGroup, hasInstitutionOverride, isOverridden };
  });
}

export function sourceBadge(item: MessageRow): {
  readonly tone: "warning" | "brand" | "info" | "neutral";
  readonly key: MessageKey;
} {
  if (item.lockedByGroup) return { tone: "warning", key: "m04.studio.badgeGroupLocked" };
  if (item.isOverridden) return { tone: "brand", key: "m04.studio.badgeOverridden" };
  if (item.explanation.winner === "terminology") {
    return { tone: "info", key: "m04.studio.badgeTerminology" };
  }
  return { tone: "neutral", key: "m04.studio.badgePlatform" };
}
