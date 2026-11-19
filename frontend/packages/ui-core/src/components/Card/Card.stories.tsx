import type { Meta, StoryObj } from "@storybook/react-vite";
import { useText } from "@nexus/i18n";
import { Badge } from "../Badge/Badge";
import { Button } from "../Button/Button";
import { Card } from "./Card";

const meta: Meta<typeof Card> = {
  title: "Components/Card",
  component: Card,
};

export default meta;
type Story = StoryObj<typeof Card>;

function DefaultView() {
  const t = useText();
  return (
    <div className="max-w-md space-y-4">
      <Card
        title={t("common.details")}
        actions={
          <Button size="sm" variant="secondary">
            {t("common.edit")}
          </Button>
        }
        footer={
          <div className="flex items-center justify-between gap-2">
            <Badge tone="success">{t("common.active")}</Badge>
            <Button size="sm">{t("common.save")}</Button>
          </div>
        }
      >
        <p className="text-body text-text-secondary">{t("term.learners")}</p>
      </Card>
      <Card>
        <p className="text-body-sm text-text-muted">{t("common.empty")}</p>
      </Card>
    </div>
  );
}

export const Default: Story = {
  render: () => <DefaultView />,
};
