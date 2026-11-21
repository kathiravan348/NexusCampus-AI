import { z } from "zod";
import { IdSchema, IsoDateSchema, UtcDateTimeSchema } from "../common";

export const ProjectKindSchema = z.enum([
  "onboarding",
  "migration",
  "self_hosted_install",
  "training",
]);
export type ProjectKind = z.infer<typeof ProjectKindSchema>;

export const ProjectTaskSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  done: z.boolean(),
  dueDate: IsoDateSchema.nullable(),
});
export type ProjectTask = z.infer<typeof ProjectTaskSchema>;

/** An implementation project for a customer (P15): onboarding plan, data migration, install, training. */
export const ImplementationProjectSchema = z
  .strictObject({
    id: IdSchema,
    accountId: IdSchema,
    kind: ProjectKindSchema,
    status: z.enum(["planned", "in_progress", "live", "on_hold"]),
    leadStaffId: IdSchema,
    goLiveDate: IsoDateSchema.nullable(),
    tasks: z.array(ProjectTaskSchema).min(1),
    /** Plan drafted by AI for a consultant to edit (P15). */
    planAiDrafted: z.boolean(),
    createdAt: UtcDateTimeSchema,
  })
  .refine((p) => p.status !== "live" || (p.goLiveDate !== null && p.tasks.every((t) => t.done)), {
    message: "a live project has a go-live date and every task done",
    path: ["status"],
  });
export type ImplementationProject = z.infer<typeof ImplementationProjectSchema>;
