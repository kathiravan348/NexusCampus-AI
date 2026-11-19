import type { Permission, Role, ScopeKind } from "@nexus/contracts";
import { isKnownMessageKey, useText } from "@nexus/i18n";
import { ApiRequestError, useSaveRole } from "@nexus/services";
import { Badge, Button, Checkbox, CheckboxMatrix, Input, Modal, useToast } from "@nexus/ui-core";
import { useEffect, useState } from "react";
import { SCOPE_KEY } from "./accessShared";

export interface RoleEditorModalProps {
  /** `null` = a new custom role. */
  readonly role: Role | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly permissions: readonly Permission[];
  readonly online: boolean;
}

const KINDS: ScopeKind[] = ["group", "institution", "campus", "department", "class", "own"];
const COLUMN = "role";

/** Create or edit a custom role; system roles open read-only (M02, E-6). */
export function RoleEditorModal({
  role,
  open,
  onOpenChange,
  permissions,
  online,
}: RoleEditorModalProps) {
  const t = useText();
  const toast = useToast();
  const save = useSaveRole();
  const readOnly = role?.system ?? false;
  const [name, setName] = useState("");
  const [codes, setCodes] = useState<Set<string>>(new Set());
  const [kinds, setKinds] = useState<Set<ScopeKind>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(role?.name ?? "");
    setCodes(new Set(role?.permissions ?? []));
    setKinds(new Set(role?.allowedScopeKinds ?? ["institution"]));
    setError(null);
  }, [open, role]);

  const label = (p: Permission) =>
    isKnownMessageKey(p.descriptionKey) ? t(p.descriptionKey) : p.code;

  const rows = permissions.map((p) => ({
    id: p.code,
    label: label(p),
    description: <span className="font-mono">{p.code}</span>,
    group: p.moduleId,
    ...(p.sensitive ? { badge: <Badge tone="warning">{t("m02.role.sensitive")}</Badge> } : {}),
  }));

  const valid = name.trim().length > 0 && codes.size > 0 && kinds.size > 0;

  const onSave = async () => {
    if (!valid) {
      setError(t("m02.role.incomplete"));
      return;
    }
    try {
      await save.mutateAsync({
        ...(role ? { id: role.id } : {}),
        data: {
          name: name.trim(),
          permissions: permissions.map((p) => p.code).filter((c) => codes.has(c)),
          allowedScopeKinds: KINDS.filter((k) => kinds.has(k)),
        },
      });
      toast.show({ tone: "success", title: t("m02.role.saved") });
      onOpenChange(false);
    } catch (e) {
      const conflict = e instanceof ApiRequestError && e.error.code === "conflict";
      toast.show({
        tone: "danger",
        title: t(conflict ? "m02.role.systemReadOnly" : "m02.access.saveFailed"),
      });
    }
  };

  const title = readOnly
    ? t("m02.role.viewTitle", { name: role?.name ?? "" })
    : t(role ? "m02.role.editTitle" : "m02.role.newTitle");

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={title}
      description={readOnly ? t("m02.role.systemReadOnly") : undefined}
      footer={
        readOnly ? (
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button loading={save.isPending} disabled={!online} onClick={() => void onSave()}>
              {t("common.save")}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-5">
        <Input
          label={t("m02.role.name")}
          required
          readOnly={readOnly}
          value={name}
          onChange={(e) => setName(e.target.value)}
          containerClassName="max-w-md"
        />
        <fieldset className="space-y-2">
          <legend className="text-body font-medium text-text-primary">
            {t("m02.role.scopeKinds")}
          </legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {KINDS.map((k) => (
              <Checkbox
                key={k}
                label={t(SCOPE_KEY[k])}
                checked={kinds.has(k)}
                disabled={readOnly}
                onCheckedChange={(next) =>
                  setKinds((prev) => {
                    const out = new Set(prev);
                    if (next === true) out.add(k);
                    else out.delete(k);
                    return out;
                  })
                }
              />
            ))}
          </div>
        </fieldset>
        <CheckboxMatrix
          caption={t("m02.role.permissions")}
          rows={rows}
          columns={[{ id: COLUMN, label: name.trim() || t("m02.role.allowed") }]}
          readOnly={readOnly}
          isChecked={(code) => codes.has(code)}
          onCheckedChange={(code, _col, next) =>
            setCodes((prev) => {
              const out = new Set(prev);
              if (next) out.add(code);
              else out.delete(code);
              return out;
            })
          }
        />
        {error && (
          <p role="alert" className="text-body-sm font-medium text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
