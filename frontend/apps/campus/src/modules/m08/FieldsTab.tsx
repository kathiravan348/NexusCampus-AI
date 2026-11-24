import {
  ConfigEntitySchema,
  CustomFieldTypeSchema,
  type ConfigEntity,
  type CustomFieldDefinition,
  type CustomFieldType,
} from "@nexus/contracts";
import { useText, type MessageKey } from "@nexus/i18n";
import { useCustomFields } from "@nexus/services";
import { Badge, Button, Card, EmptyState, Select, Skeleton } from "@nexus/ui-core";
import { useState } from "react";
import { useRuntime } from "../../app/TenantRuntime";
import { AddFieldDialog } from "./AddFieldDialog";

const FIELD_TYPE_KEYS = {
  text: "m08.type.text",
  long_text: "m08.type.longText",
  number: "m08.type.number",
  date: "m08.type.date",
  choice: "m08.type.choice",
  multi_choice: "m08.type.multiChoice",
  boolean: "m08.type.boolean",
  email: "m08.type.email",
  phone: "m08.type.phone",
} satisfies Record<CustomFieldType, MessageKey>;

interface FieldsTabProps {
  readonly entity: ConfigEntity;
  readonly onEntityChange: (entity: ConfigEntity) => void;
  readonly canManage: boolean;
  readonly online: boolean;
}

export function FieldsTab({ entity, onEntityChange, canManage, online }: FieldsTabProps) {
  const t = useText();
  const { locale } = useRuntime();
  const fields = useCustomFields(entity);
  const [adding, setAdding] = useState(false);
  const sorted = [...(fields.data?.items ?? [])].sort((a, b) => a.order - b.order);
  const archived = sorted.filter((field) => field.archived);

  function renderList(rows: CustomFieldDefinition[]) {
    return (
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((field) => (
          <li key={field.id} className="min-w-0">
            <Card
              title={
                <span className="break-words">
                  {field.label[locale] ?? Object.values(field.label)[0]}
                </span>
              }
            >
              <div className="flex flex-wrap gap-2">
                <Badge tone="neutral">{t(FIELD_TYPE_KEYS[field.type])}</Badge>
                <Badge tone="info">
                  {t(field.required ? "m08.field.required" : "m08.field.optional")}
                </Badge>
                {field.sensitive && <Badge tone="warning">{t("m08.field.sensitive")}</Badge>}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Select
          label={t("m08.field.entity")}
          value={entity}
          options={ConfigEntitySchema.options.map((value) => ({
            value,
            label: t(`m08.entity.${value}`),
          }))}
          onChange={(event) => onEntityChange(ConfigEntitySchema.parse(event.target.value))}
        />
        {canManage && (
          <div className="space-y-1">
            {!online && (
              <p id="m08-offline" className="text-body-sm text-text-secondary">
                {t("common.offline")}
              </p>
            )}
            <Button
              disabled={!online}
              aria-describedby={online ? undefined : "m08-offline"}
              onClick={() => setAdding(true)}
            >
              {t("m08.field.add")}
            </Button>
          </div>
        )}
      </div>
      {fields.data ? (
        sorted.length === 0 ? (
          <EmptyState title={t("m08.field.empty")} />
        ) : (
          <>
            {renderList(sorted.filter((field) => !field.archived))}
            {archived.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-semibold text-text-primary">{t("m08.field.archived")}</h2>
                {renderList(archived)}
              </section>
            )}
          </>
        )
      ) : fields.isError ? (
        <EmptyState
          tone="error"
          title={t("common.error")}
          action={
            <Button variant="secondary" onClick={() => void fields.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : (
        <Skeleton className="h-24 w-full" />
      )}
      {canManage && adding && (
        <AddFieldDialog
          entity={entity}
          typeOptions={CustomFieldTypeSchema.options.map((value) => ({
            value,
            label: t(FIELD_TYPE_KEYS[value]),
          }))}
          online={online}
          onClose={() => setAdding(false)}
          onCreated={onEntityChange}
        />
      )}
    </div>
  );
}
