import { describe, expect, it } from "vitest";
import {
  QuestionResultSchema,
  SurveyQuestionSchema,
  SurveyResponseSchema,
  SurveySchema,
  ThemeSummarySchema,
  type QuestionResult,
  type Survey,
  type SurveyQuestion,
  type SurveyResponse,
  type ThemeSummary,
} from "./index";

const questions: SurveyQuestion[] = [
  {
    type: "rating",
    id: "q-clarity",
    prompt: "How clear were the lectures?",
    required: true,
    scaleMax: 5,
  },
  {
    type: "single_choice",
    id: "q-pace",
    prompt: "The pace was…",
    required: true,
    options: ["Too slow", "Right", "Too fast"],
  },
  {
    type: "multiple_choice",
    id: "q-helpful",
    prompt: "What helped?",
    required: false,
    options: ["Notes", "Videos", "Quizzes"],
  },
  {
    type: "text",
    id: "q-improve",
    prompt: "What should change?",
    required: false,
    maxLength: 1000,
  },
];
const survey: Survey = {
  id: "survey-cs101-faculty",
  tenantId: "tenant-university",
  institutionId: "institution-university",
  title: "CS-101 lecturer feedback",
  kind: "faculty_feedback",
  audience: "learners",
  targetClassGroupIds: [],
  targetCourseSpaceIds: ["space-cs101"],
  subjectStaffProfileId: "staff-lecturer",
  anonymity: "anonymous",
  minResponsesToShow: 5,
  opensAt: "2026-11-01T00:00:00Z",
  closesAt: "2026-11-15T00:00:00Z",
  status: "open",
  questions,
  createdByStaffProfileId: "staff-dean",
  createdAt: "2026-10-25T08:00:00Z",
  updatedAt: "2026-10-25T08:00:00Z",
};
const response: SurveyResponse = {
  id: "response-1",
  tenantId: "tenant-university",
  surveyId: survey.id,
  respondentProfileId: null,
  anonymous: true,
  answers: [
    { questionId: "q-clarity", rating: 4, optionIndexes: [], text: null },
    { questionId: "q-helpful", rating: null, optionIndexes: [0, 2], text: null },
    { questionId: "q-improve", rating: null, optionIndexes: [], text: "More worked examples." },
  ],
  submittedAt: "2026-11-03T10:00:00Z",
  clientId: "7e6d5c4b-3a29-4180-9f6e-5d4c3b2a1908",
  deviceId: null,
};
const shown: QuestionResult = {
  surveyId: survey.id,
  questionId: "q-clarity",
  minResponsesToShow: 5,
  responseCount: 42,
  suppressed: false,
  distribution: { "1": 1, "2": 3, "3": 8, "4": 18, "5": 12 },
  average: 3.88,
};
const summary: ThemeSummary = {
  id: "theme-summary-1",
  tenantId: "tenant-university",
  surveyId: survey.id,
  questionId: "q-improve",
  aiGenerated: true,
  tier: "balanced",
  themes: [
    { label: "More worked examples", mentionCount: 14, sentiment: "neutral" },
    { label: "Clear slides", mentionCount: 9, sentiment: "positive" },
  ],
  summary: "Learners ask for more worked examples and praise the slides.",
  basedOnResponses: 31,
  status: "published",
  publishedByStaffProfileId: "staff-dean",
  publishedAt: "2026-11-16T09:00:00Z",
};

