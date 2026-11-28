import type { LessonPlanInput } from "@nexus/contracts";
import { createNexusQueryClient } from "@nexus/services";
import { fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../App";
import { freshDb } from "../../test/renderApp";
import { LessonPlanActivities } from "./LessonPlanActivities";
import { lessonPlanDefaults } from "./lessonPlanForm";

function Harness() {
  const {
    control,
    register,
    getValues,
    formState: { errors },
  } = useForm<LessonPlanInput>({
    defaultValues: lessonPlanDefaults(null, "off-1", "rp-1"),
  });
  return (
    <LessonPlanActivities
      control={control}
      register={register}
      getValues={getValues}
      errors={errors.activities}
    />
  );
}

describe("LessonPlanActivities (M29)", () => {
  it("adds, reorders and removes activities with accessible controls", () => {
    render(
      <AppProviders
        db={freshDb()}
        createClient={() =>
          createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <Harness />
      </AppProviders>,
    );

    expect(screen.getByText("No activities added yet.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));

    const inputs = screen.getAllByLabelText(/Activity title/) as HTMLInputElement[];
    fireEvent.change(inputs[0]!, { target: { value: "Warm-up" } });
    fireEvent.change(inputs[1]!, { target: { value: "Practice" } });

    expect(screen.getByRole("button", { name: "Move activity 1 up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move activity 2 down" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Move activity 2 up" }));
    const swapped = screen.getAllByLabelText(/Activity title/) as HTMLInputElement[];
    expect(swapped.map((el) => el.value)).toEqual(["Practice", "Warm-up"]);

    fireEvent.click(screen.getByRole("button", { name: "Remove activity 1" }));
    const remaining = screen.getAllByLabelText(/Activity title/) as HTMLInputElement[];
    expect(remaining.map((el) => el.value)).toEqual(["Warm-up"]);
  });
});
