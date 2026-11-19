import type { Meta, StoryObj } from "@storybook/react-vite";
import { useText } from "@nexus/i18n";
import { Badge } from "./Badge";

const meta: Meta<typeof Badge> = {
  title: "Components/Badge",
  component: Badge,
};

export default meta;
type Story = StoryObj<typeof Badge>;

function AllTonesView() {
  const t = useText();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="neutral">{t("common.inactive")}</Badge>
      <Badge tone="brand">{t("common.status")}</Badge>
      <Badge tone="info">{t("common.details")}</Badge>
      <Badge tone="success">{t("common.active")}</Badge>
      <Badge tone="warning">{t("common.pending")}</Badge>
      <Badge tone="danger">{t("common.error")}</Badge>
    </div>
  );
}

export const AllTones: Story = {
  render: () => <AllTonesView />,
};
