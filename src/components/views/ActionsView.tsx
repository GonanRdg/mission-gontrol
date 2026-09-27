import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Btn } from "~/components/ui/Btn";
import { CardFrame } from "~/components/ui/CardFrame";
import { Icon } from "~/components/ui/Icon";
import { ProjectIcon } from "~/components/ui/ProjectIcon";
import { SessionIcon } from "~/components/ui/SessionIcon";
import { Textarea } from "~/components/ui/Textarea";
import { TextField } from "~/components/ui/TextField";
import { HotkeyTooltip } from "~/components/ui/Tooltip";
import { FileFinderDialog } from "~/components/views/FileFinderDialog";
import { ProjectPicker } from "~/components/views/ProjectPicker";
import {
  buildActionTemplateContext,
  createActionFormState,
  getActionFormPreferences,
  getActionFieldInitialValue,
  validateActionForm,
  type ActionFormProject,
  type ActionFormState,
} from "~/lib/action-form";
import { api } from "~/lib/api";
import { mcToastResultCard } from "~/lib/mc-toast";
import { useActionFormPreferencesAutosave } from "~/lib/use-action-form-preferences-autosave";
import {
  adaptActionPromptForAgent,
  readRecentActionLaunches,
  selectActionWorkflow,
  type ActionLaunchIntent,
} from "~/lib/action-launch-intent";
import { useHotkey } from "~/lib/use-hotkey";
import { renderActionPrompt } from "~/lib/action-template";
import { resolveActionWorktreeSuggestion } from "~/lib/action-worktree-name";
import { accentCssVars } from "~/lib/accent-colors";
import { AGENT_REGISTRY, UI_AGENTS } from "~/shared/agents";
import { useGitBranches } from "~/queries/git";
import { queryKeys, useActionFormPreferences, useProjects } from "~/queries";
import type { TaskAgent } from "~/shared/domain";
import type { ActionFormPreferences } from "~/shared/action-form-preferences";
import type { ProjectWithCounts } from "~/shared/projects";
import type {
  ActionListItem,
  ActionWorkflowChoice,
  SkillAction,
} from "~/shared/skill-actions";

const selectStyle: CSSProperties = {
  width: "100%",
  height: 44,
  padding: "0 10px",
  borderRadius: 7,
  border: "1px solid var(--border)",
  background: "var(--surface-0)",
  color: "var(--text)",
  fontFamily: "var(--mono)",
  fontSize: 12,
};

const fieldLabelStyle: CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 10.5,
  fontWeight: 500,
  color: "var(--text-dim)",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
};

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      style={fieldLabelStyle}
    >
      {children}
    </label>
  );
}

function SelectField({
  label,
  value,
  choices,
  onChange,
  hint,
  required,
}: {
  label: string;
  value: string;
  choices: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  hint?: string;
  required?: boolean;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select
        id={id}
        value={value}
        required={required}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.value)}
        style={selectStyle}
      >
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
      {hint && (
        <span id={hintId} style={{ color: "var(--text-faint)", fontFamily: "var(--mono)", fontSize: 10.5 }}>
          {hint}
        </span>
      )}
    </div>
  );
}

type RenderableField = SkillAction["sources"][number] | SkillAction["inputs"][number];

function ActionProjectField({
  label,
  hint,
  project,
  projects,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  project: ActionFormProject;
  projects: ProjectWithCounts[];
  value: string;
  onChange: (value: string) => void;
}) {
  const labelId = useId();
  const selectedProject = projects.find((candidate) => candidate.path === value) ?? project;
  return (
    <div role="group" aria-labelledby={labelId} style={{ display: "grid", gap: 6 }}>
      <span id={labelId} style={fieldLabelStyle}>
        {label}
      </span>
      <div className="mc-actions-project-picker">
        <ProjectPicker
          projectId={selectedProject.id}
          hotkeyEnabled={false}
          fullWidth
          onSelectProject={(projectId) => {
            const nextProject = projects.find((candidate) => candidate.id === projectId);
            if (nextProject) onChange(nextProject.path);
          }}
        />
      </div>
      <span
        style={{
          color: "var(--text-faint)",
          fontFamily: "var(--mono)",
          fontSize: 10.5,
          overflowWrap: "anywhere",
        }}
      >
        {hint ?? selectedProject.path}
      </span>
    </div>
  );
}

