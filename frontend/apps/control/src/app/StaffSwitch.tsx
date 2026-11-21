import { useControlText } from "@nexus/i18n/control";
import { useControlServices, useDemoStaff } from "@nexus/services/control";
import { Select } from "@nexus/ui-core";
import { useNavigate } from "react-router";

/** Demo only: switch to another staff member to see Control with their roles. */
export function StaffSwitch() {
  const t = useControlText();
  const navigate = useNavigate();
  const { staffId, signIn } = useControlServices();
  const demo = useDemoStaff();
  const options = (demo.data?.items ?? []).map((s) => ({ value: s.id, label: s.displayName }));
  if (options.length === 0 || staffId === null) return null;
  return (
    <Select
      label={<span className="sr-only">{t("common.shell.switchPersona")}</span>}
      containerClassName="hidden w-40 md:block"
      options={options}
      value={staffId}
      onChange={(event) => {
        signIn(event.target.value);
        navigate("/", { replace: true });
      }}
    />
  );
}
