import type { Meta, StoryObj } from "@storybook/react-vite";
import { CircleAlert, Inbox } from "lucide-react";
import { useText } from "@nexus/i18n";
import { Button } from "../Button/Button";
import { EmptyState } from "./EmptyState";

const meta: Meta<typeof EmptyState> = {
  title: "Components/EmptyState",
  component: EmptyState,
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

function NeutralView() {
  const t = useText();
  return (
    <EmptyState
      icon={<Inbox className="h-6 w-6" />}
      description={t("common.notes")}
      action={<Button>{t("common.save")}</Button>}
    />
  );
}

function ErrorView() {
  const t = useText();
  return (
    <EmptyState
      tone="error"
      icon={<CircleAlert className="h-6 w-6" />}
      description={t("common.offline")}
      action={<Button variant="secondary">{t("common.retry")}</Button>}
    />
  );
}

export const Default: Story = {
  render: () => <NeutralView />,
};

export const ErrorState: Story = {
  render: () => <ErrorView />,
};
