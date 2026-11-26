import { describe, expect, it } from "vitest";
import {
  AiMarkingSuggestionSchema,
  AssignmentSchema,
  AssignmentSubmissionSchema,
  OriginalitySignalSchema,
  PeerReviewSchema,
  SubmissionFeedbackSchema,
  type AiMarkingSuggestion,
  type AiSuggestionDecision,
  type Assignment,
  type AssignmentSubmission,
  type OriginalitySignal,
  type PeerReview,
  type SubmissionFeedback,
} from "./index";

const timestamps = { createdAt: "2026-07-01T08:00:00Z", updatedAt: "2026-07-01T09:00:00Z" };

const homework: Assignment = {
  ...timestamps,
  id: "assignment-fraction-photo",
  tenantId: "tenant-school",
  courseSpaceId: "space-5a-maths",
  title: "Fold and photograph three equivalent fractions",
  instructions: "Fold paper strips and take one photo of each.",
  outcomeIds: ["outcome-number-a1"],
  assessmentId: null,
  rubricId: null,
  maxMarks: null,
  submissionKinds: ["photo", "text"],
  openAt: "2026-07-06T03:00:00Z",
  dueAt: "2026-07-08T12:30:00Z",
  lateUntil: null,
  groupWork: false,
  peerReview: null,
  originalityCheck: false,
  status: "published",
  createdByStaffProfileId: "staff-maths",
};
const essay: Assignment = {
  ...homework,
  id: "assignment-cs101-essay",
  tenantId: "tenant-university",
  courseSpaceId: "space-cs101",
  title: "Essay: the stored-program computer",
  assessmentId: "assessment-cs101-essay",
  rubricId: "rubric-essay",
  maxMarks: 20,
  submissionKinds: ["file"],
  lateUntil: "2026-07-09T12:30:00Z",
  peerReview: { reviewsPerSubmission: 2, anonymous: true, dueAt: "2026-07-12T12:30:00Z" },
  originalityCheck: true,
};
const groupProject: Assignment = {
  ...essay,
  id: "assignment-group",
  groupWork: true,
  peerReview: null,
};

const photoSubmission: AssignmentSubmission = {
  ...timestamps,
  id: "submission-aarav-photo",
  tenantId: "tenant-school",
  assignmentId: homework.id,
  learnerId: "learner-aarav",
  groupLearnerIds: [],
  attempt: 1,
  status: "submitted",
  text: null,
  files: [
    { fileName: "half.jpg", contentType: "image/jpeg", sizeBytes: 1_200_000 },
    { fileName: "quarter.jpg", contentType: "image/jpeg", sizeBytes: 1_100_000 },
  ],
  linkUrl: null,
  submittedAt: "2026-07-07T14:00:00Z",
  clientId: "1b4e28ba-2fa1-41d2-883f-0016d3cca427",
  deviceId: "device-tablet-7",
};
const feedback: SubmissionFeedback = {
  id: "feedback-1",
  tenantId: "tenant-university",
  submissionId: "submission-essay-1",
  marks: 15.5,
  rubricScores: { THESIS: 4, EVIDENCE: 3 },
  comment: "Clear thesis; cite your sources.",
  markedByStaffProfileId: "staff-lecturer",
  markedAt: "2026-07-10T10:00:00Z",
  releasedAt: "2026-07-11T10:00:00Z",
};
const suggestion: AiMarkingSuggestion = {
  id: "ai-suggestion-1",
  tenantId: "tenant-university",
  submissionId: "submission-essay-1",
  suggestedMarks: 16,
  suggestedRubricScores: { THESIS: 4, EVIDENCE: 4 },
  reasons: ["The thesis is stated in the first paragraph.", "Two primary sources are cited."],
  createdAt: "2026-07-10T09:00:00Z",
  decision: "pending",
  decidedByStaffProfileId: null,
  decidedAt: null,
};
const peerReview: PeerReview = {
  id: "peer-review-1",
  tenantId: "tenant-university",
  assignmentId: essay.id,
  submissionId: "submission-essay-1",
  reviewerLearnerId: "learner-meera",
  anonymous: true,
  status: "submitted",
  rubricScores: { THESIS: 3 },
  comment: "The second section needs an example.",
  submittedAt: "2026-07-11T08:00:00Z",
};
const originality: OriginalitySignal = {
  id: "originality-1",
  tenantId: "tenant-university",
  submissionId: "submission-essay-1",
  provider: "demo",
  status: "ready",
  similarityBps: 1200,
  externalId: "demo-report-17",
  checkedAt: "2026-07-08T13:00:00Z",
};

