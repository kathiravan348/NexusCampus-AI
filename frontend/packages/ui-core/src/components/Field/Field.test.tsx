import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field, getDescribedBy } from "./Field";

describe("Field", () => {
  it("computes aria-describedby ids from description and error flags", () => {
    expect(getDescribedBy("f1", false, false)).toBeUndefined();
    expect(getDescribedBy("f1", true, false)).toBe("f1-description");
    expect(getDescribedBy("f1", true, true)).toBe("f1-description f1-error");
  });

  it("renders label, required marker, description, and alert error", () => {
    render(
      <Field label="Name" htmlFor="name" required description="Optional" error="Required">
        <input id="name" />
      </Field>,
    );
    expect(screen.getByRole("textbox", { name: "Name" })).toBeInTheDocument();
    expect(screen.getByText("Optional")).toHaveAttribute("id", "name-description");
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });

  it("supports logical end label positioning", () => {
    render(
      <Field label="Enabled" htmlFor="toggle" labelPosition="end">
        <input id="toggle" type="checkbox" />
      </Field>,
    );
    expect(screen.getByLabelText("Enabled")).toBeInTheDocument();
  });
});
