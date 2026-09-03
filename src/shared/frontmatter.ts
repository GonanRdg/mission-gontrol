export type SplitFrontmatter = {
  /** Frontmatter lines with the `---` fences removed. */
  frontmatterLines: string[];
  /** Everything after the closing fence. */
  body: string;
};

/**
 * Split a `---`-fenced frontmatter block off the top of a Markdown document.
 * `null` means the document has none — an opening fence that is never closed
 * counts as none, so a body containing a stray `---` can't be misread as
 * frontmatter that swallows the whole file.
 */
export function splitFrontmatter(content: string): SplitFrontmatter | null {
  // A UTF-8 BOM ahead of the fence is invisible in an editor but would
  // otherwise make the whole document read as having no frontmatter.
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0] !== "---") return null;

  const endIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (endIndex === -1) return null;

  return {
    frontmatterLines: lines.slice(1, endIndex),
    body: lines.slice(endIndex + 1).join("\n"),
  };
}
