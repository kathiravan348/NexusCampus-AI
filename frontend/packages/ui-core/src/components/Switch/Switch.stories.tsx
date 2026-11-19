import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useText } from "@nexus/i18n";
import { Switch } from "./Switch";

const meta: Meta<typeof Switch> = {
  title: "Components/Switch",
  component: Switch,
};

export default meta;
type Story = StoryObj<typeof Switch>;

function DefaultView() {
  const t = useText();
  const [on, setOn] = useState(true);
  return (
    <div className="max-w-sm space-y-4">
      <Switch
        label={t("common.enabled")}
        description={t("common.optional")}
        checked={on}
        onCheckedChange={setOn}
      />
      <Switch label={t("common.status")} required error={t("common.required")} />
      <Switch label={t("common.disabled")} checked disabled />
    </div>
  );
}

export const Default: Story = {
  render: () => <DefaultView />,
};
