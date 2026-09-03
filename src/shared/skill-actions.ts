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

/**
 * A repeatable context row holds one value the agent should read, so the
 * single-valued configuration widgets are not offered there: repeating a
 * project picker or a checkbox per row means nothing.
 */
export const SOURCE_WIDGETS = ["text", "url", "textarea", "path", "select"] as const;
export const INPUT_WIDGETS = ACTION_WIDGETS;

/**
 * Cosmetic keys degrade rather than fail: an id this build doesn't know is
 * dropped so the action still renders with the default, because a skill written
 * against a newer icon set should not become an unusable card on an older app.
 */
const optionalIcon = z
  .string()
  .optional()
  .transform((value) => (value && isSessionIcon(value) ? value : undefined));

const fieldBaseSchema = z.object({
  id: identifier,
  label: z.string().min(1),
  icon: optionalIcon,
  placeholder: z.string().optional(),
  help: z.string().optional(),
  /** Choices for `widget: select`; ignored by every other widget. */
  choices: z.array(choice).min(1).optional(),
});

/**
 * One selectable type of context row. `token` names the extractor a later phase
 * uses to derive a worktree name from the row's value; unknown extractors fall
 * back to the generated name rather than failing the action.
 */
const actionSource = fieldBaseSchema
  .extend({ widget: z.enum(SOURCE_WIDGETS), token: z.string().min(1).optional() })
  .strict();

const actionInput = fieldBaseSchema
  .extend({ widget: z.enum(INPUT_WIDGETS), required: z.boolean().default(false) })
  .strict();

type ActionField = z.infer<typeof actionSource> | z.infer<typeof actionInput>;

const actionOption = z
  .object({
    id: identifier,
    label: z.string().min(1),
    help: z.string().optional(),
    default: z.boolean().default(false),
  })
  .strict();

/** Singular for the message, plural for the issue path. */
type ListName = { singular: string; plural: string };

function checkDuplicateIds(items: { id: string }[], name: ListName, ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (seen.has(item.id)) {
      ctx.addIssue({
        code: "custom",
        path: [name.plural, index, "id"],
        message: `duplicate ${name.singular} id "${item.id}"`,
      });
    }
    seen.add(item.id);
  }
}

function checkSelectChoices(fields: ActionField[], plural: string, ctx: z.RefinementCtx): void {
  for (const [index, field] of fields.entries()) {
    if (field.widget === "select" && !field.choices) {
      ctx.addIssue({ code: "custom", path: [plural, index, "choices"], message: "select needs choices" });
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
    icon: optionalIcon,
    accent: z
      .string()
      .optional()
      .transform((value) => (value && isAccentColorId(value) ? value : undefined)),
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
     * repeat per type, so this is not bounded by how many types are declared —
     * only by the point past which a form stops being a form, since an action
     * demanding more rows than anyone will fill can never start.
     */
    sourcesMin: z.number().int().min(0).max(20).default(0),
    inputs: z.array(actionInput).default([]),
    options: z.array(actionOption).default([]),
    prompt: z.string().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    checkDuplicateIds(value.sources, { singular: "source", plural: "sources" }, ctx);
    checkDuplicateIds(value.inputs, { singular: "input", plural: "inputs" }, ctx);
    checkDuplicateIds(value.options, { singular: "option", plural: "options" }, ctx);
    checkSelectChoices(value.sources, "sources", ctx);
    checkSelectChoices(value.inputs, "inputs", ctx);
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
