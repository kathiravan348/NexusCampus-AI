/** Stable IDs for the Stage 4 M44 and M45 demo fixtures (D16). */

export const SURVEY = {
  nbCourseFeedback: "srv-nb-course-feedback",
  nbFacultyElena: "srv-nb-faculty-elena",
  rvStaffWellbeing: "srv-rv-staff-wellbeing",
  rvParentEvening: "srv-rv-parent-evening",
  rvGeneralLibrary: "srv-rv-general-library",
} as const;

export const SURVEY_QUESTION = {
  nbCourseRating: "sqn-nb-course-rating",
  nbCourseFormat: "sqn-nb-course-format",
  nbCourseTopics: "sqn-nb-course-topics",
  nbCourseNotes: "sqn-nb-course-notes",
  nbFacClarity: "sqn-nb-fac-clarity",
  nbFacNotes: "sqn-nb-fac-notes",
  rvStaffWorkload: "sqn-rv-staff-workload",
  rvStaffSupport: "sqn-rv-staff-support",
  rvParentSlot: "sqn-rv-parent-slot",
  rvGeneralClubs: "sqn-rv-general-clubs",
} as const;

export const SURVEY_RESPONSE = {
  nbCourse1: "srp-nb-course-1",
  nbCourse2: "srp-nb-course-2",
  nbCourse3: "srp-nb-course-3",
  nbCourse4: "srp-nb-course-4",
  nbCourse5: "srp-nb-course-5",
  nbFac1: "srp-nb-fac-1",
  nbFac2: "srp-nb-fac-2",
  nbFac3: "srp-nb-fac-3",
  nbFac4: "srp-nb-fac-4",
  nbFac5: "srp-nb-fac-5",
  rvStaffTom: "srp-rv-staff-tom",
  rvStaffAmira: "srp-rv-staff-amira",
  rvParentGrace: "srp-rv-parent-grace",
  rvParentAmira: "srp-rv-parent-amira",
  rvParentDaniel: "srp-rv-parent-daniel",
} as const;

export const SURVEY_RESPONSE_CLIENT = {
  nbCourse1: "e2650000-0000-4000-8000-000000000001",
  nbCourse2: "e2650000-0000-4000-8000-000000000002",
  nbCourse3: "e2650000-0000-4000-8000-000000000003",
  nbCourse4: "e2650000-0000-4000-8000-000000000004",
  nbCourse5: "e2650000-0000-4000-8000-000000000005",
  nbFac1: "e2650000-0000-4000-8000-000000000006",
  nbFac2: "e2650000-0000-4000-8000-000000000007",
  nbFac3: "e2650000-0000-4000-8000-000000000008",
  nbFac4: "e2650000-0000-4000-8000-000000000009",
  nbFac5: "e2650000-0000-4000-8000-000000000010",
  rvStaffTom: "e2650000-0000-4000-8000-000000000011",
  rvStaffAmira: "e2650000-0000-4000-8000-000000000012",
  rvParentGrace: "e2650000-0000-4000-8000-000000000013",
  rvParentAmira: "e2650000-0000-4000-8000-000000000014",
  rvParentDaniel: "e2650000-0000-4000-8000-000000000015",
} as const;

export const THEME_SUMMARY = {
  nbCoursePublished: "tsm-nb-course-published",
  nbFacDraft: "tsm-nb-fac-draft",
} as const;

export const CREDENTIAL_TEMPLATE = {
  rvFracBadge: "ctp-rv-frac-badge",
  rvSafetyCert: "ctp-rv-safety-cert",
  nbCsMicro: "ctp-nb-cs-micro",
  nbBscsDiploma: "ctp-nb-bscs-diploma",
} as const;

export const ISSUED_CREDENTIAL = {
  rvMiaBadge: "icr-rv-mia-badge",
  rvOliverExpired: "icr-rv-oliver-expired",
  nbJordanRevoked: "icr-nb-jordan-revoked",
  nbAidenHidden: "icr-nb-aiden-hidden",
} as const;

export const CREDENTIAL_URI = {
  rvMiaBadge: "urn:uuid:e2651000-0000-4000-8000-000000000001",
  rvOliverExpired: "urn:uuid:e2651000-0000-4000-8000-000000000002",
  nbJordanRevoked: "urn:uuid:e2651000-0000-4000-8000-000000000003",
  nbAidenHidden: "urn:uuid:e2651000-0000-4000-8000-000000000004",
} as const;

export const VERIFICATION_CODE = {
  rvMiaBadge: "RV5MATH8A2",
  rvOliverExpired: "RVLABEXP14",
  nbJordanRevoked: "NBCSREV092",
  nbAidenHidden: "NBCSHID044",
  unknown: "UNKNOWN999",
} as const;

export const DEFERRED_PORTFOLIO_ENTRY = {
  assignmentSubmission: "pfe-assignment-submission",
  credential: "pfe-credential",
} as const;
