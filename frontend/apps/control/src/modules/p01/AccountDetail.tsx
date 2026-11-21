import { useControlText } from "@nexus/i18n/control";
import { ApiRequestError } from "@nexus/services";
import {
  useAccount,
  usePartnerNames,
  useStaffCan,
  useStaffDirectory,
} from "@nexus/services/control";
import { Badge, Card, EmptyState, Skeleton, Tabs } from "@nexus/ui-core";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router";
import { useControlFormat } from "../../app/format";
import { ContactsTab } from "./ContactsTab";
import { ContractsTab } from "./ContractsTab";
import { MODEL_KEY, STAGE_KEY, STAGE_TONE, healthBand } from "./labels";
import { NotesTab } from "./NotesTab";
import { OpportunitiesTab } from "./OpportunitiesTab";

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-body-sm text-text-secondary">{label}</dt>
      <dd className="text-body text-text-primary">{children}</dd>
    </div>
  );
}

/** One account: summary facts and tabs for contacts, opportunities, contracts and notes (P01). */
export function AccountDetail() {
  const t = useControlText();
  const fmt = useControlFormat();
  const { accountId = "" } = useParams();
  const account = useAccount(accountId);
  const names = useStaffDirectory();
  const can = useStaffCan();
  const partners = usePartnerNames(can("ctl.partner.read"));

  const back = (
    <Link
      to=".."
      relative="path"
      className="inline-flex items-center gap-1 text-body-sm text-brand-primary-text hover:underline"
    >
      <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
      {t("p01.detail.back")}
    </Link>
  );

  if (account.isPending) return <Skeleton className="h-64" />;
  if (account.isError) {
    const missing = account.error instanceof ApiRequestError && account.error.status === 404;
    return (
      <div className="space-y-4">
        {back}
        <EmptyState
          tone={missing ? "neutral" : "error"}
          {...(missing ? { description: t("p01.detail.notFound") } : {})}
        />
      </div>
    );
  }

  const a = account.data;
  const band = healthBand(a.healthScore);
  return (
    <div className="space-y-4">
      {back}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">{a.name}</h1>
        <Badge tone={STAGE_TONE[a.stage]}>{t(STAGE_KEY[a.stage])}</Badge>
        <Badge tone={band.tone}>
          {t("p01.health.score", { score: a.healthScore, label: t(band.key) })}
        </Badge>
      </div>
      <Card title={t("p01.detail.summary")} headingAs="h2">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label={t("p01.col.type")}>{t(`m01.type.${a.institutionType}`)}</Fact>
          <Fact label={t("p01.col.model")}>{t(MODEL_KEY[a.deliveryModel])}</Fact>
          <Fact label={t("p01.detail.country")}>{a.country}</Fact>
          <Fact label={t("p01.detail.region")}>{t(`m01.region.${a.region}`)}</Fact>
          <Fact label={t("p01.detail.owner")}>{names.get(a.ownerStaffId) ?? t("p01.none")}</Fact>
          <Fact label={t("p01.detail.partner")}>
            {a.partnerId ? (partners.get(a.partnerId) ?? a.partnerId) : t("p01.detail.direct")}
          </Fact>
          <Fact label={t("p01.col.learners")}>{fmt.number(a.learnerCount)}</Fact>
          <Fact label={t("p01.detail.tenants")}>{fmt.number(a.tenantIds.length)}</Fact>
          <Fact label={t("p01.col.renewal")}>
            {a.renewalDate ? fmt.date(a.renewalDate) : t("p01.none")}
          </Fact>
          <Fact label={t("p01.detail.since")}>{fmt.date(a.createdAt)}</Fact>
        </dl>
      </Card>
      <Tabs
        ariaLabel={t("p01.tabs.label")}
        defaultValue="contacts"
        items={[
          {
            value: "contacts",
            label: t("p01.tab.contacts"),
            content: <ContactsTab accountId={a.id} />,
          },
          {
            value: "opportunities",
            label: t("p01.tab.opportunities"),
            content: <OpportunitiesTab accountId={a.id} />,
          },
          {
            value: "contracts",
            label: t("p01.tab.contracts"),
            content: <ContractsTab accountId={a.id} />,
          },
          { value: "notes", label: t("p01.tab.notes"), content: <NotesTab accountId={a.id} /> },
        ]}
      />
    </div>
  );
}
