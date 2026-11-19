import type { Meta, StoryObj } from "@storybook/react-vite";
import { useText } from "@nexus/i18n";
import { Card } from "../Card/Card";
import { Skeleton } from "./Skeleton";

const meta: Meta<typeof Skeleton> = {
  title: "Components/Skeleton",
  component: Skeleton,
};

export default meta;
type Story = StoryObj<typeof Skeleton>;

function DefaultView() {
  const t = useText();
  return (
    <Card className="max-w-sm">
      <div className="flex items-center gap-3" role="status" aria-label={t("common.loading")}>
        <Skeleton className="h-10 w-10 rounded-pill shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
      </div>
    </Card>
  );
}

export const Default: Story = {
  render: () => <DefaultView />,
};
