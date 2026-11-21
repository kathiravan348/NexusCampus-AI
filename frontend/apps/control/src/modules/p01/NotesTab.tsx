import { useControlText } from "@nexus/i18n/control";
import {
  useAccountNotes,
  useAddAccountNote,
  useStaffCan,
  useStaffDirectory,
} from "@nexus/services/control";
import { Button, EmptyState, Skeleton, Textarea, useToast } from "@nexus/ui-core";
import { useState } from "react";
import { useControlFormat } from "../../app/format";

const MAX_NOTE = 2000;

/** Internal notes about the account; staff with `ctl.account.manage` add new ones. */
export function NotesTab({ accountId }: { readonly accountId: string }) {
  const t = useControlText();
  const fmt = useControlFormat();
  const toast = useToast();
  const can = useStaffCan();
  const names = useStaffDirectory();
  const notes = useAccountNotes(accountId);
  const add = useAddAccountNote();
  const [draft, setDraft] = useState("");
  const canWrite = can("ctl.account.manage");
  const body = draft.trim();

  return (
    <div className="space-y-4">
      {canWrite ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!body) return;
            add.mutate(
              { accountId, body },
              {
                onSuccess: () => {
                  setDraft("");
                  toast.show({ tone: "success", title: t("p01.notes.added") });
                },
                onError: () => toast.show({ tone: "danger", title: t("p01.notes.failed") }),
              },
            );
          }}
        >
          <Textarea
            label={t("p01.notes.label")}
            description={t("p01.notes.hint")}
            value={draft}
            maxLength={MAX_NOTE}
            rows={3}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button type="submit" disabled={!body || add.isPending}>
            {t("p01.notes.add")}
          </Button>
        </form>
      ) : (
        <p className="text-body-sm text-text-secondary">{t("p01.notes.readOnly")}</p>
      )}
      {notes.isPending ? (
        <Skeleton className="h-24" />
      ) : notes.isError ? (
        <EmptyState tone="error" />
      ) : notes.data.items.length === 0 ? (
        <EmptyState description={t("p01.notes.empty")} />
      ) : (
        <ul className="space-y-3">
          {[...notes.data.items]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((n) => (
              <li key={n.id} className="rounded-md border border-border-default bg-bg-surface p-3">
                <p className="whitespace-pre-wrap text-body text-text-primary">{n.body}</p>
                <p className="mt-1 text-body-sm text-text-secondary">
                  {t("p01.notes.byline", {
                    name: names.get(n.authorStaffId) ?? t("p01.none"),
                    date: fmt.date(n.createdAt),
                  })}
                </p>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
