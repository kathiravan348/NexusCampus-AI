import { renderHook, waitFor } from "@testing-library/react";
import { useCustomFields, useForms, useNumberingFormats, useWorkflows } from "../index";
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
