export type ActionTemplateValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ActionTemplateValue[]
  | { [key: string]: ActionTemplateValue };

export type ActionTemplateContext = { [key: string]: ActionTemplateValue };

type TemplateNode =
  | { kind: "text"; value: string }
  | { kind: "value"; path: string }
  | { kind: "block"; path: string; children: TemplateNode[] };

const TOKEN_RE = /{{([#/])?([^{}]+)}}/g;
const PATH_RE = /^(?:\.|[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*)$/;

function assertPath(path: string): void {
  if (!PATH_RE.test(path)) throw new Error(`invalid template path "${path}"`);
}

function parseTemplate(template: string): TemplateNode[] {
  const root: TemplateNode[] = [];
  const stack: { path: string; nodes: TemplateNode[] }[] = [];
  let nodes = root;
  let cursor = 0;

  for (const match of template.matchAll(TOKEN_RE)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push({ kind: "text", value: template.slice(cursor, index) });

    const marker = match[1] ?? "";
    const path = (match[2] ?? "").trim();
    assertPath(path);

    if (marker === "#") {
      const block: TemplateNode = { kind: "block", path, children: [] };
      nodes.push(block);
      stack.push({ path, nodes });
      nodes = block.children;
    } else if (marker === "/") {
      const open = stack.pop();
      if (!open || open.path !== path) {
        throw new Error(`unexpected closing block "${path}"`);
      }
      nodes = open.nodes;
    } else {
      nodes.push({ kind: "value", path });
    }
    cursor = index + match[0].length;
  }

  if (cursor < template.length) nodes.push({ kind: "text", value: template.slice(cursor) });
  const unclosed = stack.at(-1);
  if (unclosed) throw new Error(`unclosed block "${unclosed.path}"`);
  return root;
}

function readPath(
  path: string,
  root: ActionTemplateContext,
  current: ActionTemplateValue,
): ActionTemplateValue {
  if (path === ".") return current;
  let value: ActionTemplateValue = root;
  for (const part of path.split(".")) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    value = value[part];
  }
  return value;
}

function hasValue(value: ActionTemplateValue): boolean {
  if (Array.isArray(value)) return value.some(hasValue);
  if (typeof value === "string") return value.length > 0;
  return value !== undefined && value !== null && value !== false;
}

function interpolate(value: ActionTemplateValue): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value === true) return "true";
  return "";
}

function renderNodes(
  nodes: TemplateNode[],
  root: ActionTemplateContext,
  current: ActionTemplateValue,
): string {
  let output = "";
  for (const node of nodes) {
    if (node.kind === "text") {
      output += node.value;
      continue;
    }
    const value = readPath(node.path, root, current);
    if (node.kind === "value") {
      output += interpolate(value);
      continue;
    }
    if (Array.isArray(value)) {
      output += value
        .filter(hasValue)
        .map((item) => renderNodes(node.children, root, item))
        .join("");
    } else if (hasValue(value)) {
      output += renderNodes(node.children, root, value);
    }
  }
  return output;
}

/** Renders the deliberately small `mc-action` template language. */
export function renderActionPrompt(template: string, context: ActionTemplateContext): string {
  return renderNodes(parseTemplate(template), context, context);
}
