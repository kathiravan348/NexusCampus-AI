import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useText } from "@nexus/i18n";
import { Badge } from "../Badge/Badge";
import { CheckboxMatrix, type CheckboxMatrixRow } from "./CheckboxMatrix";

const meta: Meta<typeof CheckboxMatrix> = {
  title: "Components/CheckboxMatrix",
  component: CheckboxMatrix,
};

export default meta;
type Story = StoryObj<typeof CheckboxMatrix>;

const COLUMNS = [
  { id: "owner", label: "Owner", readOnly: true },
  { id: "teacher", label: "Teacher", readOnly: true },
  { id: "custom", label: "Front desk" },
];

function useRows(): CheckboxMatrixRow[] {
  const t = useText();
  return [
    { id: "m01.institution.read", label: "m01.institution.read", group: "M01" },
    { id: "m01.institution.manage", label: "m01.institution.manage", group: "M01" },
    { id: "m02.user.read", label: "m02.user.read", group: "M02" },
    {
      id: "m02.person.read_restricted",
      label: "m02.person.read_restricted",
      group: "M02",
      badge: <Badge tone="warning">{t("common.restricted")}</Badge>,
    },
  ];
}

function MatrixView({ readOnly = false }: { readOnly?: boolean }) {
  const t = useText();
  const rows = useRows();
  const [checked, setChecked] = React.useState(
    () =>
      new Set([
        "m01.institution.read:owner",
        "m01.institution.manage:owner",
        "m02.user.read:owner",
        "m02.person.read_restricted:owner",
        "m01.institution.read:teacher",
        "m02.user.read:teacher",
        "m01.institution.read:custom",
      ]),
  );
  return (
    <CheckboxMatrix
      caption={t("common.details")}
      rows={rows}
      columns={COLUMNS}
      readOnly={readOnly}
      isChecked={(r, c) => checked.has(`${r}:${c}`)}
      onCheckedChange={(r, c, next) =>
        setChecked((prev) => {
          const out = new Set(prev);
          if (next) out.add(`${r}:${c}`);
          else out.delete(`${r}:${c}`);
          return out;
        })
      }
    />
  );
}

export const Default: Story = { render: () => <MatrixView /> };
export const ReadOnly: Story = { render: () => <MatrixView readOnly /> };