describe("assignments", () => {
  it("accepts K12 homework, an HE essay with peer review and originality, and a group project", () => {
    for (const assignment of [homework, essay, groupProject]) {
      expect(AssignmentSchema.safeParse(assignment).success).toBe(true);
    }
  });

  it("rejects bad dates and settings", () => {
    expect(AssignmentSchema.safeParse({ ...homework, dueAt: homework.openAt }).success).toBe(false);
    expect(
      AssignmentSchema.safeParse({ ...homework, lateUntil: "2026-07-08T12:00:00Z" }).success,
    ).toBe(false);
    const earlyPeerReview = {
      ...essay,
      peerReview: { ...essay.peerReview, dueAt: "2026-07-08T12:00:00Z" },
    };
    expect(AssignmentSchema.safeParse(earlyPeerReview).success).toBe(false);
    const tooManyReviews = {
      ...essay,
      peerReview: { ...essay.peerReview, reviewsPerSubmission: 6 },
    };
    expect(AssignmentSchema.safeParse(tooManyReviews).success).toBe(false);
    expect(AssignmentSchema.safeParse({ ...homework, submissionKinds: [] }).success).toBe(false);
    expect(
      AssignmentSchema.safeParse({ ...homework, submissionKinds: ["photo", "photo"] }).success,
    ).toBe(false);
    expect(AssignmentSchema.safeParse({ ...essay, maxMarks: 10.25 }).success).toBe(false);
    expect(AssignmentSchema.safeParse({ ...homework, extra: true }).success).toBe(false);
  });
});

describe("submissions", () => {
  it("accepts an offline photo submission, a draft, a group text submission and a link", () => {
    expect(AssignmentSubmissionSchema.safeParse(photoSubmission).success).toBe(true);
    const draft = { ...photoSubmission, status: "draft", files: [], submittedAt: null };
    expect(AssignmentSubmissionSchema.safeParse(draft).success).toBe(true);
    const group = {
      ...photoSubmission,
      files: [],
      text: "Our answer…",
      groupLearnerIds: ["learner-meera"],
      deviceId: null,
    };
    expect(AssignmentSubmissionSchema.safeParse(group).success).toBe(true);
    const link = {
      ...photoSubmission,
      files: [],
      linkUrl: "https://www.example.org/my-slides",
      status: "late",
    };
    expect(AssignmentSubmissionSchema.safeParse(link).success).toBe(true);
  });

  it("rejects bad submissions", () => {
    const empty = { ...photoSubmission, files: [], text: "   " };
    expect(AssignmentSubmissionSchema.safeParse(empty).success).toBe(false);
    const authorInGroup = { ...photoSubmission, groupLearnerIds: [photoSubmission.learnerId] };
    expect(AssignmentSubmissionSchema.safeParse(authorInGroup).success).toBe(false);
    expect(
      AssignmentSubmissionSchema.safeParse({ ...photoSubmission, linkUrl: "http://example.org/" })
        .success,
    ).toBe(false);
    expect(
      AssignmentSubmissionSchema.safeParse({ ...photoSubmission, submittedAt: null }).success,
    ).toBe(false);
    const draftWithTime = { ...photoSubmission, status: "draft" };
    expect(AssignmentSubmissionSchema.safeParse(draftWithTime).success).toBe(false);
    const elevenFiles = {
      ...photoSubmission,
      files: Array.from({ length: 11 }, () => photoSubmission.files[0]),
    };
    expect(AssignmentSubmissionSchema.safeParse(elevenFiles).success).toBe(false);
    const badName = {
      ...photoSubmission,
      files: [{ fileName: "../x.jpg", contentType: "image/jpeg", sizeBytes: 1 }],
    };
    expect(AssignmentSubmissionSchema.safeParse(badName).success).toBe(false);
    expect(
      AssignmentSubmissionSchema.safeParse({ ...photoSubmission, clientId: "client-1" }).success,
    ).toBe(false);
  });
});

