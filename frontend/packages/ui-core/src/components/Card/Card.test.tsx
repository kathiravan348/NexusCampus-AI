import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./Card";

describe("Card", () => {
  it("renders title, actions, body, and footer slots", () => {
    render(
      <Card
        title="Details"
        actions={<button type="button">Edit</button>}
        footer={<span>Status</span>}
      >
        <p>Body content</p>
      </Card>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("omits header and footer wrappers when slots are absent", () => {
    render(<Card>Only body</Card>);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("Only body")).toBeInTheDocument();
  });
});
