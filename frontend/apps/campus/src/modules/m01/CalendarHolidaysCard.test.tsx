import type { AcademicCalendar } from "@nexus/contracts";
import { I18nProvider } from "@nexus/i18n";
import { fireEvent, render, screen } from "@testing-library/react";
import { useFieldArray, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { CalendarHolidaysCard } from "./CalendarHolidaysCard";

function Harness({ online = true }: { readonly online?: boolean }) {
  const {
    register,
    control,
    watch,
    formState: { errors },
  } = useForm<AcademicCalendar>({
    defaultValues: {
      id: "cal-1",
      tenantId: "ten-1",
      institutionId: "ins-1",
      academicYear: "2026-27",
      startsOn: "2026-09-01",
      endsOn: "2027-07-01",
      periods: [],
      holidays: [],
      displayCalendar: "gregory",
    },
  });
  const holidays = useFieldArray({ control, name: "holidays", keyName: "fieldKey" });
  return (
    <CalendarHolidaysCard
      fields={holidays.fields}
      append={holidays.append}
      remove={holidays.remove}
      register={register}
      watch={watch}
      errors={errors}
      defaultDate="2026-09-01"
      online={online}
    />
  );
}

describe("CalendarHolidaysCard", () => {
  it("adds and removes holiday rows", () => {
    render(
      <I18nProvider locale="en">
        <Harness />
      </I18nProvider>,
    );
    expect(screen.getByText("No holidays added for this year.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add holiday" }));
    expect(screen.getByLabelText(/Holiday name/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove holiday 1" }));
    expect(screen.getByText("No holidays added for this year.")).toBeInTheDocument();
  });
});
