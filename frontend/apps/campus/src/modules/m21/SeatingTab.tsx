import { useText } from "@nexus/i18n";
import {
  ApiRequestError,
  useExamPapers,
  useExamSeats,
  useGenerateSeatPlan,
  useRooms,
} from "@nexus/services";
import { Button, Card, Modal, Select } from "@nexus/ui-core";
import { useState } from "react";
import { useOnline } from "../../app/RouteGuard";
import { useLearnerNames } from "../m18/InvoicesTab";
import {
  paperTime,
  readState,
  useExamFormats,
  useExamSelection,
  usePaperNames,
} from "./ScheduleTab";

export function SeatingTab({ canManage }: { readonly canManage: boolean }) {
  const t = useText();
  const online = useOnline();
  const { exams, items, selected, choose } = useExamSelection();
  const papers = useExamPapers(selected?.id ?? null);
  const [choice, setChoice] = useState("");
  const paper = papers.data?.items.find((row) => row.id === choice) ?? papers.data?.items[0];
  const seats = useExamSeats(paper?.id ?? null);
  const names = usePaperNames();
  const rooms = useRooms();
  const learners = useLearnerNames(true);
  const { day } = useExamFormats();
  const plan = useGenerateSeatPlan(paper?.id ?? null);
  const [confirmPaper, setConfirmPaper] = useState<string | null>(null);
  const examState = readState(exams);
  if (examState || !selected) return <p role="status">{t(examState ?? "m21.schedule.empty")}</p>;
  const paperState = readState(papers);
  const seatState = readState(seats);
  const roomNames = new Map(rooms.data?.items.map((room) => [room.id, room.name]));
  const seatRows = seats.data?.items ?? [];
  const roomIds = [...new Set([...(paper?.roomIds ?? []), ...seatRows.map((seat) => seat.roomId)])];
  const error = plan.error;
  const errorKey =
    error instanceof ApiRequestError && error.status === 403
      ? "common.shell.forbiddenTitle"
      : error instanceof ApiRequestError &&
          error.error.details?.some((detail) => detail.path === "roomIds")
        ? "m21.seating.capacity"
        : error instanceof ApiRequestError && error.status === 409
          ? "m21.seating.closed"
          : "common.error";

  return (
    <section className="min-w-0 space-y-4 break-words">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          className="min-h-11"
          label={t("m21.tickets.exam")}
          value={selected.id}
          options={items.map((exam) => ({ value: exam.id, label: exam.name }))}
          onChange={(event) => {
            choose(event.target.value);
            setChoice("");
            setConfirmPaper(null);
            plan.reset();
          }}
        />
        {paper && (
          <Select
            className="min-h-11"
            label={t("m21.revaluation.paper")}
            value={paper.id}
            options={(papers.data?.items ?? []).map((row) => ({
              value: row.id,
              label: t("m21.seating.paperOption", {
                name: names.get(row.subjectOfferingId) ?? t("m21.revaluation.paper"),
                date: day(row.date),
                time: paperTime(row, t),
              }),
            }))}
            onChange={(event) => {
              setChoice(event.target.value);
              setConfirmPaper(null);
              plan.reset();
            }}
          />
        )}
      </div>
      {paperState || !paper ? (
        <p role="status">{t(paperState ?? "m21.schedule.noPapers")}</p>
      ) : (
        <>
          {canManage && (
            <div className="space-y-2">
              <Button
                className="min-h-11"
                disabled={!online || plan.isPending}
                onClick={() => {
                  plan.reset();
                  setConfirmPaper(paper.id);
                }}
              >
                {t("m21.seating.generate")}
              </Button>
              {!online && <p role="status">{t("m21.seating.offline")}</p>}
              {plan.isError && <p role="alert">{t(errorKey)}</p>}
              {plan.isSuccess && <p role="status">{t("m21.seating.generated")}</p>}
              <Modal
                open={confirmPaper === paper.id}
                onOpenChange={(open) => {
                  if (!open) setConfirmPaper(null);
                }}
                title={t("m21.seating.generate")}
                description={t("m21.seating.replace")}
              >
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="min-h-11"
                    variant="secondary"
                    onClick={() => setConfirmPaper(null)}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    className="min-h-11"
                    disabled={!online || plan.isPending}
                    onClick={() => {
                      setConfirmPaper(null);
                      plan.mutate();
                    }}
                  >
                    {t("m21.seating.generate")}
                  </Button>
                </div>
                {!online && <p role="status">{t("m21.seating.offline")}</p>}
              </Modal>
            </div>
          )}
          {seatState || !seats.data?.items.length ? (
            <p role="status">{t(seatState ?? "m21.seating.empty")}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {roomIds.map((id) => {
                const rows = seatRows.filter((seat) => seat.roomId === id);
                if (!rows.length) return null;
                return (
                  <Card key={id} title={roomNames.get(id) ?? t("m21.seating.room")}>
                    <ul className="space-y-1">
                      {rows.map((row) => (
                        <li key={row.id} className="flex flex-wrap gap-x-3">
                          <bdi className="font-mono">{row.seatLabel}</bdi>
                          <span>{learners.get(row.learnerId) ?? t("m21.seating.learner")}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
