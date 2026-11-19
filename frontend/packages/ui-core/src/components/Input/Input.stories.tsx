import type { Meta, StoryObj } from "@storybook/react-vite";
import { Search } from "lucide-react";
import { useText } from "@nexus/i18n";
import { Input } from "./Input";

const meta: Meta<typeof Input> = {
  title: "Components/Input",
  component: Input,
};

export default meta;
type Story = StoryObj<typeof Input>;

function DefaultView() {
  const t = useText();
  return (
    <div className="max-w-sm space-y-4">
      <Input
        label={t("common.search")}
        placeholder={t("common.search")}
        leading={<Search className="h-4 w-4" />}
      />
      <Input
        label={t("common.name")}
        description={t("common.optional")}
        placeholder={t("term.learner")}
      />
      <Input label={t("common.name")} required error={t("common.required")} />
      <Input label={t("common.status")} value={t("common.disabled")} disabled readOnly />
    </div>
  );
}

export const Default: Story = {
  render: () => <DefaultView />,
};
