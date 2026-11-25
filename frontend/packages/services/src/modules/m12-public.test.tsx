import { PUBLIC_ENQUIRY_FORM, resetMockDb } from "@nexus/mocks";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApiRequestError } from "../client";
import { useEnquiryForms, usePublicEnquiryForm, useSubmitPublicEnquiry } from "../index";
import { ADMIN, TEACHER, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

describe("M12 public enquiry hooks", () => {
  it("loads a public enquiry form and submits an enquiry without a session", async () => {
    const wrap = wrapper({ db: freshDb() });
    const { result } = renderHook(
      () => ({
        form: usePublicEnquiryForm(PUBLIC_ENQUIRY_FORM.riversideSchool),
        submit: useSubmitPublicEnquiry(PUBLIC_ENQUIRY_FORM.riversideSchool),
      }),
      { wrapper: wrap },
    );

    await waitFor(() => expect(result.current.form.isSuccess).toBe(true));
    expect(result.current.form.data?.institutionName).toBe("Riverside School");
    expect(result.current.form.data?.campuses.length).toBeGreaterThan(0);

    const receipt = await act(() =>
      result.current.submit.mutateAsync({
        learnerName: "Maya Hook",
        contactName: "Sam Hook",
        contactPhone: null,
        contactEmail: "family@example.test",
        programId: result.current.form.data?.programs[0]?.id ?? null,
        campusId: result.current.form.data?.campuses[0]?.id ?? null,
        consent: true,
        website: "",
      }),
    );
    expect(receipt).toEqual({ received: true });
  });

  it("returns a 404 ApiRequestError for an unknown public form id", async () => {
    const { result } = renderHook(() => usePublicEnquiryForm("pef-missing"), {
      wrapper: wrapper({ db: freshDb() }),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiRequestError);
    expect((result.current.error as ApiRequestError).status).toBe(404);
  });

  it("loads staff enquiry form ids for managers and denies non-managers", async () => {
    signInAs(ADMIN);
    const adminHook = renderHook(() => useEnquiryForms(), {
      wrapper: wrapper({ db: freshDb() }),
    });
    await waitFor(() => expect(adminHook.result.current.isSuccess).toBe(true));
    expect(adminHook.result.current.data?.items).toEqual([
      expect.objectContaining({
        id: PUBLIC_ENQUIRY_FORM.littleSteps,
        tenantId: ADMIN.tenantId,
      }),
    ]);

    signInAs(TEACHER);
    const teacherHook = renderHook(() => useEnquiryForms(), {
      wrapper: wrapper({ db: freshDb() }),
    });
    await waitFor(() => expect(teacherHook.result.current.isError).toBe(true));
    expect((teacherHook.result.current.error as ApiRequestError).status).toBe(403);
  });
});