describe("feedback and AI suggestions", () => {
  it("accepts a person's feedback and each AI decision", () => {
    expect(SubmissionFeedbackSchema.safeParse(feedback).success).toBe(true);
    expect(SubmissionFeedbackSchema.safeParse({ ...feedback, releasedAt: null }).success).toBe(
      true,
    );
    expect(AiMarkingSuggestionSchema.safeParse(suggestion).success).toBe(true);
    const decided = {
      decidedByStaffProfileId: "staff-lecturer",
      decidedAt: "2026-07-10T10:00:00Z",
    };
    const decisions: AiSuggestionDecision[] = ["accepted", "edited", "rejected"];
    for (const decision of decisions) {
      expect(
        AiMarkingSuggestionSchema.safeParse({ ...suggestion, ...decided, decision }).success,
      ).toBe(true);
    }
  });

  it("rejects bad feedback and suggestions", () => {
    expect(SubmissionFeedbackSchema.safeParse({ ...feedback, marks: 15.25 }).success).toBe(false);
    expect(
      SubmissionFeedbackSchema.safeParse({ ...feedback, rubricScores: { THESIS: 11 } }).success,
    ).toBe(false);
    expect(
      SubmissionFeedbackSchema.safeParse({ ...feedback, releasedAt: "2026-07-09T10:00:00Z" })
        .success,
    ).toBe(false);
    expect(
      AiMarkingSuggestionSchema.safeParse({ ...suggestion, decision: "accepted" }).success,
    ).toBe(false);
    const pendingWithPerson = {
      ...suggestion,
      decidedByStaffProfileId: "staff-lecturer",
      decidedAt: "2026-07-10T10:00:00Z",
    };
    expect(AiMarkingSuggestionSchema.safeParse(pendingWithPerson).success).toBe(false);
    expect(AiMarkingSuggestionSchema.safeParse({ ...suggestion, reasons: [] }).success).toBe(false);
    const decidedEarly = {
      ...pendingWithPerson,
      decision: "edited",
      decidedAt: "2026-07-10T08:00:00Z",
    };
    expect(AiMarkingSuggestionSchema.safeParse(decidedEarly).success).toBe(false);
  });
});

describe("peer reviews and originality", () => {
  it("accepts a submitted and an assigned peer review and each originality status", () => {
    expect(PeerReviewSchema.safeParse(peerReview).success).toBe(true);
    const assigned = {
      ...peerReview,
      status: "assigned",
      rubricScores: null,
      comment: null,
      submittedAt: null,
    };
    expect(PeerReviewSchema.safeParse(assigned).success).toBe(true);
    expect(OriginalitySignalSchema.safeParse(originality).success).toBe(true);
    const open = { similarityBps: null, checkedAt: null, externalId: null };
    expect(
      OriginalitySignalSchema.safeParse({ ...originality, ...open, status: "pending" }).success,
    ).toBe(true);
    expect(
      OriginalitySignalSchema.safeParse({ ...originality, ...open, status: "not_configured" })
        .success,
    ).toBe(true);
    const failed = { ...originality, status: "failed", similarityBps: null };
    expect(OriginalitySignalSchema.safeParse(failed).success).toBe(true);
  });

  it("rejects bad peer reviews and signals", () => {
    expect(PeerReviewSchema.safeParse({ ...peerReview, submittedAt: null }).success).toBe(false);
    expect(OriginalitySignalSchema.safeParse({ ...originality, similarityBps: null }).success).toBe(
      false,
    );
    const pendingWithScore = { ...originality, status: "pending", checkedAt: null };
    expect(OriginalitySignalSchema.safeParse(pendingWithScore).success).toBe(false);
    expect(
      OriginalitySignalSchema.safeParse({ ...originality, provider: "Turn It In" }).success,
    ).toBe(false);
    expect(
      OriginalitySignalSchema.safeParse({ ...originality, similarityBps: 10001 }).success,
    ).toBe(false);
  });
});
