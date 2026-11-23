import type { BackupJob, DiagnosticBundle, LicenceState } from "@nexus/contracts";
import {
  formatDate,
  formatNumber,
  isPseudoLocale,
  SOURCE_LOCALE,
  useText,
  type MessageKey,
} from "@nexus/i18n";
import {
  ApiRequestError,
  useApproveBundle,
  useBackups,
  useDiagnosticBundles,
  useDiagnosticContent,
  useDiscardBundle,
  useInstallStatus,
  useUpdateOffer,
} from "@nexus/services";
import {
  Badge,
  type BadgeProps,
  Button,
  Card,
  EmptyState,
  Meter,
  Skeleton,
  useToast,
} from "@nexus/ui-core";
import { ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { useOnline } from "../../app/RouteGuard";
import { useRuntime } from "../../app/TenantRuntime";
import {
  BundleReviewModal,
  type BundleDecision,
  type BundleDecisionError,
} from "./BundleReviewModal";

type Tone = NonNullable<BadgeProps["tone"]>;

const LICENCE_STATE: Readonly<Record<LicenceState, { key: MessageKey; tone: Tone }>> = {
  active: { key: "m84.licence.active", tone: "success" },
  grace: { key: "m84.licence.grace", tone: "warning" },
  read_only: { key: "m84.licence.readOnly", tone: "danger" },
  expired: { key: "m84.licence.expired", tone: "danger" },
  revoked: { key: "m84.licence.revoked", tone: "danger" },
};

const BACKUP_STATUS: Readonly<Record<BackupJob["status"], { key: MessageKey; tone: Tone }>> = {
  running: { key: "m84.backup.running", tone: "info" },
  done: { key: "m84.backup.done", tone: "success" },
  failed: { key: "m84.backup.failed", tone: "danger" },
};

const BUNDLE_STATUS: Readonly<Record<DiagnosticBundle["status"], { key: MessageKey; tone: Tone }>> =
  {
    generating: { key: "m84.bundle.generating", tone: "info" },
    ready_for_review: { key: "m84.bundle.readyForReview", tone: "warning" },
    approved: { key: "m84.bundle.approved", tone: "success" },
    sent: { key: "m84.bundle.sent", tone: "neutral" },
    discarded: { key: "m84.bundle.discarded", tone: "neutral" },
  };

const MB = 1024 * 1024;

/** Install agent (M84, L0): licence, updates, backups and diagnostics of an install on the institution's servers. */
export function InstallPage() {
  const t = useText();
  const toast = useToast();
  const { locale, timeZone } = useRuntime();
  const fmtLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const date = (value: string) => formatDate(value, { locale: fmtLocale, timeZone });
  const number = (value: number) => formatNumber(value, fmtLocale);
  const size = (bytes: number | null) =>
    bytes === null
      ? "—"
      : t("m84.sizeMb", {
          value: formatNumber(bytes / MB, fmtLocale, { maximumFractionDigits: 0 }),
        });
  const status = useInstallStatus();
  const update = useUpdateOffer();
  const backups = useBackups();
  const bundles = useDiagnosticBundles();
  const online = useOnline();
  const [reviewing, setReviewing] = useState<string | null>(null);
  const reviewButton = useRef<HTMLButtonElement | null>(null);
  const diagnosticsCard = useRef<HTMLDivElement>(null);
  const content = useDiagnosticContent(reviewing);
  const approve = useApproveBundle();
  const discard = useDiscardBundle();

  const closeReview = () => {
    setReviewing(null);
    requestAnimationFrame(() => {
      const target = reviewButton.current?.isConnected
        ? reviewButton.current
        : diagnosticsCard.current;
      target?.focus();
    });
  };

  const decide = async (decision: BundleDecision): Promise<BundleDecisionError | null> => {
    if (!reviewing) return "other";
    try {
      await (decision === "approve" ? approve : discard).mutateAsync(reviewing);
      toast.show({
        tone: "success",
        title: t(decision === "approve" ? "m84.bundle.approvedDone" : "m84.bundle.discardedDone"),
      });
      return null;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) return "conflict";
      if (error instanceof ApiRequestError && error.offline) return "offline";
      return "other";
    }
  };

  if (status.isPending) return <Skeleton className="h-64" />;
  if (status.isError) return <EmptyState tone="error" />;
  const s = status.data;
  const l = s.licence;
  const offer = update.data?.offer ?? null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {t("m84.nav.title")}
        </h1>
        <p className="text-body text-text-secondary">
          {t("m84.intro", { version: s.version, channel: t(`m84.channel.${s.channel}`) })}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          headingAs="h2"
          title={t("m84.licence.title")}
          actions={
            <Badge tone={LICENCE_STATE[l.state].tone}>{t(LICENCE_STATE[l.state].key)}</Badge>
          }
        >
          <div className="space-y-3">
            <p className="text-body-sm text-text-secondary">
              {t(l.edition === "enterprise" ? "m84.edition.enterprise" : "m84.edition.standard")}
              {" · "}
              {t("m84.supportEnds", { date: date(l.supportEndsAt) })}
            </p>
            <Meter
              label={t("m84.learners")}
              value={l.learnersUsed}
              max={l.learnerCap}
              valueText={t("m84.used", { used: number(l.learnersUsed), cap: number(l.learnerCap) })}
            />
            <Meter
              label={t("m84.campuses")}
              value={l.campusesUsed}
              max={l.campusCap}
              valueText={t("m84.used", {
                used: number(l.campusesUsed),
                cap: number(l.campusCap),
              })}
            />
            <p className="text-body-sm text-text-secondary">{t("m84.licence.offline")}</p>
          </div>
        </Card>

        <Card headingAs="h2" title={t("m84.update.title")}>
          {update.isPending ? (
            <Skeleton className="h-24" />
          ) : offer === null ? (
            <p className="text-body-sm text-text-secondary">{t("m84.update.none")}</p>
          ) : (
            <div className="space-y-2 text-body-sm">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-text-primary">
                  {t("m84.update.version", { version: offer.version })}
                </span>
                {offer.securityFix && <Badge tone="danger">{t("m84.update.security")}</Badge>}
                <Badge tone={offer.signatureValid ? "success" : "danger"}>
                  {t(offer.signatureValid ? "m84.update.signed" : "m84.update.badSignature")}
                </Badge>
              </p>
              <p className="text-text-secondary">
                {t(offer.source === "online" ? "m84.update.online" : "m84.update.offline")}
                {" · "}
                {t(offer.coveredBySupport ? "m84.update.covered" : "m84.update.notCovered")}
              </p>
              <p>{offer.releaseNotes}</p>
            </div>
          )}
          {s.lastUpdateCheckAt && (
            <p className="mt-3 text-body-sm text-text-secondary">
              {t("m84.update.lastCheck", { date: date(s.lastUpdateCheckAt) })}
            </p>
          )}
        </Card>
      </div>

      <Card headingAs="h2" title={t("m84.backups.title")}>
        <p className="mb-3 text-body-sm text-text-secondary">{t("m84.backups.rule")}</p>
        {backups.isPending ? (
          <Skeleton className="h-16" />
        ) : (backups.data?.items ?? []).length === 0 ? (
          <p className="text-body-sm text-text-secondary">{t("m84.backups.none")}</p>
        ) : (
          <ul className="space-y-2">
            {(backups.data?.items ?? []).map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 text-body-sm">
                <span>
                  {t(b.kind === "backup" ? "m84.backups.backup" : "m84.backups.export", {
                    date: date(b.startedAt),
                    size: size(b.sizeBytes),
                  })}
                </span>
                <Badge tone={BACKUP_STATUS[b.status].tone}>{t(BACKUP_STATUS[b.status].key)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card ref={diagnosticsCard} tabIndex={-1} headingAs="h2" title={t("m84.privacy.title")}>
        <div className="space-y-3 text-body-sm">
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            {s.airGapped
              ? t("m84.privacy.airGapped")
              : t(s.telemetryEnabled ? "m84.privacy.telemetryOn" : "m84.privacy.telemetryOff")}
          </p>
          <p className="text-text-secondary">{t("m84.privacy.bundleRule")}</p>
          {(bundles.data?.items ?? []).length === 0 ? (
            <p className="text-text-secondary">{t("m84.bundle.none")}</p>
          ) : (
            <ul className="space-y-2">
              {(bundles.data?.items ?? []).map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-2">
                  <span>
                    {b.ticketRef
                      ? t("m84.bundle.forTicket", {
                          ticket: b.ticketRef,
                          date: date(b.createdAt),
                          size: size(b.sizeBytes),
                        })
                      : t("m84.bundle.item", { date: date(b.createdAt), size: size(b.sizeBytes) })}
                  </span>
                  <Badge tone={BUNDLE_STATUS[b.status].tone}>
                    {t(BUNDLE_STATUS[b.status].key)}
                  </Badge>
                  {b.status === "ready_for_review" &&
                    (online ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={t("m84.bundle.reviewLabel", { id: b.id })}
                        onClick={(event) => {
                          reviewButton.current = event.currentTarget;
                          setReviewing(b.id);
                        }}
                      >
                        {t("m84.bundle.review")}
                      </Button>
                    ) : (
                      <span className="text-text-secondary">{t("m84.bundle.needsConnection")}</span>
                    ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
      {reviewing && (
        <BundleReviewModal
          content={content.data?.content}
          loadError={
            content.isError
              ? content.error instanceof ApiRequestError && content.error.offline
                ? "offline"
                : "other"
              : null
          }
          pendingDecision={approve.isPending ? "approve" : discard.isPending ? "discard" : null}
          onRetry={() => void content.refetch()}
          onDecide={decide}
          onClose={closeReview}
        />
      )}
    </div>
  );
}

export default InstallPage;
