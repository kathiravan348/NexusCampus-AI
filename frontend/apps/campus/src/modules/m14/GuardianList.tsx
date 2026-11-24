import type { GuardianRelationshipKind, Person, PickupRight } from "@nexus/contracts";
import {
  formatDate,
  formatNumber,
  formatPhone,
  isPseudoLocale,
  SOURCE_LOCALE,
  useText,
  type MessageKey,
} from "@nexus/i18n";
import { ApiRequestError, useAuthorisedPickups, useGuardianRelationships } from "@nexus/services";
import { Badge, Button, EmptyState, Skeleton, type BadgeProps } from "@nexus/ui-core";
import { Phone, TriangleAlert } from "lucide-react";
import { useRuntime } from "../../app/TenantRuntime";

type BadgeTone = NonNullable<BadgeProps["tone"]>;

const RELATIONSHIP_KIND_KEY: Readonly<Record<GuardianRelationshipKind, MessageKey>> = {
  mother: "m14.relationshipKind.mother",
  father: "m14.relationshipKind.father",
  parent: "m14.relationshipKind.parent",
  step_parent: "m14.relationshipKind.stepParent",
  grandparent: "m14.relationshipKind.grandparent",
  legal_guardian: "m14.relationshipKind.legalGuardian",
  foster_carer: "m14.relationshipKind.fosterCarer",
  adult_sibling: "m14.relationshipKind.adultSibling",
  other: "m14.relationshipKind.other",
};

const PICKUP_RIGHT_KEY: Readonly<Record<PickupRight, MessageKey>> = {
  allowed: "m14.pickupRight.allowed",
  not_allowed: "m14.pickupRight.notAllowed",
  court_restricted: "m14.pickupRight.courtRestricted",
};

const PICKUP_RIGHT_TONE: Readonly<Record<PickupRight, BadgeTone>> = {
  allowed: "success",
  not_allowed: "neutral",
  court_restricted: "warning",
};

function isHttpStatus(error: unknown, status: number): boolean {
  return error instanceof ApiRequestError && error.status === status;
}

function personDisplayName(person: Person): string {
  return person.preferredName ? `${person.preferredName} (${person.legalName})` : person.legalName;
}

