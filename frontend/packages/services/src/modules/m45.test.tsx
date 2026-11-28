import { ISSUED_CREDENTIAL, TENANT, USER, VERIFICATION_CODE, resetMockDb } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useCredentialTemplates,
  useCredentialVerification,
  useIssuedCredential,
  useIssuedCredentials,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

describe("M45 hooks", () => {
  it("loads and parses credential templates, issued credentials and details", async () => {
    signInAs({ ...ADMIN, tenantId: TENANT.riverside, userId: USER.rvHelen });
    const id = ISSUED_CREDENTIAL.rvMiaBadge;
    const { result } = renderHook(
      () => ({
        templates: useCredentialTemplates(),
        credentials: useIssuedCredentials(),
        credential: useIssuedCredential(id),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      const { templates, credentials, credential } = result.current;
      expect(templates.data?.total).toBe(2);
      expect(credentials.data?.total).toBe(2);
      expect(credential.data?.id).toBe(id);
    });
  });

  it("waits for a code and parses the public verification result", async () => {
    const { result, rerender } = renderHook(({ code }) => useCredentialVerification(code), {
      initialProps: { code: "" },
      wrapper: wrapper({ db: freshDb() }),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();

    rerender({ code: VERIFICATION_CODE.nbJordanRevoked });
    await waitFor(() => {
      expect(result.current.data).toMatchObject({
        verificationCode: VERIFICATION_CODE.nbJordanRevoked,
        result: "revoked",
      });
    });
  });
});
