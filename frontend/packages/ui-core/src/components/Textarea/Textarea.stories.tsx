import type { Meta, StoryObj } from "@storybook/react-vite";
import { useText } from "@nexus/i18n";
import { Textarea } from "./Textarea";

const meta: Meta<typeof Textarea> = {
  title: "Components/Textarea",
  component: Textarea,
};

export default meta;
type Story = StoryObj<typeof Textarea>;

function DefaultView() {
  const t = useText();
  return (
    <div className="max-w-sm space-y-4">
      <Textarea
        label={t("common.notes")}
        description={t("common.optional")}
        placeholder={t("common.details")}
      />
      <Textarea label={t("common.notes")} required error={t("common.required")} />
      <Textarea label={t("common.notes")} value={t("common.disabled")} disabled readOnly />
    </div>
  );
}

export const Default: Story = {
  render: () => <DefaultView />,
};
