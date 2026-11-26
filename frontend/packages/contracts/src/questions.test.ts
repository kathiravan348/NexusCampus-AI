import { describe, expect, it } from "vitest";
import {
  QuestionBankSchema,
  QuestionDeliverySchema,
  QuestionItemSchema,
  type QuestionBank,
  type QuestionItem,
  type QuestionKind,
} from "./index";

const timestamps = { createdAt: "2026-06-01T08:00:00Z", updatedAt: "2026-06-02T08:00:00Z" };

const bank: QuestionBank = {
  ...timestamps,
  id: "bank-g5-maths",
  tenantId: "tenant-school",
  institutionId: "institution-school",
  code: "G5-MATHS",
  name: "Grade 5 mathematics",
  subjectIds: ["subject-maths"],
  editorStaffProfileIds: ["staff-maths"],
};

const base: QuestionItem = {
  ...timestamps,
  id: "item-half",
  tenantId: "tenant-school",
  bankId: bank.id,
  kind: "single_choice",
  stem: "Which fraction equals 1/2?",
  language: "en-IN",
  options: [
    { id: "a", text: "2/4", correct: true },
    { id: "b", text: "2/3", correct: false },
    { id: "c", text: "3/4", correct: false },
  ],
  acceptedAnswers: [],
  numericAnswer: null,
  maxPoints: 1,
  difficulty: "easy",
  outcomeIds: ["outcome-number-a1"],
  qtiIdentifier: "item-half-v1",
  explanation: "2/4 simplifies to 1/2.",
  source: "manual",
  status: "approved",
  version: 1,
  createdByProfileId: "staff-maths",
};

const noOptions = { options: [], acceptedAnswers: [], numericAnswer: null };
const itemsByKind: Record<QuestionKind, QuestionItem> = {
  single_choice: base,
  multiple_choice: {
    ...base,
    id: "item-equivalents",
    kind: "multiple_choice",
    options: [
      { id: "a", text: "2/4", correct: true },
      { id: "b", text: "3/6", correct: true },
      { id: "c", text: "2/3", correct: false },
    ],
  },
  true_false: {
    ...base,
    id: "item-true-false",
    kind: "true_false",
    options: [
      { id: "true", text: "True", correct: false },
      { id: "false", text: "False", correct: true },
    ],
  },
  short_text: {
    ...base,
    ...noOptions,
    id: "item-word",
    kind: "short_text",
    acceptedAnswers: ["half", "one half"],
  },
  numeric: {
    ...base,
    ...noOptions,
    id: "item-numeric",
    kind: "numeric",
    numericAnswer: { value: 0.5, tolerance: 0.01 },
  },
  essay: {
    ...base,
    ...noOptions,
    id: "item-essay",
    kind: "essay",
    maxPoints: 10,
    source: "ai_generated",
    status: "in_review",
  },
  order: {
    ...base,
    id: "item-order",
    kind: "order",
    options: [
      { id: "a", text: "1/4", correct: false },
      { id: "b", text: "1/2", correct: false },
      { id: "c", text: "3/4", correct: false },
    ],
  },
};

describe("question banks", () => {
  it("accepts an institution bank and a group-wide bank", () => {
    expect(QuestionBankSchema.safeParse(bank).success).toBe(true);
    expect(QuestionBankSchema.safeParse({ ...bank, institutionId: null }).success).toBe(true);
  });

  it("rejects a bank without editors, bad codes and extra keys", () => {
    expect(QuestionBankSchema.safeParse({ ...bank, editorStaffProfileIds: [] }).success).toBe(
      false,
    );
    expect(QuestionBankSchema.safeParse({ ...bank, code: "G5 MATHS" }).success).toBe(false);
    expect(QuestionBankSchema.safeParse({ ...bank, extra: 1 }).success).toBe(false);
  });
});

