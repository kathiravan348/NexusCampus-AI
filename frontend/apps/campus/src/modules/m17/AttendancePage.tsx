import { useText } from "@nexus/i18n";
import {
  ApiRequestError,
  useAttendanceSessions,
  useClassGroups,
  useMe,
  useSaveAttendanceMark,
} from "@nexus/services";
import { EmptyState, Select } from "@nexus/ui-core";
import { useSearchParams } from "react-router";
import { LastSynced } from "../../app/LastSynced";
import { Forbidden } from "../../pages/Forbidden";
import { RollCall } from "./RollCall";
import { SessionList } from "./SessionList";

export function AttendancePage() {
  const t = useText();
  const [params, setParams] = useSearchParams();
  const me = useMe();
  const groups = useClassGroups();
  const groupParam = params.get("group");
  const sessions = useAttendanceSessions(groupParam);
  const selected = sessions.data?.items.find((row) => row.id === params.get("session"));
  const groupId = groupParam ?? selected?.classGroupId ?? "";
  const writer = useSaveAttendanceMark(selected?.id ?? null);

  if (
    [sessions.error, groups.error, me.error].some(
      (e) => e instanceof ApiRequestError && e.status === 403,
    )
  ) {
    return <Forbidden />;
  }
  const failed =
    (sessions.isError && !sessions.data) ||
    (groups.isError && !groups.data) ||
    (me.isError && !me.data);
  return (
    <div className="min-w-0 space-y-6">
      <header className="space-y-1">
        <h1 className="text-page-title font-semibold text-text-primary">{t("m17.nav.title")}</h1>
        <p className="text-body text-text-secondary">{t("m17.page.intro")}</p>
        <LastSynced updatedAt={sessions.dataUpdatedAt} />
      </header>
      {failed ? (
        <EmptyState tone="error" title={t("common.error")} />
      ) : !groups.data || !sessions.data || !me.data ? (
        <p role="status">{t("common.loading")}</p>
      ) : (
        <>
          <Select
            className="min-h-11"
            label={t("m17.page.classGroup")}
            placeholder={t("common.selectOption")}
            value={groupId}
            options={groups.data.items.map((row) => ({ value: row.id, label: row.name }))}
            onChange={(event) => setParams(event.target.value ? { group: event.target.value } : {})}
          />
          {groupId && (
            <SessionList
              sessions={sessions.data.items.filter((row) => row.classGroupId === groupId)}
              selectedId={selected?.id ?? null}
              onSelect={(id) => setParams({ group: groupId, session: id })}
            />
          )}
          {selected && (
            <RollCall
              key={selected.id}
              session={selected}
              canMark={me.data.permissions.includes("m17.attendance.mark")}
              writer={writer}
            />
          )}
        </>
      )}
    </div>
  );
}

export default AttendancePage;
