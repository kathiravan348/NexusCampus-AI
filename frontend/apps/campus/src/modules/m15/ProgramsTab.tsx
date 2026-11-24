import type { ClassGroup, ClassGroupKind, ProgramKind } from "@nexus/contracts";
import { formatNumber, isPseudoLocale, SOURCE_LOCALE, useText, type MessageKey } from "@nexus/i18n";
import { useClassGroups, usePrograms, useYearLevels } from "@nexus/services";
import { Badge, Button, Card, EmptyState, Skeleton } from "@nexus/ui-core";
import { Layers, Plus } from "lucide-react";
import { useState } from "react";
import { useRuntime } from "../../app/TenantRuntime";
import { AddClassGroupDialog } from "./AddClassGroupDialog";

const PROGRAM_KIND_KEY: Readonly<Record<ProgramKind, MessageKey>> = {
  early_years: "m15.programKind.earlyYears",
  school_stage: "m15.programKind.schoolStage",
  degree: "m15.programKind.degree",
  diploma: "m15.programKind.diploma",
  certificate: "m15.programKind.certificate",
  course: "m15.programKind.course",
  batch_program: "m15.programKind.batchProgram",
};

const CLASS_GROUP_KIND_KEY: Readonly<Record<ClassGroupKind, MessageKey>> = {
  section: "m15.classGroupKind.section",
  batch: "m15.classGroupKind.batch",
  cohort: "m15.classGroupKind.cohort",
  group: "m15.classGroupKind.group",
};

export interface ProgramsTabProps {
  readonly canManage: boolean;
  readonly online: boolean;
}

/** Programs with ordered year levels and class groups; unassigned batches sit under No year level. */
export function ProgramsTab({ canManage, online }: ProgramsTabProps) {
  const t = useText();
  const { locale } = useRuntime();
  const programs = usePrograms();
  const yearLevels = useYearLevels();
  const classGroups = useClassGroups();
  const [addOpen, setAddOpen] = useState(false);

  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const loading =
    (programs.isPending && !programs.data) ||
    (yearLevels.isPending && !yearLevels.data) ||
    (classGroups.isPending && !classGroups.data);
  const failed =
    (programs.isError && !programs.data) ||
    (yearLevels.isError && !yearLevels.data) ||
    (classGroups.isError && !classGroups.data);

  if (loading) {
    return (
      <div className="space-y-4" role="status" aria-label={t("common.loading")}>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (failed) {
    return (
      <EmptyState
        tone="error"
        title={t("m15.structure.error")}
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void programs.refetch();
              void yearLevels.refetch();
              void classGroups.refetch();
            }}
          >
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const programList = programs.data?.items ?? [];
  const yearLevelList = yearLevels.data?.items ?? [];
  const classGroupList = classGroups.data?.items ?? [];

  const renderGroupCards = (groups: readonly ClassGroup[]) => (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((group) => {
        const capacityText =
          group.capacity !== null
            ? t("m15.programs.capacity", { capacity: formatNumber(group.capacity, safeLocale) })
            : t("m15.programs.capacityOpen");
        return (
          <li
            key={group.id}
            className="min-w-0 space-y-1.5 rounded-md border border-border-default bg-bg-raised p-3"
          >
            <p className="break-words text-body font-medium text-text-primary">{group.name}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{group.code}</Badge>
              <Badge tone="info">{t(CLASS_GROUP_KIND_KEY[group.kind])}</Badge>
            </div>
            <p className="font-mono text-number-sm text-text-secondary tabular-nums">
              {capacityText}
            </p>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {!online && (
            <p id="m15-add-offline-hint" className="text-body-sm text-text-secondary">
              {t("common.offline")}
            </p>
          )}
          <Button
            onClick={() => setAddOpen(true)}
            disabled={!online}
            title={!online ? t("common.offline") : undefined}
            aria-describedby={!online ? "m15-add-offline-hint" : undefined}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("m15.programs.addClassGroup")}
          </Button>
        </div>
      )}

      {programList.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-6 w-6" />}
          title={t("m15.programs.empty")}
          description={t("m15.programs.emptyBody")}
        />
      ) : (
        <div className="space-y-4">
          {programList.map((program) => {
            const levels = yearLevelList
              .filter((yl) => yl.programId === program.id)
              .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
            const groups = classGroupList.filter((cg) => cg.programId === program.id);
            const levelIds = new Set(levels.map((yl) => yl.id));
            const unassigned = groups.filter(
              (cg) => cg.yearLevelId === null || !levelIds.has(cg.yearLevelId),
            );

            return (
              <Card
                key={program.id}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="break-words">{program.name}</span>
                    <Badge tone="brand">{t(PROGRAM_KIND_KEY[program.kind])}</Badge>
                    <Badge tone="neutral">{program.code}</Badge>
                  </span>
                }
              >
                {levels.length === 0 && unassigned.length === 0 ? (
                  <p className="text-body-sm text-text-muted">{t("m15.programs.noYearLevels")}</p>
                ) : (
                  <div className="space-y-5">
                    {levels.map((level) => {
                      const levelGroups = groups.filter((cg) => cg.yearLevelId === level.id);
                      return (
                        <section key={level.id} className="space-y-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-sans text-body font-semibold text-text-primary">
                              {level.name}
                            </h3>
                            <Badge tone="neutral">{level.code}</Badge>
                          </div>
                          {levelGroups.length === 0 ? (
                            <p className="text-body-sm text-text-muted">
                              {t("m15.programs.noClassGroups")}
                            </p>
                          ) : (
                            renderGroupCards(levelGroups)
                          )}
                        </section>
                      );
                    })}

                    {unassigned.length > 0 && (
                      <section className="space-y-2.5">
                        <h3 className="font-sans text-body font-semibold text-text-primary">
                          {t("m15.programs.noYearLevel")}
                        </h3>
                        {renderGroupCards(unassigned)}
                      </section>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {canManage && (
        <AddClassGroupDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          online={online}
          programs={programList}
          yearLevels={yearLevelList}
        />
      )}
    </div>
  );
}
