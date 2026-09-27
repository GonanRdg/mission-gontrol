import { z } from "zod";
import { TASK_AGENTS } from "./domain";

export const actionFormPreferencesSchema = z
  .object({
    repository: z.string().max(4096).nullable(),
    agent: z.enum(TASK_AGENTS),
    branch: z.string().max(512).nullable(),
    options: z.record(z.string().max(64), z.boolean()),
    sourceTypes: z.array(z.string().max(64)).max(32),
    workflowSkill: z.string().max(64).nullable().optional(),
  })
  .strict();

export type ActionFormPreferences = z.infer<typeof actionFormPreferencesSchema>;
