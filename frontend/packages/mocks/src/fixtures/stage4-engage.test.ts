import * as C from "@nexus/contracts";
import { expect, it } from "vitest";
import { CLASS_GROUPS } from "./academics";
import { ACADEMIC_CALENDARS } from "./calendars";
import { DEMO_NOW } from "./compliance";
import { CONTENT_ASSETS } from "./content";
import { COURSE_SPACES } from "./courses";
import * as CR from "./credentials";
import { OUTCOMES } from "./curriculum";
import { TENANT } from "./ids";
import { LEARNERS } from "./learner-records";
import { PEOPLE } from "./people";
import { PORTFOLIO_ENTRIES, PORTFOLIOS } from "./portfolios";
import { ROLE_PROFILES } from "./role-profiles";
import * as SV from "./surveys";
import { DEMO_TENANTS, INSTITUTIONS } from "./tenants";

type IdRow = { id: string; tenantId: string };
type Parser = { safeParse(value: unknown): { error?: unknown } };
const DAY_MS = 24 * 60 * 60 * 1000;

const idSets: [string, Parser, readonly IdRow[]][] = [
  ["surveys", C.SurveySchema, SV.SURVEYS],
  ["survey responses", C.SurveyResponseSchema, SV.SURVEY_RESPONSES],
  ["theme summaries", C.ThemeSummarySchema, SV.THEME_SUMMARIES],
  ["credential templates", C.CredentialTemplateSchema, CR.CREDENTIAL_TEMPLATES],
  ["issued credentials", C.IssuedCredentialSchema, CR.ISSUED_CREDENTIALS],
];

const otherSets: [string, Parser, readonly unknown[]][] = [
  ["question results", C.QuestionResultSchema, SV.QUESTION_RESULTS],
  ["credential verifications", C.CredentialVerificationSchema, CR.CREDENTIAL_VERIFICATIONS],
];

const staff = ROLE_PROFILES.filter((row) => row.kind === "staff");
const audienceKind = { learners: "learner", guardians: "guardian", staff: "staff" } as const;

function ref<T extends IdRow>(rows: readonly T[], id: string | null, tenantId: string): T {
  const row = rows.find((c) => c.id === id && c.tenantId === tenantId);
  if (!row) throw new Error(`Missing fixture reference ${id} in ${tenantId}`);
  return row;
}

function expectInCalendar(tenantId: string, value: string) {
  const calendar = ACADEMIC_CALENDARS.find((row) => row.tenantId === tenantId);
  if (!calendar) throw new Error(`Missing calendar for ${tenantId}`);
  const day = value.slice(0, 10);
  expect(day >= calendar.startsOn && day <= calendar.endsOn, `${tenantId} ${value}`).toBe(true);
}

function unique(keys: readonly string[]) {
  expect(new Set(keys).size).toBe(keys.length);
}

function covers<T, V>(rows: readonly T[], get: (row: T) => V, expected: readonly V[]) {
  expect(new Set(rows.map(get))).toEqual(new Set(expected));
}

type KeyValue = [string, string];
function walkStrings(value: unknown, key: string, out: KeyValue[] = []): KeyValue[] {
  if (typeof value === "string") out.push([key, value]);
  else if (Array.isArray(value)) for (const item of value) walkStrings(item, key, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) walkStrings(v, k, out);
  }
  return out;
}

it.each([...idSets, ...otherSets])("%s parse with their contract", (_name, schema, rows) => {
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) expect(schema.safeParse(row).error).toBeUndefined();
});

it.each(idSets)("%s have unique IDs and valid demo tenants", (_name, _schema, rows) => {
  unique(rows.map((row) => row.id));
  for (const row of rows) {
    expect(DEMO_TENANTS.some((t) => t.tenantId === row.tenantId)).toBe(true);
  }
});

