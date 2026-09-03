import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Btn } from "~/components/ui/Btn";
import { EmptyState } from "~/components/ui/EmptyState";
import { ActionsView } from "~/components/views/ActionsView";
import { useActions, useProject } from "~/queries";

export const Route = createFileRoute("/projects/$id/actions")({
  component: ProjectActionsPage,
});

function ProjectActionsPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const projectQuery = useProject(id);
  const actionsQuery = useActions(id);
  const back = () => void router.navigate({ to: "/projects/$id", params: { id } });

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

  return <ActionsView project={projectQuery.data} actions={actionsQuery.data} onBack={back} />;
}
