import { getDirection, useText } from "@nexus/i18n";
import { ApiRequestError, useMe, useMessageThreads, useSendThreadMessage } from "@nexus/services";
import { Button, EmptyState, Tabs, type TabItem } from "@nexus/ui-core";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { LastSynced } from "../../app/LastSynced";
import { useRuntime } from "../../app/TenantRuntime";
import { Forbidden } from "../../pages/Forbidden";
import { MeetingsTab } from "./MeetingsTab";
import { NoticesTab } from "./NoticesTab";
import { ThreadList } from "./ThreadList";
import { ThreadView } from "./ThreadView";

export function MessagesPage() {
  const t = useText();
  const { locale } = useRuntime();
  const [params, setParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const me = useMe();

  const permissions = me.data?.permissions ?? [];
  const canReadMessages = permissions.includes("m24.messages.read");
  const canSendMessages = permissions.includes("m24.messages.send");
  const canReadNotices = permissions.includes("m24.notices.read");
  const canPublishNotices = permissions.includes("m24.notices.publish");
  const canReadMeetings = permissions.includes("m24.meetings.read");

  const threads = useMessageThreads(canReadMessages);
  const selectedThreadId = params.get("thread");
  const writer = useSendThreadMessage(selectedThreadId);

  if (me.error instanceof ApiRequestError && me.error.status === 403) {
    return <Forbidden />;
  }
  if (me.isError && !me.data) {
    return (
      <EmptyState
        tone="error"
        title={t("common.error")}
        action={
          <Button className="min-h-11" variant="secondary" onClick={() => void me.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  if (!me.data) {
    return <p role="status">{t("common.loading")}</p>;
  }

  function openThread(value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null) next.delete("thread");
    else next.set("thread", value);
    setParams(next);
  }

  const threadItems = threads.data?.items ?? [];
  const selectedThread = threadItems.find((row) => row.id === selectedThreadId);

  const messagesContent =
    threads.isError && !threads.data ? (
      <EmptyState
        tone="error"
        title={t("m24.threads.error")}
        action={
          <Button className="min-h-11" variant="secondary" onClick={() => void threads.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    ) : !threads.data ? (
      <p role="status">{t("common.loading")}</p>
    ) : selectedThreadId !== null ? (
      <div className="space-y-4">
        <Button className="min-h-11" variant="secondary" onClick={() => openThread(null)}>
          {t("m24.thread.back")}
        </Button>
        {selectedThread ? (
          <ThreadView
            key={selectedThread.id}
            thread={selectedThread}
            viewerPersonId={me.data.person.id}
            canSend={canSendMessages}
            writer={writer}
          />
        ) : (
          <EmptyState title={t("m24.thread.unavailable")} />
        )}
      </div>
    ) : (
      <ThreadList threads={threadItems} onOpen={openThread} />
    );

  const tabs: TabItem[] = [];
  if (canReadMessages) {
    tabs.push({
      value: "messages",
      label: t("m24.page.tabMessages"),
      content: messagesContent,
    });
  }
  if (canReadNotices) {
    tabs.push({
      value: "notices",
      label: t("m24.page.tabNotices"),
      content: <NoticesTab canPublish={canPublishNotices} />,
    });
  }
  if (canReadMeetings) {
    tabs.push({
      value: "meetings",
      label: t("m24.page.tabMeetings"),
      content: <MeetingsTab />,
    });
  }

  if (tabs.length === 0) {
    return <Forbidden />;
  }

  const currentTab =
    activeTab && tabs.some((tab) => tab.value === activeTab) ? activeTab : tabs[0]!.value;

  return (
    <div className="min-w-0 space-y-6 break-words">
      <header className="space-y-1">
        <h1 className="text-page-title font-semibold text-text-primary">{t("m24.nav.title")}</h1>
        <p className="text-body text-text-secondary">{t("m24.page.intro")}</p>
        <LastSynced updatedAt={threads.dataUpdatedAt} />
      </header>
      <div className="[&_[role=tablist]]:h-auto [&_[role=tablist]]:max-w-full [&_[role=tablist]]:flex-wrap [&_[role=tab]]:min-h-11 [&_[role=tab]]:whitespace-normal">
        <Tabs
          ariaLabel={t("m24.page.tabsLabel")}
          dir={getDirection(locale)}
          value={currentTab}
          onValueChange={setActiveTab}
          items={tabs}
        />
      </div>
    </div>
  );
}

export default MessagesPage;
