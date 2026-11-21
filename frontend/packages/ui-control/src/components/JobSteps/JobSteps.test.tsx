import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JobSteps } from "./JobSteps";

const labels = { pending: "Waiting", running: "Running", done: "Done", failed: "Failed" };

describe("JobSteps", () => {
  it("renders an ordered, named list with each step's status as text", () => {
    render(
      <JobSteps
        ariaLabel="Steps of job prv-1"
        statusLabels={labels}
        steps={[
          { id: "a", label: "Create tenant", status: "done" },
          { id: "b", label: "Create keys", status: "running" },
          { id: "c", label: "Seed", status: "failed" },
          { id: "d", label: "Invite owner", status: "pending" },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Steps of job prv-1" });
    expect(list.tagName).toBe("OL");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent("1.Create tenantDone");
    expect(items[1]).toHaveTextContent("Running");
    expect(items[2]).toHaveTextContent("Failed");
    expect(items[3]).toHaveTextContent("4.Invite ownerWaiting");
  });
});
