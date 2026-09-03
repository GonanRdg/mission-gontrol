import { parse as parseYaml } from "yaml";
import { errMsg } from "~/shared/err-msg";
import { splitFrontmatter } from "~/shared/frontmatter";
import {
  MC_ACTION_KEY,
  formatActionIssues,
  skillActionSchema,
  type SkillActionParse,
} from "~/shared/skill-actions";

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
  } catch (e) {
    // Only claim the file as a broken action when it looks like one; every
    // other unparseable skill on disk stays invisible instead of flooding the
    // grid with errors for skills that were never actions.
    if (!mentionsActionBlock(frontmatterText)) return null;
    return { ok: false, name: fallbackName, error: `invalid YAML frontmatter: ${errMsg(e)}` };
  }

  if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) return null;
  const record = frontmatter as Record<string, unknown>;
  if (!(MC_ACTION_KEY in record)) return null;

  const declaredName = typeof record.name === "string" ? record.name.trim() : "";
  const name = declaredName || fallbackName;

  const parsed = skillActionSchema.safeParse(record[MC_ACTION_KEY]);
  if (!parsed.success) return { ok: false, name, error: formatActionIssues(parsed.error) };
  return { ok: true, name, action: parsed.data };
}
