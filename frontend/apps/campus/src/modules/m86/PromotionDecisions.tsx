import {
  PromotionActionSchema,
  type PromotionAction,
  type PromotionDecision,
} from "@nexus/contracts";
import { isKnownMessageKey, useText, type MessageKey } from "@nexus/i18n";
import { useClassGroups } from "@nexus/services";
import { EmptyState, Select } from "@nexus/ui-core";
import { useLearnerNames } from "../m18/InvoicesTab";

interface Props {
  readonly decisions: readonly PromotionDecision[];
  readonly action: PromotionAction | "";
  readonly onAction: (action: string) => void;
}

const columns = [
  "term.learner",
  "m86.decision.action",
  "m86.decision.target",
  "m86.decision.reason",
] as const;

function knownReason(key: string | null): key is MessageKey {
  return key !== null && isKnownMessageKey(key);
}

export function PromotionDecisions({ decisions, action, onAction }: Props) {
  const t = useText();
  const names = useLearnerNames(true);
  const groups = useClassGroups();
  const groupNames = new Map(groups.data?.items.map((group) => [group.id, group.name]));
  const rows = decisions.filter((decision) => !action || decision.action === action);
  const unavailable = t("m86.decision.unavailable");

  return (
    <section aria-labelledby="promotion-decisions" className="space-y-3">
      <h2 id="promotion-decisions" className="font-semibold text-text-primary">
        {t("m86.decision.heading")}
      </h2>
      <Select
        label={t("m86.decision.filter")}
        className="min-h-11"
        value={action}
        options={[
          { value: "", label: t("m86.decision.all") },
          ...PromotionActionSchema.options.map((value) => ({
            value,
            label: t(`m86.action.${value}`),
          })),
        ]}
        onChange={(event) => onAction(event.target.value)}
      />
      {rows.length === 0 ? (
        <EmptyState title={t("m86.decision.none")} />
      ) : (
        <table aria-labelledby="promotion-decisions" className="block w-full text-start sm:table">
          <thead className="sr-only sm:not-sr-only sm:table-header-group">
            <tr>
              {columns.map((key) => (
                <th key={key} scope="col" className="p-2 text-start text-body-sm">
                  {t(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="grid gap-3 sm:table-row-group">
            {rows.map((decision) => {
              const fields = [
                names.get(decision.learnerId) ?? t("m86.decision.learnerFallback"),
                t(`m86.action.${decision.action}`),
                (decision.toClassGroupId && groupNames.get(decision.toClassGroupId)) ?? unavailable,
                knownReason(decision.reasonKey) ? t(decision.reasonKey) : unavailable,
              ];
              return (
                <tr
                  key={decision.id}
                  className="block rounded-lg border border-border-default bg-bg-surface p-2 sm:table-row"
                >
                  {columns.map((key, index) => (
                    <td key={key} className="grid min-w-0 gap-1 p-2 align-top sm:table-cell">
                      <span
                        aria-hidden="true"
                        className="text-body-sm text-text-secondary sm:hidden"
                      >
                        {t(key)}
                      </span>
                      <span>{fields[index]}</span>
                      {key === "m86.decision.action" && decision.overriddenByStaffProfileId && (
                        <span className="block text-body-sm text-text-secondary">
                          {t("m86.decision.changed")}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
