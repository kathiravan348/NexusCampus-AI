import type { Meta, StoryObj } from "@storybook/react-vite";
import { useText } from "@nexus/i18n";
import { Button } from "../Button/Button";
import { ToastProvider } from "./ToastProvider";
import { useToast } from "./useToast";

const meta: Meta<typeof ToastProvider> = {
  title: "Components/Toast",
  component: ToastProvider,
};

export default meta;
type Story = StoryObj<typeof ToastProvider>;

function ToastDemo() {
  const t = useText();
  const { show } = useToast();

  return (
    <div className="flex flex-wrap gap-3">
      <Button
        variant="secondary"
        onClick={() =>
          show({ title: t("common.details"), description: t("common.notes"), tone: "info" })
        }
      >
        {t("common.details")}
      </Button>
      <Button
        variant="primary"
        onClick={() => show({ title: t("common.syncSynced"), tone: "success" })}
      >
        {t("common.save")}
      </Button>
      <Button
        variant="secondary"
        onClick={() => show({ title: t("common.syncPendingGeneric"), tone: "warning" })}
      >
        {t("common.pending")}
      </Button>
      <Button
        variant="danger"
        onClick={() =>
          show({ title: t("common.error"), description: t("common.retry"), tone: "danger" })
        }
      >
        {t("common.error")}
      </Button>
    </div>
  );
}

export const Default: Story = {
  render: () => (
    <ToastProvider>
      <ToastDemo />
    </ToastProvider>
  ),
};