describe("question items", () => {
  it("accepts one item of each kind", () => {
    for (const item of Object.values(itemsByKind)) {
      expect(QuestionItemSchema.safeParse(item).success).toBe(true);
    }
  });

  it("checks correct options per kind", () => {
    const twoCorrect = base.options.map((option) => ({ ...option, correct: option.id !== "c" }));
    expect(QuestionItemSchema.safeParse({ ...base, options: twoCorrect }).success).toBe(false);
    const noneCorrect = base.options.map((option) => ({ ...option, correct: false }));
    expect(QuestionItemSchema.safeParse({ ...base, options: noneCorrect }).success).toBe(false);
    const multiple = itemsByKind.multiple_choice;
    expect(QuestionItemSchema.safeParse({ ...multiple, options: noneCorrect }).success).toBe(false);
    const orderWithCorrect = itemsByKind.order.options.map((option, index) => ({
      ...option,
      correct: index === 0,
    }));
    expect(
      QuestionItemSchema.safeParse({ ...itemsByKind.order, options: orderWithCorrect }).success,
    ).toBe(false);
  });

  it("checks option counts and answer payloads per kind", () => {
    const threeTrueFalse = [
      ...itemsByKind.true_false.options,
      { id: "maybe", text: "Maybe", correct: false },
    ];
    expect(
      QuestionItemSchema.safeParse({ ...itemsByKind.true_false, options: threeTrueFalse }).success,
    ).toBe(false);
    expect(
      QuestionItemSchema.safeParse({ ...itemsByKind.numeric, options: base.options }).success,
    ).toBe(false);
    expect(
      QuestionItemSchema.safeParse({ ...itemsByKind.numeric, numericAnswer: null }).success,
    ).toBe(false);
    expect(
      QuestionItemSchema.safeParse({ ...itemsByKind.short_text, acceptedAnswers: [] }).success,
    ).toBe(false);
    expect(QuestionItemSchema.safeParse({ ...base, acceptedAnswers: ["2/4"] }).success).toBe(false);
    expect(QuestionItemSchema.safeParse({ ...base, options: [base.options[0]] }).success).toBe(
      false,
    );
    const duplicateIds = base.options.map((option) => ({ ...option, id: "a" }));
    expect(QuestionItemSchema.safeParse({ ...base, options: duplicateIds }).success).toBe(false);
    const negativeTolerance = {
      ...itemsByKind.numeric,
      numericAnswer: { value: 0.5, tolerance: -1 },
    };
    expect(QuestionItemSchema.safeParse(negativeTolerance).success).toBe(false);
  });

  it("rejects bad points, option ids and language", () => {
    expect(QuestionItemSchema.safeParse({ ...base, maxPoints: 0 }).success).toBe(false);
    expect(QuestionItemSchema.safeParse({ ...base, maxPoints: 1.25 }).success).toBe(false);
    const badOptionId = base.options.map((option, index) =>
      index === 0 ? { ...option, id: "a b" } : option,
    );
    expect(QuestionItemSchema.safeParse({ ...base, options: badOptionId }).success).toBe(false);
    expect(QuestionItemSchema.safeParse({ ...base, language: "en_IN" }).success).toBe(false);
  });
});

describe("question delivery", () => {
  it("carries the question without its answer key", () => {
    const delivered = {
      id: base.id,
      kind: base.kind,
      stem: base.stem,
      language: base.language,
      options: base.options.map(({ id, text }) => ({ id, text })),
      maxPoints: base.maxPoints,
    };
    expect(QuestionDeliverySchema.safeParse(delivered).success).toBe(true);
    expect(QuestionDeliverySchema.safeParse({ ...delivered, options: base.options }).success).toBe(
      false,
    );
    expect(
      QuestionDeliverySchema.safeParse({ ...delivered, explanation: base.explanation }).success,
    ).toBe(false);
    expect(
      QuestionDeliverySchema.safeParse({ ...delivered, acceptedAnswers: ["2/4"] }).success,
    ).toBe(false);
    expect(QuestionDeliverySchema.safeParse(base).success).toBe(false);
    const essay = { ...delivered, kind: "essay", options: [] };
    expect(QuestionDeliverySchema.safeParse(essay).success).toBe(true);
    expect(QuestionDeliverySchema.safeParse({ ...essay, options: delivered.options }).success).toBe(
      false,
    );
  });
});
