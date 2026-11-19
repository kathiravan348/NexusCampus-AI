import type { Meta, StoryObj } from "@storybook/react-vite";
import { Pencil, Search, Trash2, X } from "lucide-react";
import { useText } from "@nexus/i18n";
import { IconButton } from "./IconButton";

const meta: Meta<typeof IconButton> = {
  title: "Components/IconButton",
  component: IconButton,
};

export default meta;
type Story = StoryObj<typeof IconButton>;

function DefaultView() {
  const t = useText();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <IconButton
        variant="primary"
        aria-label={t("common.search")}
        icon={<Search className="h-4 w-4" />}
      />
      <IconButton
        variant="secondary"
        aria-label={t("common.edit")}
        icon={<Pencil className="h-4 w-4" />}
      />
      <IconButton variant="ghost" aria-label={t("common.close")} icon={<X className="h-4 w-4" />} />
      <IconButton
        variant="danger"
        aria-label={t("common.delete")}
        icon={<Trash2 className="h-4 w-4" />}
      />
    </div>
  );
}

function StatesView() {
  const t = useText();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <IconButton
        size="sm"
        variant="secondary"
        aria-label={t("common.edit")}
        icon={<Pencil className="h-3.5 w-3.5" />}
      />
      <IconButton
        size="md"
        variant="secondary"
        aria-label={t("common.edit")}
        icon={<Pencil className="h-4 w-4" />}
      />
      <IconButton
        size="lg"
        variant="secondary"
        aria-label={t("common.edit")}
        icon={<Pencil className="h-5 w-5" />}
      />
      <IconButton loading aria-label={t("common.loading")} icon={<Search className="h-4 w-4" />} />
      <IconButton
        disabled
        variant="secondary"
        aria-label={t("common.close")}
        icon={<X className="h-4 w-4" />}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <DefaultView />,
};

export const SizesAndStates: Story = {
  render: () => <StatesView />,
};
