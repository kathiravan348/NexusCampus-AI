import type { Meta, StoryObj } from "@storybook/react-vite";
import { useText } from "@nexus/i18n";
import { JobSteps, type JobStep } from "./JobSteps";

/** Text comes from the caller; the story uses platform words so pseudo-locale and RTL toggles apply. */
function Demo({ steps }: { readonly steps: readonly JobStep[] }) {
  const t = useText();
  return (
    <JobSteps
      ariaLabel={t("common.details")}
      statusLabels={{
        pending: t("common.pending"),
        running: t("common.syncSyncing"),
        done: t("common.active"),
        failed: t("common.error"),
      }}
      steps={steps}
    />
  );
}

const meta: Meta<typeof Demo> = {
  title: "Control/JobSteps",
  component: Demo,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof Demo>;

export const Running: Story = {
  args: {
    steps: [
      { id: "1", label: "Create tenant", status: "done" },
      { id: "2", label: "Create keys", status: "done" },
      { id: "3", label: "Apply institution profile", status: "running" },
      { id: "4", label: "Seed", status: "pending" },
      { id: "5", label: "Invite owner", status: "pending" },
    ],
  },
};

export const Failed: Story = {
  args: {
    steps: [
      { id: "1", label: "Pre-flight check", status: "done" },
      { id: "2", label: "Encrypted export", status: "failed" },
      { id: "3", label: "Transfer", status: "pending" },
    ],
  },
};

export const AllDone: Story = {
  args: {
    steps: [
      { id: "1", label: "Freeze writes", status: "done" },
      { id: "2", label: "Export ready for the institution to download", status: "done" },
      { id: "3", label: "Keys destroyed", status: "done" },
      { id: "4", label: "Certificate issued", status: "done" },
    ],
  },
};

export const LongLabels: Story = {
  args: {
    steps: [
      {
        id: "1",
        label:
          "Apply the institution type profile, academic calendar, terminology pack and default theme for the new tenant",
        status: "running",
      },
      { id: "2", label: "Invite the institution owner by email", status: "pending" },
    ],
  },
};

export const Empty: Story = { args: { steps: [] } };
