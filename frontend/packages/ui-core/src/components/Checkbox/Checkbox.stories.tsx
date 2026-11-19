import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useText } from "@nexus/i18n";
import { Checkbox } from "./Checkbox";

const meta: Meta<typeof Checkbox> = {
  title: "Components/Checkbox",
  component: Checkbox,
};

export default meta;
type Story = StoryObj<typeof Checkbox>;

function DefaultView() {
  const t = useText();
  const [checked, setChecked] = useState<boolean | "indeterminate">(true);
  return (
    <div className="max-w-sm space-y-4">
      <Checkbox
        label={t("common.enabled")}
        description={t("common.optional")}
        checked={checked}
        onCheckedChange={setChecked}
      />
      <Checkbox label={t("common.pending")} checked="indeterminate" onCheckedChange={() => {}} />
      <Checkbox label={t("common.status")} required error={t("common.required")} />
      <Checkbox label={t("common.disabled")} checked disabled />
    </div>
  );
}

export const Default: Story = {
  render: () => <DefaultView />,
};
