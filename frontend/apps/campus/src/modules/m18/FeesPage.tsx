import { getDirection, useText } from "@nexus/i18n";
import {
  ApiRequestError,
  useAiSettings,
  useEntitlements,
  useFeeInvoices,
  useMe,
  useRecordFeePayment,
} from "@nexus/services";
import { Button, EmptyState, Skeleton, Tabs, type TabItem } from "@nexus/ui-core";
import { Plus, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { LastSynced } from "../../app/LastSynced";
import { useOnline } from "../../app/RouteGuard";
import { useRuntime } from "../../app/TenantRuntime";
import { Forbidden } from "../../pages/Forbidden";
import { AssistPanel } from "../m11/AssistPanel";
import { InvoicesTab } from "./InvoicesTab";
import { PaymentsTab } from "./PaymentsTab";
import { PlansTab } from "./PlansTab";
import { RecordPaymentDialog } from "./RecordPaymentDialog";

function isForbidden(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 403;
}

/**
 * Fees & payments (M18, L2): invoices, payment receipts (including offline-queued manual receipts)
 * and staff-only fee plans, concessions and refunds. Guardians and learners see family rows only.
 */
export function FeesPage() {
  const t = useText();
  const { locale } = useRuntime();
  const online = useOnline();
  const me = useMe();
  const entitlements = useEntitlements();
  const invoices = useFeeInvoices(null, null);
  const recordPayment = useRecordFeePayment();
  const [assistOpen, setAssistOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);

  const m11Entitled =
    entitlements.data?.items.some((entry) => entry.moduleId === "M11" && entry.enabled) ?? false;
  const canAskAssist = me.data?.permissions.includes("m11.assist.use") ?? false;
  const aiSettings = useAiSettings(online && m11Entitled && canAskAssist);

  const pendingInvoiceIds = useMemo(
    () => new Set(recordPayment.pendingPayments.flatMap((item) => item.input.invoiceIds)),
    [recordPayment.pendingPayments],
  );

  if (invoices.isError && !invoices.data && isForbidden(invoices.error)) {
    return <Forbidden />;
  }

  if ((me.isPending && !me.data) || (invoices.isPending && !invoices.data)) {
    return (
      <div className="space-y-4" role="status" aria-label={t("common.loading")}>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (me.isError && !me.data) {
    return (
      <EmptyState
        tone="error"
        title={t("m18.page.error")}
        action={
          <Button variant="secondary" onClick={() => void me.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const permissions = new Set(me.data.permissions);
  const canReadPlans = permissions.has("m18.fees.read");
  const canManage = permissions.has("m18.fees.manage");
  const showAssist = online && m11Entitled && canAskAssist && (aiSettings.data?.enabled ?? false);

  const tabs: TabItem[] = [
    {
      value: "invoices",
      label: t("m18.page.tabInvoices"),
      content: <InvoicesTab pendingInvoiceIds={pendingInvoiceIds} />,
    },
    {
      value: "payments",
      label: t("m18.page.tabPayments"),
      content: <PaymentsTab pendingPayments={recordPayment.pendingPayments} />,
    },
    ...(canReadPlans
      ? [
          {
            value: "plans",
            label: t("m18.page.tabPlans"),
            content: <PlansTab />,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="font-sans text-page-title font-semibold text-text-primary">
            {t("m18.nav.title")}
          </h1>
          <p className="text-body text-text-secondary">{t("m18.page.intro")}</p>
          <LastSynced updatedAt={invoices.dataUpdatedAt} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <Button size="sm" onClick={() => setRecordOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("m18.page.recordPayment")}
            </Button>
          )}
          {showAssist && (
            <Button variant="secondary" size="sm" onClick={() => setAssistOpen(true)}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {t("m18.page.askAssist")}
            </Button>
          )}
        </div>
      </header>

      {recordPayment.replayFailed && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-body-sm font-medium text-danger-text"
        >
          {t("m18.payment.replayFailed")}
        </p>
      )}

      <div className="min-w-0 [&_[role=tablist]]:h-auto [&_[role=tablist]]:max-w-full [&_[role=tablist]]:flex-wrap [&_[role=tab]]:whitespace-normal">
        <Tabs
          ariaLabel={t("m18.page.tabsLabel")}
          dir={getDirection(locale)}
          defaultValue="invoices"
          items={tabs}
        />
      </div>

      {canManage && (
        <RecordPaymentDialog
          open={recordOpen}
          onOpenChange={setRecordOpen}
          online={online}
          invoices={invoices.data?.items ?? []}
          recordPayment={recordPayment}
        />
      )}

      {showAssist && <AssistPanel open={assistOpen} onOpenChange={setAssistOpen} />}
    </div>
  );
}

export default FeesPage;
