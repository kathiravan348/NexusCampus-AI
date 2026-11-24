import { IssuedDocumentKindSchema } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { ApiRequestError, useIssuedDocuments, useMe } from "@nexus/services";
import { Button, EmptyState, Select, Skeleton } from "@nexus/ui-core";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { LastSynced } from "../../app/LastSynced";
import { useOnline } from "../../app/RouteGuard";
import { Forbidden } from "../../pages/Forbidden";
import { useLearnerNames } from "../m18/InvoicesTab";
import { DocumentList } from "./DocumentList";
import { DocumentView } from "./DocumentView";

export function DocumentsPage() {
  const t = useText();
  const online = useOnline();
  const me = useMe();
  const documents = useIssuedDocuments();
  const names = useLearnerNames(true);
  const [learnerId, setLearnerId] = useState("");
  const [kind, setKind] = useState("");
  const [params, setParams] = useSearchParams();
  const id = params.get("document");
  if ([me.error, documents.error].some((e) => e instanceof ApiRequestError && e.status === 403)) {
    return <Forbidden />;
  }

  const staff = !!me.data?.permissions.includes("m23.documents.read");
  const items = documents.data?.items ?? [];
  const learners = new Set(names.keys());
  for (const row of items) {
    if (row.learnerId !== null) learners.add(row.learnerId);
  }
  const selected = items.find((row) => row.id === id);
  function openDocument(value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null) next.delete("document");
    else next.set("document", value);
    setParams(next);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-page-title font-semibold text-text-primary">{t("m23.nav.title")}</h1>
        <p className="text-body text-text-secondary">{t("m23.page.intro")}</p>
        <LastSynced updatedAt={documents.dataUpdatedAt} />
      </header>
      {(me.isError && !me.data) || (documents.isError && !documents.data) ? (
        <EmptyState
          tone="error"
          title={t("m23.page.failed")}
          action={
            <Button
              className="min-h-11"
              onClick={() => {
                void me.refetch();
                void documents.refetch();
              }}
            >
              {t("common.retry")}
            </Button>
          }
        />
      ) : !online && (!me.data || !documents.data) ? (
        <EmptyState title={t("common.offline")} />
      ) : !me.data || !documents.data ? (
        <div role="status" aria-label={t("common.loading")}>
          <Skeleton className="h-24 w-full" />
        </div>
      ) : id !== null ? (
        <div className="space-y-4">
          <Button className="min-h-11" variant="secondary" onClick={() => openDocument(null)}>
            {t("m23.view.back")}
          </Button>
          {selected ? (
            <DocumentView
              key={selected.id}
              document={selected}
              showReason={staff}
              canRevoke={me.data.permissions.includes("m23.documents.issue")}
            />
          ) : (
            <EmptyState title={t("m23.view.unavailable")} />
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {(staff || learners.size > 1) && (
              <Select
                className="min-h-11"
                label={t("m23.filter.learner")}
                value={learnerId}
                options={[
                  { value: "", label: t("m23.filter.allLearners") },
                  ...Array.from(learners, (value) => ({
                    value,
                    label: names.get(value) ?? t("term.learner"),
                  })),
                ]}
                onChange={(event) => setLearnerId(event.target.value)}
              />
            )}
            {staff && (
              <Select
                className="min-h-11"
                label={t("m23.filter.kind")}
                value={kind}
                options={[
                  { value: "", label: t("m23.filter.allKinds") },
                  ...IssuedDocumentKindSchema.options.map((value) => ({
                    value,
                    label: t(`m23.kind.${value}`),
                  })),
                ]}
                onChange={(event) => setKind(event.target.value)}
              />
            )}
          </div>
          <DocumentList
            documents={items.filter(
              (row) =>
                (!learnerId || row.learnerId === learnerId) &&
                (!staff || !kind || row.kind === kind),
            )}
            names={names}
            onOpen={openDocument}
          />
        </>
      )}
    </div>
  );
}

export default DocumentsPage;
