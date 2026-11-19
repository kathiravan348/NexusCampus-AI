import type { Meta, StoryObj } from "@storybook/react-vite";
import { SyncStatus } from "./SyncStatus";

const meta: Meta<typeof SyncStatus> = {
  title: "Components/SyncStatus",
  component: SyncStatus,
};

export default meta;
type Story = StoryObj<typeof SyncStatus>;

export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-3">
      <SyncStatus state="synced" lastSyncedAt="10:42" />
      <SyncStatus state="pending" pendingCount={3} />
      <SyncStatus state="syncing" />
      <SyncStatus state="conflict" conflictCount={2} />
      <SyncStatus state="offline" pendingCount={1} />
      <SyncStatus state="error" />
    </div>
  ),
};

export const Interactive: Story = {
  render: () => (
    <SyncStatus state="pending" pendingCount={4} lastSyncedAt="10:42" onClick={() => undefined} />
  ),
};
