import { mockDb } from "@nexus/mocks";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  useCreateCustomField,
  useCustomFields,
  useForms,
  useNumberingFormats,
  useWorkflows,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();

describe("M08 hooks", () => {
  it("loads configuration and keeps custom field results scoped to the entity", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(
      () => ({
        learnerFields: useCustomFields("learner"),
        staffFields: useCustomFields("staff"),
        forms: useForms(),
        workflows: useWorkflows(),
        numberingFormats: useNumberingFormats(),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      expect(result.current.learnerFields.data?.items).toMatchObject([
        { tenantId: ADMIN.tenantId, entity: "learner" },
        { tenantId: ADMIN.tenantId, entity: "learner" },
      ]);
      expect(result.current.staffFields.data?.items).toEqual([]);
      expect(result.current.forms.data?.items).toMatchObject([{ tenantId: ADMIN.tenantId }]);
      expect(result.current.workflows.data?.items).toMatchObject([{ tenantId: ADMIN.tenantId }]);
      expect(result.current.numberingFormats.data?.items).toMatchObject([
        { tenantId: ADMIN.tenantId },
      ]);
    });
  });
});

it("refreshes both the filtered and unfiltered field lists after creation", async () => {
  signInAs(ADMIN);
  const { result } = renderHook(
    () => ({
      create: useCreateCustomField(),
      staff: useCustomFields("staff"),
      all: useCustomFields(),
    }),
    { wrapper: wrapper({ db: freshDb() }) },
  );
  await waitFor(() =>
    expect(result.current.staff.isSuccess && result.current.all.isSuccess).toBe(true),
  );
  const locale = mockDb.institutions.find((row) => row.tenantId === ADMIN.tenantId)!.locale
    .defaultLocale;
  await act(async () => {
    await result.current.create.mutateAsync({
      key: "staffPref",
      entity: "staff",
      label: { [locale]: "Preference" },
      type: "text",
      required: false,
      sensitive: false,
      order: 1,
    });
  });
  await waitFor(() => {
    for (const list of [result.current.staff, result.current.all]) {
      expect(list.data?.items).toContainEqual(
        expect.objectContaining({ key: "staffPref", tenantId: ADMIN.tenantId }),
      );
    }
  });
});
