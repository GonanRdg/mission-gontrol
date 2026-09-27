import { z } from "zod";
import {
  installDiagramSkill,
  readDiagramSkillInstallStatus,
} from "../services/install-diagram-skill";
import {
  installShipSkills,
  readShipSkillInstallStatus,
} from "../services/install-ship-skills";
import { discoverActions, discoverWorkflowSkillNames } from "../services/skill-discovery";
import {
  installActionWorkflow,
  readActionWorkflowAvailabilities,
} from "../services/install-action-workflow";
import {
  readActionFormPreferences,
  writeActionFormPreferences,
  deleteActionFormPreferences,
} from "../services/action-form-preferences";
import { getProject } from "../services/projects";
import { handleDomainError, json, jsonError, notFound, parseJsonBody } from "./_helpers";
import { HTTP_BAD_REQUEST } from "~/shared/http-status";
import { TASK_AGENTS } from "~/shared/domain";
import { actionFormPreferencesSchema } from "~/shared/action-form-preferences";

const harnessSelectionBody = z
  .object({
    claude: z.boolean().optional(),
    codex: z.boolean().optional(),
    cursor: z.boolean().optional(),
  })
  .optional()
  .default({});

const diagramInstallBody = z.object({
  projectPath: z.string().min(1, "projectPath is required"),
  harnesses: harnessSelectionBody,
});

const shipInstallBody = z.object({
  projectPath: z.string().min(1, "projectPath is required"),
  harnesses: harnessSelectionBody,
});

const actionWorkflowInstallBody = z.object({
  projectId: z.string().min(1),
  actionName: z.string().min(1).max(64),
  agent: z.enum(TASK_AGENTS),
  workflowSkill: z.string().min(1).max(64).optional(),
});

const actionPreferenceKey = z.object({
  projectId: z.string().min(1),
  actionName: z.string().min(1).max(64),
});

const actionPreferenceBody = actionPreferenceKey
  .extend({ preferences: actionFormPreferencesSchema })
  .strict();

function actionExists(projectId: string, actionName: string): boolean {
  const project = getProject(projectId);
  if (!project) return false;
  return discoverActions({ projectPath: project.path }).some(
    (candidate) => candidate.ok && candidate.name === actionName,
  );
}

/**
 * Actions visible from a project. Without `projectId` the project tier is
 * dropped and only the global and bundled roots are scanned.
 */
export function listActions(url: URL): Response {
  const projectId = url.searchParams.get("projectId")?.trim();
  let projectPath: string | null = null;
  if (projectId) {
    const project = getProject(projectId);
    if (!project) return notFound("project not found");
    projectPath = project.path;
  }
  const skills = discoverWorkflowSkillNames({ projectPath }).map((name) => ({
    name,
    workflows: readActionWorkflowAvailabilities(name, {
      projectPath: projectPath ?? process.cwd(),
    }),
  }));
  return json({
    actions: discoverActions({ projectPath }).map((entry) =>
      entry.ok
        ? {
            ...entry,
            workflows: readActionWorkflowAvailabilities(entry.action.skill, {
              projectPath: projectPath ?? process.cwd(),
            }),
            skills,
          }
        : entry,
    ),
  });
}

export async function installAction(request: Request): Promise<Response> {
  const parsed = await parseJsonBody(request, actionWorkflowInstallBody);
  if (!parsed.ok) return parsed.response;
  const project = getProject(parsed.data.projectId);
  if (!project) return notFound("project not found");
  const entry = discoverActions({ projectPath: project.path }).find(
    (candidate) => candidate.name === parsed.data.actionName,
  );
  if (!entry) return notFound("action not found");
  if (!entry.ok) return jsonError(HTTP_BAD_REQUEST, "broken actions cannot be installed");
  if (entry.action.agents && !entry.action.agents.includes(parsed.data.agent)) {
    return jsonError(HTTP_BAD_REQUEST, "agent is not supported by this action");
  }
  try {
    const availability = await installActionWorkflow(
    parsed.data.workflowSkill ?? entry.action.skill,
      parsed.data.agent,
      { projectPath: project.path },
    );
    return json({ availability });
  } catch (e) {
    const mapped = handleDomainError(e);
    if (mapped) return mapped;
    return jsonError(HTTP_BAD_REQUEST, e instanceof Error ? e.message : "Install failed");
  }
}