it("covers all M44 survey enums, anonymity, suppression, AI themes and faculty privacy", () => {
  covers(SV.SURVEYS, (r) => r.tenantId, [TENANT.riverside, TENANT.northbridge]);
  covers(SV.SURVEYS, (r) => r.kind, C.SurveyKindSchema.options);
  covers(SV.SURVEYS, (r) => r.anonymity, C.AnonymitySchema.options);
  covers(SV.SURVEYS, (r) => r.audience, ["learners", "guardians", "staff"]);
  covers(SV.SURVEYS, (r) => r.status, ["draft", "open", "closed", "archived"]);
  covers(
    SV.SURVEYS.flatMap((s) => s.questions),
    (q) => q.type,
    ["rating", "single_choice", "multiple_choice", "text"],
  );
  covers(SV.QUESTION_RESULTS, (r) => r.suppressed, [true, false]);
  covers(
    SV.THEME_SUMMARIES.flatMap((t) => t.themes),
    (t) => t.sentiment,
    ["positive", "neutral", "negative", "mixed"],
  );
  covers(SV.THEME_SUMMARIES, (r) => r.status, ["draft", "published"]);

  unique(SV.SURVEY_RESPONSES.map((r) => r.clientId));
  unique(SV.QUESTION_RESULTS.map((r) => `${r.surveyId}:${r.questionId}`));

  for (const s of SV.SURVEYS) {
    ref(INSTITUTIONS, s.institutionId, s.tenantId);
    ref(staff, s.createdByStaffProfileId, s.tenantId);
    if (s.subjectStaffProfileId) ref(staff, s.subjectStaffProfileId, s.tenantId);
    for (const id of s.targetClassGroupIds) ref(CLASS_GROUPS, id, s.tenantId);
    for (const id of s.targetCourseSpaceIds) ref(COURSE_SPACES, id, s.tenantId);
    expectInCalendar(s.tenantId, s.opensAt);
    expectInCalendar(s.tenantId, s.closesAt);
  }

  for (const r of SV.SURVEY_RESPONSES) {
    const s = ref(SV.SURVEYS, r.surveyId, r.tenantId);
    expect(r.anonymous).toBe(s.anonymity === "anonymous");
    expectInCalendar(r.tenantId, r.submittedAt);
    expect(r.submittedAt >= s.opensAt && r.submittedAt <= s.closesAt).toBe(true);
    if (r.anonymous) {
      expect(r.respondentProfileId).toBeNull();
      expect(r.deviceId).toBeNull();
      expect(Date.parse(r.submittedAt) % DAY_MS).toBe(0);
    } else {
      const profile = ref(ROLE_PROFILES, r.respondentProfileId, r.tenantId);
      expect(profile.kind).toBe(audienceKind[s.audience]);
    }
    for (const ans of r.answers) {
      const q = s.questions.find((item) => item.id === ans.questionId);
      expect(q).toBeDefined();
      if (q?.type === "rating") expect(ans.rating).toBeLessThanOrEqual(q.scaleMax);
      if (q?.type === "single_choice") expect(ans.optionIndexes).toHaveLength(1);
      if (q?.type === "single_choice" || q?.type === "multiple_choice") {
        for (const i of ans.optionIndexes) expect(i).toBeLessThan(q.options.length);
      }
      if (q?.type === "text") expect(ans.text?.length ?? 0).toBeLessThanOrEqual(q.maxLength);
    }
  }

  for (const res of SV.QUESTION_RESULTS) {
    const s = SV.SURVEYS.find((row) => row.id === res.surveyId);
    if (!s) throw new Error(`Missing survey ${res.surveyId}`);
    expect(s.questions.some((q) => q.id === res.questionId)).toBe(true);
    expect(res.minResponsesToShow).toBe(s.minResponsesToShow);
    const matching = SV.SURVEY_RESPONSES.filter(
      (r) => r.surveyId === res.surveyId && r.answers.some((a) => a.questionId === res.questionId),
    );
    expect(res.responseCount).toBe(matching.length);
    if (!res.suppressed && res.distribution) {
      const total = Object.values(res.distribution).reduce((sum, n) => sum + n, 0);
      expect(total).toBe(matching.length);
    }
  }

  const allTextAnswers = SV.SURVEY_RESPONSES.flatMap((r) =>
    r.answers.flatMap((a) => (a.text ? [a.text] : [])),
  );
  for (const t of SV.THEME_SUMMARIES) {
    const s = ref(SV.SURVEYS, t.surveyId, t.tenantId);
    expect(t.basedOnResponses).toBeGreaterThanOrEqual(s.minResponsesToShow);
    if (t.questionId) expect(s.questions.some((q) => q.id === t.questionId)).toBe(true);
    if (t.publishedByStaffProfileId) ref(staff, t.publishedByStaffProfileId, t.tenantId);
    if (t.publishedAt) expectInCalendar(t.tenantId, t.publishedAt);
    expect(t.summary).not.toMatch(/["“”']/);
    for (const answer of allTextAnswers) expect(t.summary).not.toContain(answer);
    for (const person of PEOPLE) expect(t.summary).not.toContain(person.legalName);
  }

  const facultySurveys = SV.SURVEYS.filter((s) => s.kind === "faculty_feedback");
  expect(facultySurveys.length).toBeGreaterThanOrEqual(1);
  for (const s of facultySurveys) {
    const viewers = SV.FACULTY_RESULT_VIEWER_PROFILE_IDS[s.id] ?? [];
    expect(viewers).toHaveLength(2);
    expect(viewers).toContain(s.subjectStaffProfileId);
    const managerId = viewers.find((id) => id !== s.subjectStaffProfileId) ?? null;
    expect(ref(staff, managerId, s.tenantId).campusId).toBeNull();
  }
});

it("covers M45 credential kinds, formats, statuses, hiding and public verifications", () => {
  covers(CR.CREDENTIAL_TEMPLATES, (r) => r.tenantId, [TENANT.riverside, TENANT.northbridge]);
  covers(CR.CREDENTIAL_TEMPLATES, (r) => r.kind, C.CredentialKindSchema.options);
  covers(CR.CREDENTIAL_TEMPLATES, (r) => r.format, C.CredentialFormatSchema.options);
  covers(CR.CREDENTIAL_TEMPLATES, (r) => r.status, ["draft", "active", "retired"]);
  covers(CR.ISSUED_CREDENTIALS, (r) => r.format, C.CredentialFormatSchema.options);
  covers(CR.ISSUED_CREDENTIALS, (r) => r.status, C.IssuedCredentialStatusSchema.options);
  covers(
    CR.ISSUED_CREDENTIALS.flatMap((r) => (r.proof ? [r.proof.type] : [])),
    (t) => t,
    ["DataIntegrityProof", "Ed25519Signature2020"],
  );
  covers(CR.CREDENTIAL_VERIFICATIONS, (r) => r.result, C.VerificationResultSchema.options);

  unique(CR.CREDENTIAL_TEMPLATES.map((r) => `${r.tenantId}:${r.code}`));
  unique(CR.ISSUED_CREDENTIALS.map((r) => r.credentialUri));
  unique(CR.ISSUED_CREDENTIALS.map((r) => r.verificationCode));
  unique(
    CR.ISSUED_CREDENTIALS.flatMap((r) =>
      r.statusListIndex === null ? [] : [`${r.tenantId}:${r.statusListIndex}`],
    ),
  );
  unique(CR.CREDENTIAL_VERIFICATIONS.map((r) => r.verificationCode));

  for (const tpl of CR.CREDENTIAL_TEMPLATES) {
    ref(INSTITUTIONS, tpl.institutionId, tpl.tenantId);
    for (const outcomeId of tpl.outcomeIds) ref(OUTCOMES, outcomeId, tpl.tenantId);
    if (tpl.imageAssetId) {
      expect(ref(CONTENT_ASSETS, tpl.imageAssetId, tpl.tenantId).kind).toBe("image");
    }
  }

  for (const ic of CR.ISSUED_CREDENTIALS) {
    const tpl = ref(CR.CREDENTIAL_TEMPLATES, ic.templateId, ic.tenantId);
    expect(ic.format).toBe(tpl.format);
    ref(LEARNERS, ic.learnerId, ic.tenantId);
    ref(staff, ic.issuedByStaffProfileId, ic.tenantId);
    expectInCalendar(ic.tenantId, ic.issuedAt);
    if (ic.expiresAt) expectInCalendar(ic.tenantId, ic.expiresAt);
    if (ic.revokedAt) expectInCalendar(ic.tenantId, ic.revokedAt);
    if (ic.status === "expired" && ic.expiresAt) expect(ic.expiresAt < DEMO_NOW).toBe(true);
    for (const entryId of ic.evidenceEntryIds) {
      const entry = ref(PORTFOLIO_ENTRIES, entryId, ic.tenantId);
      expect(ref(PORTFOLIOS, entry.portfolioId, ic.tenantId).learnerId).toBe(ic.learnerId);
    }
  }

  expect(CR.HIDDEN_CREDENTIAL_IDS.length).toBeGreaterThanOrEqual(1);
  for (const id of CR.HIDDEN_CREDENTIAL_IDS) {
    const hidden = CR.ISSUED_CREDENTIALS.find((row) => row.id === id);
    expect(hidden?.status).toBe("issued");
  }

  const shape = Object.keys(CR.CREDENTIAL_VERIFICATIONS[0] ?? {}).sort();
  const learnerTokens = [
    ...PEOPLE.map((p) => p.legalName),
    ...PEOPLE.flatMap((p) => (p.email ? [p.email] : [])),
    ...LEARNERS.map((l) => l.id),
    ...CR.ISSUED_CREDENTIALS.map((c) => c.recipientIdentityHash),
  ];
  for (const v of CR.CREDENTIAL_VERIFICATIONS) {
    expect(Object.keys(v).sort()).toEqual(shape);
    const serialized = JSON.stringify(v);
    for (const token of learnerTokens) expect(serialized).not.toContain(token);
    const match = CR.ISSUED_CREDENTIALS.find((c) => c.verificationCode === v.verificationCode);
    if (v.result === "not_found") {
      expect(match).toBeUndefined();
    } else {
      if (!match) throw new Error(`Missing issued credential for ${v.verificationCode}`);
      const tpl = ref(CR.CREDENTIAL_TEMPLATES, match.templateId, match.tenantId);
      const inst = ref(INSTITUTIONS, tpl.institutionId, match.tenantId);
      expect(v.kind).toBe(tpl.kind);
      expect(v.credentialName).toBe(tpl.name);
      expect(v.institutionName).toBe(inst.name);
      expect(v.issuedOn).toBe(match.issuedAt.slice(0, 10));
      expect(v.expiresOn).toBe(match.expiresAt ? match.expiresAt.slice(0, 10) : null);
    }
  }
});

it("contains no URLs outside verificationMethod and no key material in any field", () => {
  for (const [, , rows] of [...idSets, ...otherSets]) {
    for (const [key, value] of walkStrings(rows, "root")) {
      if (key !== "verificationMethod") {
        expect(value, `${key}=${value}`).not.toMatch(/https?:\/\/|www\./i);
      }
      expect(value, `${key}`).not.toContain("-----BEGIN");
      if (key !== "recipientIdentityHash") {
        expect(value, `${key}`).not.toMatch(/[0-9a-f]{32,}/i);
        expect(value, `${key}`).not.toMatch(/[A-Za-z0-9+/]{44,}={0,2}/);
      }
    }
  }
});
