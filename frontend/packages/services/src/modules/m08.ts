import {
  CustomFieldDefinitionSchema,
  FormDefinitionSchema,
  NumberingFormatSchema,
  PAGE_SIZE_MAX,
  WorkflowDefinitionSchema,
  pageSchema,
  type ConfigEntity,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const CustomFieldDefinitionPage = pageSchema(CustomFieldDefinitionSchema);
const FormDefinitionPage = pageSchema(FormDefinitionSchema);
const WorkflowDefinitionPage = pageSchema(WorkflowDefinitionSchema);
const NumberingFormatPage = pageSchema(NumberingFormatSchema);

export function useCustomFields(entity: ConfigEntity | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m08.customFields(s, entity),
    (c, signal) =>
      c.get("/custom-fields", CustomFieldDefinitionPage, { ...all, entity }, { signal }),
  );
}

export function useForms() {
  return useScopedQuery(queryKeys.m08.forms, (c, signal) =>
    c.get("/forms", FormDefinitionPage, all, { signal }),
  );
}

export function useWorkflows() {
  return useScopedQuery(queryKeys.m08.workflows, (c, signal) =>
    c.get("/workflows", WorkflowDefinitionPage, all, { signal }),
  );
}

export function useNumberingFormats() {
  return useScopedQuery(queryKeys.m08.numberingFormats, (c, signal) =>
    c.get("/numbering-formats", NumberingFormatPage, all, { signal }),
  );
}
