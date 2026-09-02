import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { TASK_AGENTS } from "./domain";
import { splitFrontmatter } from "./frontmatter";

/**
 * An action is a skill that opts in by carrying an `mc-action` block in its
 * frontmatter. The block declares the form Mission Control renders and the
 * prompt template it fills; the `skill` key names the workflow skill the action
 * drives. Skills without the block are never actions.
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
  icon: z.string().min(1).optional(),
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

function rejectDuplicateIds(
  items: { id: string }[],
  label: string,
  ctx: z.RefinementCtx,
  path: string,
): void {
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (seen.has(item.id)) {
      ctx.addIssue({ code: "custom", path: [path, index, "id"], message: `duplicate ${label} id "${item.id}"` });
    }
    seen.add(item.id);
  }
}

/**
 * Unknown keys are rejected rather than ignored: a mistyped key that silently
 * does nothing is the failure mode the broken-card surface exists to prevent.
 */
export const skillActionSchema = z
  .object({
    title: z.string().min(1),
    icon: z.string().min(1).optional(),
    accent: z.string().min(1).optional(),
    /** Name of the workflow skill this action drives. */
    skill: z.string().min(1),
    /** Narrows which agents may run it; absent means every launcher-visible agent. */
    agents: z.array(z.enum(TASK_AGENTS)).min(1).optional(),
    /** Absent means true, so forgetting the key yields the isolated behaviour. */
    worktree: z.boolean().default(true),
    sources: z.array(actionSource).min(1),
    /** Rows that must be filled before the action can start. */
    sourcesMin: z.number().int().min(0).default(0),
    inputs: z.array(actionInput).default([]),
    options: z.array(actionOption).default([]),
    prompt: z.string().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    rejectDuplicateIds(value.sources, "source", ctx, "sources");
    rejectDuplicateIds(value.inputs, "input", ctx, "inputs");
    rejectDuplicateIds(value.options, "option", ctx, "options");
    if (value.sourcesMin > value.sources.length) {
      ctx.addIssue({
        code: "custom",
        path: ["sourcesMin"],
        message: `sourcesMin (${value.sourcesMin}) exceeds the ${value.sources.length} declared source types`,
      });
    }
    for (const [index, source] of value.sources.entries()) {
      if (source.widget === "select" && !source.choices) {
        ctx.addIssue({ code: "custom", path: ["sources", index, "choices"], message: "select needs choices" });
      }
    }
    for (const [index, input] of value.inputs.entries()) {
      if (input.widget === "select" && !input.choices) {
        ctx.addIssue({ code: "custom", path: ["inputs", index, "choices"], message: "select needs choices" });
      }
    }
  });

export type SkillAction = z.infer<typeof skillActionSchema>;

export type SkillActionParse =
  | { ok: true; name: string; action: SkillAction }
  | { ok: false; name: string; error: string };

/** Compact, human-readable summary of the first few schema violations. */
function formatIssues(error: z.ZodError): string {
  const issues = error.issues.slice(0, 4).map((issue) => {
    const at = issue.path.join(".");
    return at ? `${at}: ${issue.message}` : issue.message;
  });
  const rest = error.issues.length - issues.length;
  return rest > 0 ? `${issues.join("; ")} (+${rest} more)` : issues.join("; ");
}

/** Cheap textual probe used when the YAML itself won't parse. */
function mentionsActionBlock(frontmatter: string): boolean {
  return frontmatter.split(/\r?\n/).some((line) => line.startsWith(`${MC_ACTION_KEY}:`));
}

/**
 * `null` means "not an action" — no frontmatter, or no `mc-action` block. A
 * returned result is an action either way: a failed parse surfaces as a broken
 * entry carrying its error, because a card that vanishes is indistinguishable
 * from a file that was never there.
 */
export function parseSkillAction(content: string, fallbackName: string): SkillActionParse | null {
  const split = splitFrontmatter(content);
  if (!split) return null;

  const frontmatterText = split.frontmatterLines.join("\n");
  let frontmatter: unknown;
  try {
    frontmatter = parseYaml(frontmatterText);
  } catch (e: any) {
    // Only claim the file as a broken action when it looks like one; every
    // other unparseable skill on disk stays invisible instead of flooding the
    // grid with errors for skills that were never actions.
    if (!mentionsActionBlock(frontmatterText)) return null;
    return { ok: false, name: fallbackName, error: `invalid YAML frontmatter: ${e?.message ?? String(e)}` };
  }

  if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) return null;
  const record = frontmatter as Record<string, unknown>;
  if (!(MC_ACTION_KEY in record)) return null;

  const declaredName = typeof record.name === "string" ? record.name.trim() : "";
  const name = declaredName || fallbackName;

  const parsed = skillActionSchema.safeParse(record[MC_ACTION_KEY]);
  if (!parsed.success) return { ok: false, name, error: formatIssues(parsed.error) };
  return { ok: true, name, action: parsed.data };
}
