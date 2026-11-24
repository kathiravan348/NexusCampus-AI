import type {
  CustomFieldDefinition,
  FormDefinition,
  NumberingFormat,
  WorkflowDefinition,
} from "@nexus/contracts";
import { roleId, TENANT } from "./ids";
import { CUSTOM_FIELD, FORM, NUMBERING_FORMAT, WORKFLOW, WORKFLOW_STEP } from "./ids-stage3";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const timestamps = { createdAt: CREATED_AT, updatedAt: UPDATED_AT };

const settings = [
  { key: "littleSteps", prefix: "LS" },
  { key: "riverside", prefix: "RV" },
  { key: "northbridge", prefix: "NB" },
  { key: "apex", prefix: "AX" },
  { key: "harmony", prefix: "HM" },
] as const;

export const LEARNER_FIELD = {
  studyInterest: "studyInterest",
  supportNote: "supportNote",
} as const;

export const CUSTOM_FIELD_DEFINITIONS: readonly CustomFieldDefinition[] = settings.flatMap(
  ({ key }): CustomFieldDefinition[] => [
    {
      id: CUSTOM_FIELD[key].studyInterest,
      tenantId: TENANT[key],
      entity: "learner",
      key: LEARNER_FIELD.studyInterest,
      label: {
        "en-IN": "Study interest",
        "en-GB": "Study interest",
        "en-US": "Study interest",
        "en-SG": "Study interest",
        "hi-IN": "अध्ययन की रुचि",
        "ta-IN": "படிப்பில் ஆர்வம்",
      },
      type: "text",
      required: false,
      sensitive: false,
      order: 1,
      archived: false,
      ...timestamps,
    },
    {
      id: CUSTOM_FIELD[key].supportNote,
      tenantId: TENANT[key],
      entity: "learner",
      key: LEARNER_FIELD.supportNote,
      label: {
        "en-IN": "Learner support note",
        "en-GB": "Learner support note",
        "en-US": "Learner support note",
        "en-SG": "Learner support note",
        "hi-IN": "विद्यार्थी सहायता नोट",
        "ta-IN": "கற்றவர் ஆதரவுக் குறிப்பு",
      },
      type: "long_text",
      required: false,
      sensitive: true,
      order: 2,
      archived: false,
      ...timestamps,
    },
  ],
);

export const FORM_DEFINITIONS: readonly FormDefinition[] = settings.map(({ key }) => ({
  id: FORM[key],
  tenantId: TENANT[key],
  entity: "learner",
  name: "Learner profile",
  fieldKeys: [LEARNER_FIELD.studyInterest, LEARNER_FIELD.supportNote],
  public: false,
  published: true,
  ...timestamps,
}));

export const WORKFLOW_DEFINITIONS: readonly WorkflowDefinition[] = settings.map(({ key }) => ({
  id: WORKFLOW[key],
  tenantId: TENANT[key],
  subject: "record_change",
  name: "Learner record change approval",
  steps: [
    {
      id: WORKFLOW_STEP[key],
      approverRoleId: roleId(TENANT[key], "admin"),
      slaHours: 48,
      escalateToRoleId: roleId(TENANT[key], "owner"),
    },
  ],
  active: true,
  ...timestamps,
}));

export const NUMBERING_FORMATS: readonly NumberingFormat[] = settings.map(({ key, prefix }) => ({
  id: NUMBERING_FORMAT[key],
  tenantId: TENANT[key],
  subject: "learner",
  pattern: `${prefix}-{YYYY}-{SEQ:4}`,
  resetsYearly: true,
  nextSequence: 5,
  updatedAt: UPDATED_AT,
}));