function AuthorisedPickupsSection({
  learnerPersonId,
  headingAs,
}: {
  readonly learnerPersonId: string;
  readonly headingAs: "h3" | "h4";
}) {
  const t = useText();
  const { locale } = useRuntime();
  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const pickups = useAuthorisedPickups(learnerPersonId);
  const Heading = headingAs;

  if (pickups.isError && !pickups.data && isHttpStatus(pickups.error, 404)) {
    return null;
  }

  return (
    <div className="space-y-2.5">
      <Heading className="font-sans text-body font-semibold text-text-primary">
        {t("m14.pickups.heading")}
      </Heading>
      {pickups.isPending && !pickups.data ? (
        <div role="status" aria-label={t("common.loading")}>
          <Skeleton className="h-12 w-full" />
        </div>
      ) : pickups.isError && !pickups.data ? (
        isHttpStatus(pickups.error, 403) ? (
          <p className="text-body-sm text-text-secondary">{t("common.shell.forbiddenTitle")}</p>
        ) : (
          <EmptyState
            tone="error"
            title={t("m14.pickups.error")}
            action={
              <Button variant="secondary" size="sm" onClick={() => void pickups.refetch()}>
                {t("common.retry")}
              </Button>
            }
          />
        )
      ) : (pickups.data?.items.length ?? 0) === 0 ? (
        <p className="text-body-sm text-text-muted">{t("m14.pickups.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {(pickups.data?.items ?? []).map((pickup) => {
            const from = formatDate(pickup.validFrom, { locale: safeLocale });
            const validity =
              pickup.validTo !== null
                ? t("m14.pickups.validRange", {
                    from,
                    to: formatDate(pickup.validTo, { locale: safeLocale }),
                  })
                : t("m14.pickups.validFrom", { from });
            return (
              <li
                key={pickup.id}
                className="min-w-0 space-y-1 rounded-md border border-border-default bg-bg-surface p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-words text-body font-medium text-text-primary">
                    {pickup.name}
                  </span>
                  <Badge tone="neutral">{pickup.relationshipLabel}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-text-secondary">
                  <span className="inline-flex items-center gap-1.5 font-mono text-number-sm">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                    <span dir="ltr">{formatPhone(pickup.phone)}</span>
                  </span>
                  <span>{validity}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export interface GuardianListProps {
  readonly learnerPersonId: string;
  readonly peopleById: ReadonlyMap<string, Person>;
  /** When true (default), renders authorised non-guardian pickups below the guardians list. */
  readonly showPickups?: boolean;
  /** Heading level used when subheadings are shown inside this section. */
  readonly headingAs?: "h3" | "h4";
}

/**
 * Guardians (and optionally authorised pickups) for one learner. Pickup restrictions show a clear
 * text badge; court order notes render only when returned by the server.
 */
export function GuardianList({
  learnerPersonId,
  peopleById,
  showPickups = true,
  headingAs = "h4",
}: GuardianListProps) {
  const t = useText();
  const { locale } = useRuntime();
  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const relationships = useGuardianRelationships(learnerPersonId);
  const Heading = headingAs;

  const sorted = [...(relationships.data?.items ?? [])].sort(
    (a, b) => a.contactPriority - b.contactPriority,
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        {showPickups && (
          <Heading className="font-sans text-body font-semibold text-text-primary">
            {t("m14.guardians.heading")}
          </Heading>
        )}

        {relationships.isPending && !relationships.data ? (
          <div role="status" aria-label={t("common.loading")}>
            <Skeleton className="h-14 w-full" />
          </div>
        ) : relationships.isError && !relationships.data ? (
          isHttpStatus(relationships.error, 404) ? (
            <p className="text-body-sm text-text-muted">{t("m14.guardians.unavailable")}</p>
          ) : isHttpStatus(relationships.error, 403) ? (
            <p className="text-body-sm text-text-secondary">{t("common.shell.forbiddenTitle")}</p>
          ) : (
            <EmptyState
              tone="error"
              title={t("m14.guardians.error")}
              action={
                <Button variant="secondary" size="sm" onClick={() => void relationships.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          )
        ) : sorted.length === 0 ? (
          <p className="text-body-sm text-text-muted">{t("m14.guardians.empty")}</p>
        ) : (
          <ul className="space-y-2.5">
            {sorted.map((rel) => {
              const guardian = peopleById.get(rel.guardianPersonId);
              const name = guardian ? personDisplayName(guardian) : t("term.guardian");
              const isRestricted = rel.pickupRight === "court_restricted";
              return (
                <li
                  key={rel.id}
                  className="min-w-0 space-y-2 rounded-md border border-border-default bg-bg-surface p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-words text-body font-medium text-text-primary">
                      {name}
                    </span>
                    <Badge tone="neutral">{t(RELATIONSHIP_KIND_KEY[rel.kind])}</Badge>
                    <Badge tone={PICKUP_RIGHT_TONE[rel.pickupRight]}>
                      {isRestricted && (
                        <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      )}
                      {t(PICKUP_RIGHT_KEY[rel.pickupRight])}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-text-secondary">
                    <span>
                      {t("m14.guardians.contactPriority", {
                        priority: formatNumber(rel.contactPriority, safeLocale),
                      })}
                    </span>
                    {rel.parentalResponsibility && (
                      <span>{t("m14.guardians.parentalResponsibility")}</span>
                    )}
                    {rel.livesWithLearner && <span>{t("m14.guardians.livesWithLearner")}</span>}
                    {guardian?.phone && (
                      <span className="font-mono text-number-sm" dir="ltr">
                        {formatPhone(guardian.phone)}
                      </span>
                    )}
                    {guardian?.email && <span className="break-words">{guardian.email}</span>}
                  </div>

                  {rel.courtOrderNote !== null && (
                    <div className="rounded-md border border-warning bg-warning-subtle px-3 py-2 text-body-sm text-warning-text break-words">
                      <p className="font-semibold">{t("m14.guardians.courtNoteLabel")}</p>
                      <p>{rel.courtOrderNote}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showPickups && (
        <AuthorisedPickupsSection learnerPersonId={learnerPersonId} headingAs={headingAs} />
      )}
    </div>
  );
}
