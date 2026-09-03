import { z } from "zod";
import { isAccentColorId } from "~/lib/accent-colors";
import { isSessionIcon } from "~/lib/session-icons";
import { TASK_AGENTS } from "./domain";

/**
 * An action is a skill that opts in by carrying an `mc-action` block in its
 * frontmatter. The block declares the form Mission Control renders and the
 * prompt template it fills; the `skill` key names the workflow skill the action
 * drives. Skills without the block are never actions.
 *
 * Schema and vocabulary live here so the renderer can type a form against them;
 * reading them off disk lives in `src/server/services/skill-actions.ts`.
 */
export const MC_ACTION_KEY = "mc-action";

/**
 * Widgets are app-owned: a new one is a release. The *list* of source types an
 * action offers is not — that lives in the action's own frontmatter.
 */
export const ACTION_WIDGETS = [
  "text",
  "url",
  "textarea",
  "path",
  "project",
  "branch",
  "select",
  "checkbox",
] as const;
export type ActionWidget = (typeof ACTION_WIDGETS)[number];

const identifier = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "must be lower-case letters, digits and dashes")
  .max(64);

const choice = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

const fieldBase = {
  id: identifier,
  label: z.string().min(1),
  widget: z.enum(ACTION_WIDGETS),
  icon: z.string().refine(isSessionIcon, "unknown session icon").optional(),
  placeholder: z.string().optional(),
  help: z.string().optional(),
  /** Choices for `widget: select`; ignored by every other widget. */
  choices: z.array(choice).min(1).optional(),
};

/**
 * One selectable type of context row. `token` names the extractor a later phase
 * uses to derive a worktree name from the row's value; unknown extractors fall
 * back to the generated name rather than failing the action.
 */
const actionSource = z.object({ ...fieldBase, token: z.string().min(1).optional() }).strict();

const actionInput = z.object({ ...fieldBase, required: z.boolean().default(false) }).strict();

const actionOption = z
  .object({
    id: identifier,
    label: z.string().min(1),
    help: z.string().optional(),
    default: z.boolean().default(false),
  })
  .strict();

type Field = { id: string; widget: ActionWidget; choices?: unknown };

function checkFields(fields: Field[], label: string, path: string, ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  for (const [index, field] of fields.entries()) {
    if (seen.has(field.id)) {
      ctx.addIssue({
        code: "custom",
        path: [path, index, "id"],
        message: `duplicate ${label} id "${field.id}"`,
      });
    }
    seen.add(field.id);
    if (field.widget === "select" && !field.choices) {
      ctx.addIssue({ code: "custom", path: [path, index, "choices"], message: "select needs choices" });
    }
  }
}

/**
 * Unknown keys are rejected rather than ignored: a mistyped key that silently
 * does nothing is the failure mode the broken-card surface exists to prevent.
 */
export const skillActionSchema = z
  .object({
    title: z.string().min(1),
    icon: z.string().refine(isSessionIcon, "unknown session icon").optional(),
    accent: z.string().refine(isAccentColorId, "unknown accent colour").optional(),
    /** Name of the workflow skill this action drives. */
    skill: z.string().min(1),
    /** Narrows which agents may run it; absent means every launcher-visible agent. */
    agents: z.array(z.enum(TASK_AGENTS)).min(1).optional(),
    /** Absent means true, so forgetting the key yields the isolated behaviour. */
    worktree: z.boolean().default(true),
    /** Selectable types of context row; an action may take fixed inputs only. */
    sources: z.array(actionSource).default([]),
    /**
     * How many context *rows* must be filled before the action can start. Rows
     * repeat per type, so this is not bounded by how many types are declared.
     */
    sourcesMin: z.number().int().min(0).default(0),
    inputs: z.array(actionInput).default([]),
    options: z.array(actionOption).default([]),
    prompt: z.string().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    checkFields(value.sources, "source", "sources", ctx);
    checkFields(value.inputs, "input", "inputs", ctx);
    const seenOptions = new Set<string>();
    for (const [index, option] of value.options.entries()) {
      if (seenOptions.has(option.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["options", index, "id"],
          message: `duplicate option id "${option.id}"`,
        });
      }
      seenOptions.add(option.id);
    }
    if (value.sourcesMin > 0 && value.sources.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["sourcesMin"],
        message: "sourcesMin needs at least one declared source type",
      });
    }
  });

export type SkillAction = z.infer<typeof skillActionSchema>;

export type SkillActionParse =
  | { ok: true; name: string; action: SkillAction }
  | { ok: false; name: string; error: string };

/** Compact, human-readable summary of the first few schema violations. */
export function formatActionIssues(error: z.ZodError): string {
  const issues = error.issues.slice(0, 4).map((issue) => {
    const at = issue.path.join(".");
    return at ? `${at}: ${issue.message}` : issue.message;
  });
  const rest = error.issues.length - issues.length;
  return rest > 0 ? `${issues.join("; ")} (+${rest} more)` : issues.join("; ");
}
