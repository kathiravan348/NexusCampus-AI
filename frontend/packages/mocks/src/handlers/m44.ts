import {
  QuestionResultSchema,
  SurveySchema,
  ThemeSummarySchema,
  pageSchema,
  type Survey,
} from "@nexus/contracts";
import { ApiFailure, ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { FACULTY_RESULT_VIEWER_PROFILE_IDS } from "../fixtures";
import { found, get, list, ok, type RouteContext } from "./route";

const READ = { module: "M44", permission: "m44.survey.read" } as const;
const RESULTS = { module: "M44", permission: "m44.results.read" } as const;
const surveyPage = pageSchema(SurveySchema);
const resultPage = pageSchema(QuestionResultSchema);
const themePage = pageSchema(ThemeSummarySchema);
const roleFor = { learners: "learner", guardians: "guardian", staff: "staff" } as const;

function profilesOf(viewer: Viewer) {
  return ofTenant(mockDb.roleProfiles, viewer.tenantId).filter(
    (profile) => profile.personId === viewer.personId,
  );
}

function visibleSurveys(viewer: Viewer): Survey[] {
  const rows = ofTenant(mockDb.surveys, viewer.tenantId);
  if (viewer.permissions.has("m44.survey.manage")) return rows;
  const roles = new Set(profilesOf(viewer).map((profile) => profile.kind));
  return rows.filter(
    (row) => (row.status === "open" || row.status === "closed") && roles.has(roleFor[row.audience]),
  );
}

function surveyForResults({ params, viewer }: RouteContext): Survey {
  const survey = found(
    ofTenant(mockDb.surveys, viewer.tenantId).find((row) => row.id === params["id"]),
  );
  if (survey.kind === "faculty_feedback") {
    const allowed = FACULTY_RESULT_VIEWER_PROFILE_IDS[survey.id];
    const canSee = profilesOf(viewer).some(
      (profile) => profile.kind === "staff" && allowed?.includes(profile.id),
    );
    if (!canSee) {
      throw new ApiFailure("not_found");
    }
  }
  return survey;
}

export const m44Handlers = [
  get("/surveys", READ, (ctx) => list(ctx, visibleSurveys(ctx.viewer), surveyPage)),
  get("/surveys/:id", READ, (ctx) =>
    ok(SurveySchema, found(visibleSurveys(ctx.viewer).find((row) => row.id === ctx.params["id"]))),
  ),
  get("/surveys/:id/results", RESULTS, (ctx) => {
    const survey = surveyForResults(ctx);
    // Question results belong to the tenant through their parent survey.
    const rows = mockDb.questionResults.filter((row) => row.surveyId === survey.id);
    return list(ctx, rows, resultPage);
  }),
  get("/surveys/:id/themes", RESULTS, (ctx) => {
    const survey = surveyForResults(ctx);
    const rows = ofTenant(mockDb.themeSummaries, ctx.viewer.tenantId).filter(
      (row) => row.surveyId === survey.id && row.basedOnResponses >= survey.minResponsesToShow,
    );
    return list(ctx, rows, themePage);
  }),
];
