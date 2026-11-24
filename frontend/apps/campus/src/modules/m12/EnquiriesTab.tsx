import { EnquiryStatusSchema, type EnquiryStatus } from "@nexus/contracts";
import { formatDate, isPseudoLocale, SOURCE_LOCALE, useText, type MessageKey } from "@nexus/i18n";
import { ApiRequestError, useEnquiries, usePrograms } from "@nexus/services";
import { Badge, Button, EmptyState, Select, Skeleton } from "@nexus/ui-core";
import { useState } from "react";
import { useRuntime } from "../../app/TenantRuntime";
import { AddEnquiryDialog, ENQUIRY_SOURCE_KEYS } from "./AddEnquiryDialog";

const ENQUIRY_STATUS_KEYS: Readonly<Record<EnquiryStatus, MessageKey>> = {
  new: "m12.status.new",
  contacted: "m12.status.contacted",
  visit_booked: "m12.status.visitBooked",
  applied: "m12.status.applied",
  lost: "m12.status.lost",
};

export function EnquiriesTab({ canManage, online }: { canManage: boolean; online: boolean }) {
  const t = useText();
  const { locale } = useRuntime();
  const displayLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const [status, setStatus] = useState<EnquiryStatus | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const enquiries = useEnquiries(status);
  const programs = usePrograms();
  const options = [
    { value: "", label: t("m12.enquiries.all") },
    ...EnquiryStatusSchema.options.map((value) => ({
      value,
      label: t(ENQUIRY_STATUS_KEYS[value]),
    })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Select
          label={t("m12.enquiries.filter")}
          options={options}
          value={status ?? ""}
          onChange={(event) => {
            setExpanded(null);
            setStatus(EnquiryStatusSchema.safeParse(event.target.value).data ?? null);
          }}
        />
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            {!online && (
              <span className="text-body-sm text-text-secondary">{t("common.offline")}</span>
            )}
            <Button disabled={!online} onClick={() => setAdding(true)}>
              {t("m12.add.title")}
            </Button>
          </div>
        )}
      </div>
      {enquiries.isError ? (
        <EmptyState
          tone="error"
          title={t(
            enquiries.error instanceof ApiRequestError &&
              ["forbidden", "module_disabled"].includes(enquiries.error.error.code)
              ? "common.shell.forbiddenTitle"
              : "m12.page.error",
          )}
          action={
            <Button variant="secondary" onClick={() => void enquiries.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : !enquiries.data ? (
        <Skeleton className="h-32 w-full" />
      ) : enquiries.data.items.length === 0 ? (
        <EmptyState title={t("m12.enquiries.empty")} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {enquiries.data.items.map((row) => {
            const open = expanded === row.id;
            const program = programs.data?.items.find((item) => item.id === row.programId);
            return (
              <li
                key={row.id}
                className="min-w-0 space-y-2 break-words rounded-md border border-border-default bg-bg-raised p-4"
              >
                <Button
                  variant="secondary"
                  type="button"
                  aria-expanded={open}
                  className="h-auto w-full justify-start whitespace-normal text-start"
                  onClick={() => setExpanded(open ? null : row.id)}
                >
                  {row.learnerName}
                </Button>
                <p>{t("m12.enquiries.contact", { name: row.contactName })}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">{t(ENQUIRY_STATUS_KEYS[row.status])}</Badge>
                  <span>{t(ENQUIRY_SOURCE_KEYS[row.source])}</span>
                </div>
                {program && <p>{program.name}</p>}
                {row.followUpOn && (
                  <p>
                    {t("m12.enquiries.followUp", {
                      date: formatDate(row.followUpOn, { locale: displayLocale, timeZone: "UTC" }),
                    })}
                  </p>
                )}
                {row.status === "lost" && <p>{row.lostReason}</p>}
                {open && (
                  <div className="space-y-1 border-t border-border-default pt-2">
                    {row.contactPhone && <p dir="auto">{row.contactPhone}</p>}
                    {row.contactEmail && <p dir="auto">{row.contactEmail}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canManage && adding && (
        <AddEnquiryDialog
          online={online}
          onOpenChange={setAdding}
          onCreated={() => setStatus(null)}
          programs={programs.data?.items ?? []}
        />
      )}
    </div>
  );
}
