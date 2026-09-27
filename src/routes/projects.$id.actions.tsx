import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { Btn } from "~/components/ui/Btn";
import { EmptyState } from "~/components/ui/EmptyState";
import { ActionsView, type ActionStartRequest } from "~/components/views/ActionsView";
import { markActionLaunchIntent } from "~/lib/action-launch-intent";
import { api } from "~/lib/api";
import { queryKeys, useActions, useProject } from "~/queries";

export const Route = createFileRoute("/projects/$id/actions")({
  validateSearch: (search: Record<string, unknown>): { action?: string } =>
    typeof search.action === "string" ? { action: search.action } : {},
  component: ProjectActionsPage,
});

function ProjectActionsPage() {
  const { id } = Route.useParams();
  const { action } = Route.useSearch();
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectQuery = useProject(id);
  const actionsQuery = useActions(id);
  const [pendingLaunch, setPendingLaunch] = useState<ActionStartRequest | null>(null);
  const back = () => void router.navigate({ to: "/projects/$id", params: { id } });
  const launch = async ({ project, intent }: ActionStartRequest) => {
    markActionLaunchIntent(project.id, intent);
    await router.navigate({ to: "/projects/$id", params: { id: project.id } });
  };
  const start = async (request: ActionStartRequest) => {
    if (!request.intent.worktree && request.project.taskCounts.activeNonDone > 0) {
      setPendingLaunch(request);
      return;
    }
    await launch(request);
  };
  const installWorkflow = async (actionName: string, workflowSkill: string, agent: ActionStartRequest["intent"]["agent"]) => {
    await api.installActionWorkflow({ projectId: id, actionName, workflowSkill, agent });
    await queryClient.invalidateQueries({ queryKey: queryKeys.actions(id) });
  };

  if (projectQuery.isLoading || actionsQuery.isLoading) {
    return (
      <EmptyState
        icon="sparkles"
        title="Loading actions"
        subtitle="Discovering packaged workflows for this project."
      />
    );
  }

  if (projectQuery.isError || actionsQuery.isError || !projectQuery.data) {
    return (
      <EmptyState
        icon="shield"
        title="Could not load actions"
        subtitle="Check the project folder and action skill files, then retry."
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="ghost" icon="chevron-left" onClick={back}>
              Back
            </Btn>
            <Btn
              variant="primary"
              icon="refresh"
              onClick={() => void Promise.all([projectQuery.refetch(), actionsQuery.refetch()])}
            >
              Retry
            </Btn>
          </div>
        }
      />
    );
  }

  if (!actionsQuery.data?.length) {
    return (
      <EmptyState
        icon="sparkles"
        title="No actions found"
        subtitle="Add an mc-action block to a project, global, or bundled SKILL.md."
        action={
          <Btn variant="ghost" icon="chevron-left" onClick={back}>
            Back to project
          </Btn>
        }
      />
    );
  }

  return (
    <>
      <ActionsView
        project={projectQuery.data}
        actions={actionsQuery.data}
        initialActionName={action}
        onBack={back}
        onStart={start}
        onInstallWorkflow={installWorkflow}
      />
      <ConfirmDialog
        open={pendingLaunch !== null}
        onClose={() => setPendingLaunch(null)}
        onConfirm={async () => {
          if (!pendingLaunch) return;
          const request = pendingLaunch;
          setPendingLaunch(null);
          await launch(request);
        }}
        title="This project already has an active run"
        confirmLabel="Start anyway"
        variant="primary"
        icon="play"
      >
        <div style={{ display: "grid", gap: 14 }}>
          <p style={{ margin: 0, color: "var(--text-dim)", lineHeight: 1.55 }}>
            Starting without a worktree shares the current checkout with that run. Changes from
            both agents may overlap.
          </p>
          <div>
            <Btn
              type="button"
              variant="ghost"
              icon="arrow-up-right"
              onClick={() => {
                if (!pendingLaunch) return;
                const projectId = pendingLaunch.project.id;
                setPendingLaunch(null);
                void router.navigate({ to: "/projects/$id", params: { id: projectId } });
              }}
            >
              Jump to current run
            </Btn>
          </div>
        </div>
      </ConfirmDialog>
    </>
  );
}