function ActionBranchField({
  label,
  hint,
  placeholder,
  required,
  value,
  projectId,
  onChange,
}: {
  label: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  value: string;
  projectId: string;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const branches = useGitBranches(projectId);
  return (
    <>
      <TextField
        label={label}
        hint={hint}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        mono
        required={required}
        list={listId}
        autoComplete="off"
      />
      <datalist id={listId}>
        {(branches.data?.branches ?? []).map((branch) => (
          <option key={branch.name} value={branch.name} />
        ))}
      </datalist>
    </>
  );
}

function ActionFieldControl({
  field,
  value,
  project,
  projects,
  onChange,
  onBrowse,
  requiredOverride,
}: {
  field: RenderableField;
  value: string | boolean;
  project: ActionFormProject;
  projects: ProjectWithCounts[];
  onChange: (value: string | boolean) => void;
  onBrowse: () => void;
  requiredOverride?: boolean;
}) {
  const required = requiredOverride || ("required" in field && field.required);
  if (field.widget === "checkbox") {
    return (
      <label
        style={{
          minHeight: 38,
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "8px 11px",
          borderRadius: 7,
          background: "var(--surface-0)",
          border: "1px solid var(--border)",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={value === true}
          required={required}
          onChange={(event) => onChange(event.target.checked)}
          style={{ width: 15, height: 15, accentColor: "var(--accent)" }}
        />
        <span style={{ display: "grid", gap: 2 }}>
          <span style={{ color: "var(--text)", fontSize: 13 }}>{field.label}</span>
          {field.help && (
            <span style={{ color: "var(--text-faint)", fontFamily: "var(--mono)", fontSize: 10.5 }}>
              {field.help}
            </span>
          )}
        </span>
      </label>
    );
  }

  if (field.widget === "textarea") {
    return (
      <Textarea
        label={field.label}
        hint={field.help}
        value={String(value)}
        onChange={onChange}
        placeholder={field.placeholder}
        rows={4}
        required={required}
      />
    );
  }

  if (field.widget === "select") {
    return (
      <SelectField
        label={field.label}
        value={String(value)}
        choices={field.choices ?? []}
        onChange={onChange}
        hint={field.help}
        required={required}
      />
    );
  }

  if (field.widget === "project") {
    return (
      <ActionProjectField
        label={field.label}
        hint={field.help}
        project={project}
        projects={projects}
        value={String(value)}
        onChange={(nextValue) => onChange(nextValue)}
      />
    );
  }

  if (field.widget === "branch") {
    return (
      <ActionBranchField
        label={field.label}
        hint={field.help}
        placeholder={field.placeholder}
        required={required}
        value={String(value)}
        projectId={project.id}
        onChange={(nextValue) => onChange(nextValue)}
      />
    );
  }

  return (
    <TextField
      label={field.label}
      hint={field.help}
      value={String(value)}
      onChange={onChange}
      placeholder={field.placeholder}
      type={field.widget === "url" ? "url" : "text"}
      mono={field.widget === "path"}
      required={required}
      rightAddon={
        field.widget === "path" ? (
          <Btn size="sm" variant="ghost" icon="folder" onClick={onBrowse} type="button">
            Browse
          </Btn>
        ) : undefined
      }
    />
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h3
        style={{
          margin: 0,
          color: "var(--text-dim)",
          fontFamily: "var(--mono)",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

export type ActionStartRequest = {
  project: ProjectWithCounts;
  intent: ActionLaunchIntent;
};

function ActionEditor({
  action,
  actionName,
  skills,
  project,
  projects,
  preferences,
  onStart,
  onPreferencesChange,
  onInstallWorkflow,
  onResetPreferences,
}: {
  action: SkillAction;
  actionName: string;
  skills: ActionWorkflowChoice[];
  project: ProjectWithCounts;
  projects: ProjectWithCounts[];
  preferences: ActionFormPreferences | null;
  onStart: (request: ActionStartRequest) => void | Promise<void>;
  onPreferencesChange: (preferences: ActionFormPreferences) => Promise<void>;
  onInstallWorkflow: (actionName: string, workflowSkill: string, agent: TaskAgent) => Promise<void>;
  onResetPreferences: () => Promise<void>;
}) {
  const formProject: ActionFormProject = {
    id: project.id,
    name: project.name,
    path: project.path,
    branch: project.branch,
  };
  const [state, setState] = useState<ActionFormState>(() => {
    const repositoryAvailable =
      !preferences?.repository ||
      preferences.repository === project.path ||
      projects.some((candidate) => candidate.path === preferences.repository);
    return createActionFormState(
      action,
      formProject,
      repositoryAvailable ? preferences : { ...preferences!, repository: null },
    );
  });
  const sourceKey = useRef(state.sources.length);
  const issueSummaryRef = useRef<HTMLDivElement>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [launching, setLaunching] = useState(false);
  const [installingWorkflow, setInstallingWorkflow] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [workflowSkill, setWorkflowSkill] = useState(preferences?.workflowSkill ?? action.skill);
  const [fileTarget, setFileTarget] = useState<
    { kind: "source"; key: string } | { kind: "input"; id: string } | null
  >(null);
  const availableAgents = (action.agents ?? UI_AGENTS).filter(
    (agent) => AGENT_REGISTRY[agent].uiVisible,
  );
  const selectedSkill = skills.find((candidate) => candidate.name === workflowSkill);
  const workflow = selectedSkill?.workflows[state.agent] ?? {
    agent: state.agent,
    status: "unavailable" as const,
    origin: null,
    sourcePath: null,
    targetPath: "",
    installMethod: null,
  };
  const recentLaunch = useMemo(
    () => readRecentActionLaunches(project.id).find((entry) => entry.intent.actionName === actionName) ?? null,
    [actionName, project.id],
  );
  const projectInput = action.inputs.find((input) => input.widget === "project");
  const executionInputs = action.inputs.filter((input) => input.widget === "project" || input.widget === "branch");
  const actionInputs = action.inputs.filter((input) => input.widget !== "project" && input.widget !== "branch");
  const selectedProject = projectInput
    ? projects.find((candidate) => candidate.path === state.inputs[projectInput.id]) ?? null
    : project;
  const activeFormProject: ActionFormProject = selectedProject
    ? {
        id: selectedProject.id,
        name: selectedProject.name,
        path: selectedProject.path,
        branch: selectedProject.branch,
      }
    : formProject;
  const effectiveState = state;
  const promptContext = useMemo(
    () => buildActionTemplateContext(action, effectiveState, activeFormProject),
    [action, activeFormProject.branch, activeFormProject.id, activeFormProject.name, activeFormProject.path, effectiveState],
  );
  const preview = useMemo(() => {
    try {
      return {
        ok: true as const,
        value: adaptActionPromptForAgent(
          selectActionWorkflow(
            renderActionPrompt(action.prompt, promptContext),
            action.skill,
            workflowSkill,
          ),
          workflowSkill,
          state.agent,
        ),
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Could not render prompt",
      };
    }
  }, [action.prompt, action.skill, promptContext, state.agent, workflowSkill]);
  const preferenceSnapshot = useMemo(
    () => getActionFormPreferences(action, state, preferences?.workflowSkill ?? null),
    [action, state],
  );
  useActionFormPreferencesAutosave(preferenceSnapshot, onPreferencesChange);
  useEffect(() => {
    if (issues.length > 0) issueSummaryRef.current?.focus();
  }, [issues]);

  const setInput = (id: string, value: string | boolean) => {
    setIssues([]);
    setState((current) => ({ ...current, inputs: { ...current.inputs, [id]: value } }));
  };
  const setOption = (id: string, value: boolean) => {
    setIssues([]);
    setState((current) => ({ ...current, options: { ...current.options, [id]: value } }));
  };
  const setSource = (key: string, change: Partial<{ sourceId: string; value: string }>) => {
    setIssues([]);
    setState((current) => ({
      ...current,
      sources: current.sources.map((row) => (row.key === key ? { ...row, ...change } : row)),
    }));
  };

  const pickFile = (path: string) => {
    if (fileTarget?.kind === "source") setSource(fileTarget.key, { value: path });
    if (fileTarget?.kind === "input") setInput(fileTarget.id, path);
    setFileTarget(null);
  };

  const start = async () => {
    const nextIssues = validateActionForm(action, effectiveState);
    if (!selectedSkill) nextIssues.push("Choose a discovered workflow skill.");
    if (workflow.status !== "available") {
      nextIssues.push(`Install the ${workflowSkill} workflow skill for ${AGENT_REGISTRY[state.agent].label} first.`);
    }
    if (!selectedProject) nextIssues.push("Choose a project that is still available.");
    if (!preview.ok) nextIssues.push(preview.error);
    setIssues(nextIssues);
    if (nextIssues.length > 0 || !selectedProject || !preview.ok || launching) return;

    const branchInput = action.inputs.find((input) => input.widget === "branch");
    const branch = branchInput
      ? String(state.inputs[branchInput.id] ?? "").trim() || selectedProject.branch
      : selectedProject.branch;
    const suggestion = resolveActionWorktreeSuggestion(action, effectiveState);
    setLaunching(true);
    try {
      await onStart({
        project: selectedProject,
        intent: {
          actionName,
          workflowSkill,
          defaultWorkflowSkill: action.skill,
          agent: state.agent,
          branch,
          promptTemplate: action.prompt,
          promptContext,
          worktree: action.worktree,
          preferredWorktreeName: suggestion.preferredName,
          worktreeFreeText: suggestion.freeText,
          worktreePrefix: suggestion.prefix,
        },
      });
    } catch (error) {
      setIssues([error instanceof Error ? error.message : "Could not start this action."]);
    } finally {
      setLaunching(false);
    }
  };

  useHotkey("dialog.submit", () => void start(), {
    enabled: !launching && !installingWorkflow,
    ignoreEditable: false,
  });

  const installWorkflow = async () => {
    if (workflow.status !== "installable" || installingWorkflow) return;
    setIssues([]);
    setInstallingWorkflow(true);
    try {
      await onInstallWorkflow(actionName, workflowSkill, state.agent);
      setAnnouncement(`${workflowSkill} installed for ${AGENT_REGISTRY[state.agent].label}.`);
    } catch (error) {
      setIssues([error instanceof Error ? error.message : "Could not install workflow skill."]);
    } finally {
      setInstallingWorkflow(false);
    }
  };

  const restoreRecentLaunch = () => {
    if (!recentLaunch) return;
    const intent = recentLaunch.intent;
    const recentSources = (intent.promptContext.sources ?? {}) as Record<string, unknown>;
    const recentInputs = (intent.promptContext.inputs ?? {}) as Record<string, string | boolean>;
    const recentOptions = (intent.promptContext.options ?? {}) as Record<string, boolean>;
    const sources = action.sources.flatMap((source) => {
      const values = recentSources[source.id];
      return Array.isArray(values)
        ? values.map((value, index) => ({ key: `recent-${source.id}-${index}`, sourceId: source.id, value: String(value) }))
        : [];
    });
    setState({
      sources: sources.length > 0 ? sources : state.sources,
      inputs: { ...state.inputs, ...recentInputs },
      options: { ...state.options, ...recentOptions },
      agent: intent.agent,
    });
    setWorkflowSkill(intent.workflowSkill);
    setIssues([]);
    setAnnouncement(`Restored the last ${action.title.toLowerCase()} run for review.`);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void start();
      }}
      aria-busy={launching}
      style={{ display: "grid", gap: 24 }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <SessionIcon name={action.icon ?? "workflow"} size={20} style={{ color: "var(--accent)", marginTop: 3 }} />
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, color: "var(--text)", fontSize: 20, fontWeight: 600 }}>
            {action.title}
          </h2>
          <div style={{ marginTop: 4, color: "var(--text-dim)", fontSize: 13 }}>
            Paste the work, check the details, then queue it.
          </div>
        </div>
        {recentLaunch && (
          <Btn type="button" variant="ghost" size="sm" icon="refresh" onClick={restoreRecentLaunch} style={{ marginLeft: "auto" }}>
            Use last run
          </Btn>
        )}
      </div>

      <span className="sr-only" role="status" aria-live="polite">{announcement}</span>

      {action.sources.length > 0 && (
        <FormSection title="What should the agent know?">
          <div style={{ display: "grid", gap: 12 }}>
            {state.sources.map((row, index) => {
              const source = action.sources.find((candidate) => candidate.id === row.sourceId)!;
              return (
                <div className="mc-actions-source-row" key={row.key}>
                  <SelectField
                    label="Context type"
                    value={row.sourceId}
                    choices={action.sources.map((candidate) => ({
                      value: candidate.id,
                      label: candidate.label,
                    }))}
                    onChange={(sourceId) => {
                      const nextSource = action.sources.find((candidate) => candidate.id === sourceId);
                      setSource(row.key, {
                        sourceId,
                        value: nextSource
                          ? String(getActionFieldInitialValue(nextSource, formProject))
                          : "",
                      });
                    }}
                  />
                  <ActionFieldControl
                    field={source}
                    value={row.value}
                    project={activeFormProject}
                    projects={projects}
                    onChange={(value) => setSource(row.key, { value: String(value) })}
                    onBrowse={() => setFileTarget({ kind: "source", key: row.key })}
                    requiredOverride={index < action.sourcesMin}
                  />
                  <Btn
                    type="button"
                    variant="ghost"
                    icon="trash"
                    aria-label={`Remove source ${index + 1}`}
                    title={state.sources.length <= action.sourcesMin ? "This context is required" : "Remove source"}
                    disabled={state.sources.length <= action.sourcesMin}
                    onClick={() => {
                      setIssues([]);
                      setState((current) => ({
                        ...current,
                        sources: current.sources.filter((candidate) => candidate.key !== row.key),
                      }));
                      setAnnouncement(`Removed context ${index + 1}.`);
                    }}
                    style={{ width: 44, minWidth: 44, height: 44, padding: 0, alignSelf: "end" }}
                  />
                </div>
              );
            })}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Btn
                type="button"
                variant="ghost"
                icon="plus"
                onClick={() => {
                  const first = action.sources[0];
                  if (!first) return;
                  setIssues([]);
                  sourceKey.current += 1;
                  setState((current) => ({
                    ...current,
                    sources: [
                      ...current.sources,
                      {
                        key: `source-${sourceKey.current}`,
                        sourceId: first.id,
                        value: String(getActionFieldInitialValue(first, formProject)),
                      },
                    ],
                  }));
                  setAnnouncement("Added another context row.");
                }}
              >
                Add another context
              </Btn>
              {action.sourcesMin > 0 && (
                <span style={{ color: "var(--text-faint)", fontFamily: "var(--mono)", fontSize: 10.5 }}>
                  Paste everything into one row, or separate sources when useful.
                </span>
              )}
            </div>
          </div>
        </FormSection>
      )}

      {actionInputs.length > 0 && (
        <FormSection title="Inputs">
          <div className="mc-actions-input-grid">
            {actionInputs.map((input) => (
              <ActionFieldControl
                key={input.id}
                field={input}
                value={state.inputs[input.id] ?? ""}
                project={activeFormProject}
                projects={projects}
                onChange={(value) => setInput(input.id, value)}
                onBrowse={() => setFileTarget({ kind: "input", id: input.id })}
              />
            ))}
          </div>
        </FormSection>
      )}

      {action.options.length > 0 && (
        <FormSection title="Options">
          <div className="mc-actions-options-grid">
            {action.options.map((option) => (
              <label
                key={option.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 9,
                  padding: "9px 10px",
                  borderRadius: 7,
                  background: "var(--surface-0)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={state.options[option.id] ?? false}
                  onChange={(event) => setOption(option.id, event.target.checked)}
                  style={{ width: 15, height: 15, marginTop: 1, accentColor: "var(--accent)" }}
                />
                <span style={{ display: "grid", gap: 2 }}>
                  <span style={{ color: "var(--text)", fontSize: 12.5 }}>{option.label}</span>
                  {option.help && (
                    <span style={{ color: "var(--text-faint)", fontFamily: "var(--mono)", fontSize: 10.5 }}>
                      {option.help}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </FormSection>
      )}

      <details className="mc-actions-execution">
        <summary>
          <span>Execution settings</span>
          <span>{AGENT_REGISTRY[state.agent].label} · {workflowSkill} · {action.worktree ? "isolated worktree" : "current checkout"}</span>
        </summary>
        <div className="mc-actions-execution-body">
          <FormSection title="Agent">
            <SelectField
              label="Run with"
              value={state.agent}
              choices={availableAgents.map((agent) => ({
                value: agent,
                label: AGENT_REGISTRY[agent].label,
              }))}
              onChange={(agent) => {
                setIssues([]);
                setState((current) => ({ ...current, agent: agent as TaskAgent }));
              }}
            />
          </FormSection>

          <FormSection title="Workflow skill">
            <TextField
              label="Skill"
              value={workflowSkill}
              onChange={(value) => {
                setIssues([]);
                setWorkflowSkill(value);
              }}
              list={`${actionName}-workflow-skills`}
              autoComplete="off"
              mono
            />
            <datalist id={`${actionName}-workflow-skills`}>
              {skills.map((skill) => <option key={skill.name} value={skill.name} />)}
            </datalist>
            <div className="mc-actions-skill-status" data-status={workflow.status}>
              <span>{workflow.status === "available" ? "Available" : workflow.status === "installable" ? "Install required" : "Not found"}</span>
              <span>{workflow.origin === "project" ? "Project" : workflow.origin === "bundled" ? "Bundled" : workflow.origin === "global" ? "Global" : "No source"}</span>
              {workflowSkill === action.skill && <span>Action default</span>}
              {preferences?.workflowSkill === workflowSkill && <span>Saved default</span>}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn
                type="button"
                variant="ghost"
                size="sm"
                disabled={!selectedSkill || preferences?.workflowSkill === workflowSkill}
                onClick={() => void onPreferencesChange(getActionFormPreferences(action, state, workflowSkill)).then(() => setAnnouncement(`${workflowSkill} saved as the default workflow.`))}
              >
                Save skill as default
              </Btn>
              <Btn type="button" variant="ghost" size="sm" onClick={() => void onResetPreferences().then(() => setAnnouncement("Action settings reset to defaults."))}>
                Reset to action defaults
              </Btn>
            </div>
          </FormSection>

          {executionInputs.length > 0 && (
            <FormSection title="Repository and branch">
              <div className="mc-actions-input-grid">
                {executionInputs.map((input) => (
                  <ActionFieldControl
                    key={input.id}
                    field={input}
                    value={state.inputs[input.id] ?? ""}
                    project={activeFormProject}
                    projects={projects}
                    onChange={(value) => setInput(input.id, value)}
                    onBrowse={() => setFileTarget({ kind: "input", id: input.id })}
                  />
                ))}
              </div>
            </FormSection>
          )}
        </div>
      </details>

      <details className="mc-actions-preview">
        <summary>Prompt ready · {effectiveState.sources.filter((row) => row.value.trim()).length} context items</summary>
        {preview.ok ? (
          <pre>{preview.value || "Prompt is empty."}</pre>
        ) : (
          <div role="alert" style={{ padding: 14, color: "var(--status-failed)", fontFamily: "var(--mono)", fontSize: 12 }}>
            {preview.error}
          </div>
        )}
      </details>

      {workflow.status !== "available" && (
        <div
          role="status"
          style={{
            display: "grid",
            gap: 10,
            padding: "12px 14px",
            borderRadius: 8,
            border: "1px solid color-mix(in srgb, var(--status-needs) 35%, var(--border))",
            background: "color-mix(in srgb, var(--status-needs) 7%, var(--surface-1))",
          }}
        >
          <div style={{ color: "var(--text)", fontSize: 13, fontWeight: 600 }}>
            {workflowSkill} is not available to {AGENT_REGISTRY[state.agent].label}
          </div>
          {workflow.status === "installable" && workflow.sourcePath ? (
            <>
              <div style={{ display: "grid", gap: 4, color: "var(--text-faint)", fontFamily: "var(--mono)", fontSize: 10.5 }}>
                <span style={{ overflowWrap: "anywhere" }}>From: {workflow.sourcePath}</span>
                <span style={{ overflowWrap: "anywhere" }}>To: {workflow.targetPath}</span>
              </div>
              <Btn
                type="button"
                variant="solid"
                size="sm"
                icon="download"
                disabled={installingWorkflow}
                onClick={() => void installWorkflow()}
                style={{ justifySelf: "start" }}
              >
                {installingWorkflow
                  ? "Installing…"
                  : workflow.installMethod === "symlink"
                    ? "Mirror workflow skill"
                    : "Install bundled workflow"}
              </Btn>
            </>
          ) : (
            <div style={{ color: "var(--text-dim)", fontSize: 12, lineHeight: 1.5 }}>
              No copy exists in another skill root or this app build.
            </div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {issues.length > 0 && (
          <div
            role="alert"
            ref={issueSummaryRef}
            tabIndex={-1}
            style={{
              padding: "10px 12px",
              borderRadius: 7,
              background: "color-mix(in srgb, var(--status-failed) 10%, transparent)",
              color: "var(--status-failed)",
              fontFamily: "var(--mono)",
              fontSize: 11,
              lineHeight: 1.55,
            }}
          >
            {issues.map((issue) => <div key={issue}>{issue}</div>)}
          </div>
        )}
        <div className="mc-actions-queue-bar">
          <span>
            {selectedProject?.name ?? project.name} · {AGENT_REGISTRY[state.agent].label} · {action.worktree ? "isolated worktree" : "current checkout"}
            <small>You can leave after queueing. Mission Control will surface attention requests.</small>
          </span>
          <HotkeyTooltip action="dialog.submit" label={`Queue ${action.title.toLowerCase()}`}>
            <Btn
              type="submit"
              variant="primary"
              icon="play"
              aria-keyshortcuts="Meta+Enter Control+Enter"
              disabled={launching || installingWorkflow || !preview.ok || workflow.status !== "available"}
            >
              {launching ? "Queueing…" : `Queue ${action.title.toLowerCase()}`}
            </Btn>
          </HotkeyTooltip>
        </div>
      </div>

      <FileFinderDialog
        open={fileTarget !== null}
        projectRoot={project.path}
        onClose={() => setFileTarget(null)}
        onPick={pickFile}
      />
    </form>
  );
}

function ActionChoice({
  parsed,
  selected,
  onSelect,
}: {
  parsed: ActionListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const action = parsed.ok ? parsed.action : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className="mc-actions-choice"
      data-selected={selected ? "true" : "false"}
      style={{
        ...(action?.accent ? accentCssVars(action.accent) : {}),
        width: "100%",
        minHeight: 54,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 10px",
        borderRadius: 8,
        color: parsed.ok ? "var(--text)" : "var(--status-failed)",
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 30,
          height: 30,
          display: "grid",
          placeItems: "center",
          borderRadius: 7,
          background: selected ? "var(--accent-dim)" : "var(--surface-1)",
          color: parsed.ok ? "var(--accent)" : "var(--status-failed)",
          flexShrink: 0,
        }}
      >
        {action ? (
          <SessionIcon name={action.icon ?? "workflow"} size={15} />
        ) : (
          <Icon name="shield" size={15} />
        )}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 600 }}>
          {action?.title ?? parsed.name}
        </span>
        <span style={{ display: "block", marginTop: 2, color: "var(--text-faint)", fontFamily: "var(--mono)", fontSize: 10 }}>
          {parsed.ok ? `/${parsed.action.skill}` : "Invalid action"}
        </span>
      </span>
    </button>
  );
}

export function ActionsView({
  project,
  actions,
  initialActionName,
  onBack,
  onStart,
  onInstallWorkflow,
}: {
  project: ProjectWithCounts;
  actions: ActionListItem[];
  initialActionName?: string;
  onBack: () => void;
  onStart: (request: ActionStartRequest) => void | Promise<void>;
  onInstallWorkflow: (actionName: string, workflowSkill: string, agent: TaskAgent) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [selectedName, setSelectedName] = useState(initialActionName ?? actions[0]?.name ?? "");
  useEffect(() => {
    if (initialActionName) setSelectedName(initialActionName);
  }, [initialActionName]);
  const projectsQuery = useProjects();
  const allProjects = projectsQuery.data;
  const selected = actions.find((action) => action.name === selectedName) ?? actions[0] ?? null;
  const preferenceActionName = selected?.ok ? selected.name : "";
  const preferencesQuery = useActionFormPreferences(project.id, preferenceActionName);
  const savedRepository = preferencesQuery.data?.repository;
  const waitingForSavedRepository =
    !!savedRepository &&
    savedRepository !== project.path &&
    !allProjects?.some((candidate) => candidate.path === savedRepository) &&
    projectsQuery.isFetching;

  const savePreferences = async (preferences: ActionFormPreferences): Promise<void> => {
    try {
      const { preferences: saved } = await api.updateActionFormPreferences({
        projectId: project.id,
        actionName: preferenceActionName,
        preferences,
      });
      queryClient.setQueryData(
        queryKeys.actionFormPreferences(project.id, preferenceActionName),
        saved,
      );
    } catch (error) {
      mcToastResultCard(
        {
          tone: "error",
          title: "Could not save action choices",
          detail: error instanceof Error ? error.message : "Unknown error",
        },
        { id: "action-form-preferences-save-error" },
      );
      throw error;
    }
  };

  const resetPreferences = async (): Promise<void> => {
    await api.resetActionFormPreferences(project.id, preferenceActionName);
    queryClient.setQueryData(queryKeys.actionFormPreferences(project.id, preferenceActionName), null);
  };

  return (
    <div className="dot-grid-bg" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
      <CardFrame className="mc-actions-frame" style={{ width: "100%", minHeight: "100%", padding: 8 }}>
        <header className="mc-dashboard-header" style={{ padding: "18px 20px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <Btn type="button" variant="ghost" icon="chevron-left" onClick={onBack} aria-label="Back to project" />
          <ProjectIcon project={project} size={34} />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, color: "var(--text)", fontSize: 22, fontWeight: 600 }}>Actions</h1>
            <p style={{ margin: "3px 0 0", color: "var(--text-dim)", fontSize: 12.5 }}>
              Build a session prompt for {project.name} from a packaged workflow.
            </p>
          </div>
        </header>

        <div className="mc-actions-layout">
          <nav aria-label="Available actions" className="mc-actions-list">
            {actions.map((action) => (
              <ActionChoice
                key={action.name}
                parsed={action}
                selected={action.name === selected?.name}
                onSelect={() => setSelectedName(action.name)}
              />
            ))}
          </nav>

          <main className="mc-actions-form-pane">
            {selected?.ok && (preferencesQuery.isPending || waitingForSavedRepository) ? (
              <div style={{ padding: 8, color: "var(--text-faint)", fontFamily: "var(--mono)", fontSize: 12 }}>
                Loading saved choices…
              </div>
            ) : selected?.ok ? (
              <div style={selected.action.accent ? accentCssVars(selected.action.accent) : undefined}>
                <ActionEditor
                  key={`${project.id}:${selected.name}:${preferencesQuery.data?.workflowSkill ?? "default"}`}
                  actionName={selected.name}
                  action={selected.action}
                  skills={selected.skills}
                  project={project}
                  projects={allProjects ?? [project]}
                  preferences={preferencesQuery.data ?? null}
                  onStart={onStart}
                  onPreferencesChange={savePreferences}
                  onInstallWorkflow={onInstallWorkflow}
                  onResetPreferences={resetPreferences}
                />
              </div>
            ) : selected ? (
              <div role="alert" style={{ display: "grid", gap: 10, padding: 8 }}>
                <Icon name="shield" size={22} style={{ color: "var(--status-failed)" }} />
                <h2 style={{ margin: 0, fontSize: 18 }}>Action could not be loaded</h2>
                <p style={{ margin: 0, color: "var(--text-dim)", fontFamily: "var(--mono)", fontSize: 12, lineHeight: 1.6 }}>
                  {selected.error}
                </p>
                <p style={{ margin: 0, color: "var(--text-faint)", fontSize: 12 }}>
                  Fix the mc-action block in {selected.name}/SKILL.md, then reload.
                </p>
              </div>
            ) : null}
          </main>
        </div>
      </CardFrame>
    </div>
  );
}