export function readActionPreferences(url: URL): Response {
  const parsed = actionPreferenceKey.safeParse({
    projectId: url.searchParams.get("projectId")?.trim() ?? "",
    actionName: url.searchParams.get("actionName")?.trim() ?? "",
  });
  if (!parsed.success) return jsonError(HTTP_BAD_REQUEST, "projectId and actionName are required");
  if (!getProject(parsed.data.projectId)) return notFound("project not found");
  if (!actionExists(parsed.data.projectId, parsed.data.actionName)) return notFound("action not found");
  return json({
    preferences: readActionFormPreferences(parsed.data.projectId, parsed.data.actionName),
  });
}

export async function updateActionPreferences(request: Request): Promise<Response> {
  const parsed = await parseJsonBody(request, actionPreferenceBody);
  if (!parsed.ok) return parsed.response;
  if (!getProject(parsed.data.projectId)) return notFound("project not found");
  if (!actionExists(parsed.data.projectId, parsed.data.actionName)) return notFound("action not found");
  return json({
    preferences: writeActionFormPreferences(
      parsed.data.projectId,
      parsed.data.actionName,
      parsed.data.preferences,
    ),
  });
}

export function resetActionPreferences(url: URL): Response {
  const parsed = actionPreferenceKey.safeParse({
    projectId: url.searchParams.get("projectId")?.trim() ?? "",
    actionName: url.searchParams.get("actionName")?.trim() ?? "",
  });
  if (!parsed.success) return jsonError(HTTP_BAD_REQUEST, "projectId and actionName are required");
  if (!getProject(parsed.data.projectId)) return notFound("project not found");
  deleteActionFormPreferences(parsed.data.projectId, parsed.data.actionName);
  return json({ preferences: null });
}

export function diagramInstalled(url: URL): Response {
  const projectPath = url.searchParams.get("projectPath") ?? "";
  return json({ installed: readDiagramSkillInstallStatus(projectPath) });
}

export async function installDiagram(request: Request): Promise<Response> {
  const parsed = await parseJsonBody(request, diagramInstallBody);
  if (!parsed.ok) return parsed.response;
  try {
    const result = await installDiagramSkill({
      projectPath: parsed.data.projectPath,
      harnesses: {
        claude: !!parsed.data.harnesses?.claude,
        codex: !!parsed.data.harnesses?.codex,
        cursor: !!parsed.data.harnesses?.cursor,
      },
    });
    return json({ result });
  } catch (e: any) {
    const mapped = handleDomainError(e);
    if (mapped) return mapped;
    return jsonError(HTTP_BAD_REQUEST, e?.message ?? "Install failed");
  }
}

export function shipInstalled(url: URL): Response {
  const projectPath = url.searchParams.get("projectPath") ?? "";
  return json({ installed: readShipSkillInstallStatus(projectPath) });
}

export async function installShip(request: Request): Promise<Response> {
  const parsed = await parseJsonBody(request, shipInstallBody);
  if (!parsed.ok) return parsed.response;
  try {
    const result = await installShipSkills({
      projectPath: parsed.data.projectPath,
      harnesses: {
        claude: !!parsed.data.harnesses?.claude,
        codex: !!parsed.data.harnesses?.codex,
        cursor: !!parsed.data.harnesses?.cursor,
      },
    });
    return json({ result });
  } catch (e: any) {
    const mapped = handleDomainError(e);
    if (mapped) return mapped;
    return jsonError(HTTP_BAD_REQUEST, e?.message ?? "Install failed");
  }
}
