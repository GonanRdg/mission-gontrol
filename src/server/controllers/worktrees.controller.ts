import { z } from "zod";
import {
  createWorktree,
  deleteWorktree,
  listWorktrees,
  worktreeErrorPayload,
} from "../services/worktrees";
import { handleDomainError, idParam, json, jsonError, noContent, notFound, parseJsonBody } from "./_helpers";
import { HTTP_BAD_REQUEST, HTTP_CONFLICT, HTTP_CREATED } from "~/shared/http-status";
import { TASK_AGENTS } from "~/shared/domain";
import { WORKTREE_NAME_RE } from "~/shared/worktrees";
import { generateActionWorktreeName } from "../services/action-worktree-name";

const createBody = z.object({
  name: z.string().regex(WORKTREE_NAME_RE).optional(),
  freeText: z.string().trim().min(1).max(8_000).optional(),
  prefix: z.string().regex(/^[a-z0-9]+$/).optional(),
  agent: z.enum(TASK_AGENTS).optional(),
});

const deleteBody = z.object({
  force: z.boolean().optional(),
  stashChanges: z.boolean().optional(),
}).optional();

function booleanQueryFlag(url: URL, name: string): boolean | undefined {
  const value = url.searchParams.get(name);
  if (value === null) return undefined;
  return value === "1" || value.toLowerCase() === "true";
}

function asWorktreeErrorResponse(e: unknown): Response {
  const payload = worktreeErrorPayload(e);
  return jsonError(payload.dirty ? HTTP_CONFLICT : HTTP_BAD_REQUEST, payload.stderr ?? payload.message);
}

export async function list(rawProjectId: string, _request: Request): Promise<Response> {
  const parsed = idParam.safeParse(rawProjectId);
  if (!parsed.success) return notFound();
  try {
    return json({ worktrees: await listWorktrees(parsed.data) });
  } catch (e) {
    return handleDomainError(e) ?? asWorktreeErrorResponse(e);
  }
}

export async function create(rawProjectId: string, request: Request): Promise<Response> {
  const parsed = idParam.safeParse(rawProjectId);
  if (!parsed.success) return notFound();
  const body = await parseJsonBody(request, createBody);
  if (!body.ok) return body.response;
  try {
    const generatedName =
      !body.data.name && body.data.freeText && body.data.prefix && body.data.agent
        ? await generateActionWorktreeName({
            agent: body.data.agent,
            prefix: body.data.prefix,
            text: body.data.freeText,
          })
        : null;
    return json(await createWorktree(parsed.data, body.data.name ?? generatedName ?? undefined), {
      status: HTTP_CREATED,
    });
  } catch (e) {
    return handleDomainError(e) ?? asWorktreeErrorResponse(e);
  }
}

export async function remove(
  rawProjectId: string,
  rawWorktreeId: string,
  request: Request,
): Promise<Response> {
  const projectId = idParam.safeParse(rawProjectId);
  const worktreeId = z.string().min(1).safeParse(rawWorktreeId);
  if (!projectId.success || !worktreeId.success) return notFound();
  const parsed = await parseJsonBody(request, deleteBody);
  if (!parsed.ok) return parsed.response;
  const url = new URL(request.url);
  try {
    const deleted = await deleteWorktree({
      projectId: projectId.data,
      worktreeId: worktreeId.data,
      force: parsed.data?.force ?? booleanQueryFlag(url, "force"),
      stashChanges: parsed.data?.stashChanges ?? booleanQueryFlag(url, "stashChanges"),
    });
    return deleted ? noContent() : notFound();
  } catch (e) {
    return handleDomainError(e) ?? asWorktreeErrorResponse(e);
  }
}
