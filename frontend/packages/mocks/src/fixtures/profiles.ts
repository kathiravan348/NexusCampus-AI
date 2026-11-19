import type { InstitutionTypeProfile, ModuleId } from "@nexus/contracts";

/** Core modules every institution starts with (docs/MODULES.md, Stage 1). */
const CORE: readonly ModuleId[] = ["M01", "M02", "M03", "M04", "M05", "M06", "M07", "M83"];

/** Defaults per institution type used by the demo tenants (REQUIREMENTS §3). */
export const INSTITUTION_TYPE_PROFILES = [
  {
    type: "ey",
    defaultModules: [...CORE, "M10"],
    structure: "terms",
    gradingScheme: "grd-ey-observation",
    terminologyPack: "ey",
  },
  {
    type: "k12",
    defaultModules: [...CORE, "M10", "M11"],
    structure: "terms",
    gradingScheme: "grd-k12-letter",
    terminologyPack: "k12",
  },
  {
    type: "he",
    defaultModules: [...CORE, "M11"],
    structure: "semesters",
    gradingScheme: "grd-he-gpa4",
    terminologyPack: "he",
  },
  {
    type: "tp",
    defaultModules: [...CORE, "M10", "M11"],
    structure: "rolling",
    gradingScheme: "grd-tp-percent",
    terminologyPack: "tp",
  },
  {
    type: "sk",
    defaultModules: [...CORE],
    structure: "rolling",
    gradingScheme: "grd-sk-level",
    terminologyPack: "sk",
  },
  {
    type: "grp",
    defaultModules: [...CORE, "M10", "M11"],
    structure: "terms",
    gradingScheme: "grd-k12-letter",
    terminologyPack: "grp",
  },
] satisfies readonly InstitutionTypeProfile[];
