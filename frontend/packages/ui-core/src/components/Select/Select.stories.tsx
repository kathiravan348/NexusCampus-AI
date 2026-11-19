import type { Meta, StoryObj } from "@storybook/react-vite";
import { useText } from "@nexus/i18n";
import { Select } from "./Select";

const meta: Meta<typeof Select> = {
  title: "Components/Select",
  component: Select,
};

export default meta;
type Story = StoryObj<typeof Select>;

function DefaultView() {
  const t = useText();
  const options = [
    { value: "active", label: t("common.active"), group: t("common.status") },
    { value: "pending", label: t("common.pending"), group: t("common.status") },
    { value: "inactive", label: t("common.inactive") },
  ];
  return (
    <div className="max-w-sm space-y-4">
      <Select
        label={t("common.status")}
        placeholder={t("common.selectOption")}
        description={t("common.optional")}
        options={options}
      />
      <Select
        label={t("common.status")}
        required
        error={t("common.required")}
        placeholder={t("common.selectOption")}
        options={options}
      />
      <Select label={t("common.status")} defaultValue="active" disabled options={options} />
    </div>
  );
}

export const Default: Story = {
  render: () => <DefaultView />,
};