describe("survey questions and surveys", () => {
  it("accepts each question type and a course, a faculty and a parent survey in each anonymity", () => {
    for (const question of questions) {
      expect(SurveyQuestionSchema.safeParse(question).success).toBe(true);
    }
    expect(SurveySchema.safeParse(survey).success).toBe(true);
    const course = {
      ...survey,
      kind: "course_feedback",
      subjectStaffProfileId: null,
      anonymity: "confidential",
    };
    expect(SurveySchema.safeParse(course).success).toBe(true);
    const parent = {
      ...course,
      kind: "parent",
      audience: "guardians",
      anonymity: "named",
      minResponsesToShow: 3,
    };
    expect(SurveySchema.safeParse(parent).success).toBe(true);
  });

  it("rejects bad surveys and questions", () => {
    expect(SurveySchema.safeParse({ ...survey, subjectStaffProfileId: null }).success).toBe(false);
    const courseWithStaff = { ...survey, kind: "course_feedback" };
    expect(SurveySchema.safeParse(courseWithStaff).success).toBe(false);
    expect(SurveySchema.safeParse({ ...survey, minResponsesToShow: 3 }).success).toBe(false);
    expect(SurveySchema.safeParse({ ...survey, closesAt: survey.opensAt }).success).toBe(false);
    expect(
      SurveySchema.safeParse({ ...survey, questions: [questions[0], questions[0]] }).success,
    ).toBe(false);
    const oneOption = {
      type: "single_choice",
      id: "q",
      prompt: "?",
      required: true,
      options: ["Only"],
    };
    expect(SurveyQuestionSchema.safeParse(oneOption).success).toBe(false);
    const badScale = { type: "rating", id: "q", prompt: "?", required: true, scaleMax: 4 };
    expect(SurveyQuestionSchema.safeParse(badScale).success).toBe(false);
  });
});

describe("responses", () => {
  it("accepts an anonymous and a named response", () => {
    expect(SurveyResponseSchema.safeParse(response).success).toBe(true);
    const named = {
      ...response,
      anonymous: false,
      respondentProfileId: "guardian-1",
      deviceId: "device-1",
    };
    expect(SurveyResponseSchema.safeParse(named).success).toBe(true);
  });

  it("keeps anonymous responses anonymous", () => {
    expect(
      SurveyResponseSchema.safeParse({ ...response, respondentProfileId: "learner-ravi" }).success,
    ).toBe(false);
    expect(SurveyResponseSchema.safeParse({ ...response, deviceId: "device-1" }).success).toBe(
      false,
    );
    const twoKinds = { questionId: "q-clarity", rating: 4, optionIndexes: [1], text: null };
    expect(SurveyResponseSchema.safeParse({ ...response, answers: [twoKinds] }).success).toBe(
      false,
    );
    const empty = { questionId: "q-clarity", rating: null, optionIndexes: [], text: null };
    expect(SurveyResponseSchema.safeParse({ ...response, answers: [empty] }).success).toBe(false);
    const repeated = [response.answers[0], response.answers[0]];
    expect(SurveyResponseSchema.safeParse({ ...response, answers: repeated }).success).toBe(false);
  });
});

describe("results and theme summaries", () => {
  it("accepts a shown and a suppressed result", () => {
    expect(QuestionResultSchema.safeParse(shown).success).toBe(true);
    const suppressed = {
      ...shown,
      responseCount: 3,
      suppressed: true,
      distribution: null,
      average: null,
    };
    expect(QuestionResultSchema.safeParse(suppressed).success).toBe(true);
  });

  it("rejects numbers on a suppressed result and a wrong flag", () => {
    expect(
      QuestionResultSchema.safeParse({ ...shown, responseCount: 3, suppressed: true }).success,
    ).toBe(false);
    expect(QuestionResultSchema.safeParse({ ...shown, responseCount: 3 }).success).toBe(false);
    expect(QuestionResultSchema.safeParse({ ...shown, distribution: null }).success).toBe(false);
  });

  it("accepts a draft and a published summary, never quotes", () => {
    expect(ThemeSummarySchema.safeParse(summary).success).toBe(true);
    const draft = {
      ...summary,
      status: "draft",
      publishedByStaffProfileId: null,
      publishedAt: null,
    };
    expect(ThemeSummarySchema.safeParse(draft).success).toBe(true);
    expect(
      ThemeSummarySchema.safeParse({ ...summary, quotes: ["More worked examples."] }).success,
    ).toBe(false);
    expect(
      ThemeSummarySchema.safeParse({ ...summary, publishedByStaffProfileId: null }).success,
    ).toBe(false);
    expect(ThemeSummarySchema.safeParse({ ...summary, aiGenerated: false }).success).toBe(false);
  });
});
