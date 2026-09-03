import { useEffect, useMemo, useState } from "react";
import { Btn } from "~/components/ui/Btn";
import { Icon } from "~/components/ui/Icon";
import { Modal } from "~/components/ui/Modal";
import { Spinner } from "~/components/ui/Spinner";
import { useGitBranches, useGitCommitFiles, useGitHistory } from "~/queries/git";
import type { GitCommitSummary } from "~/server/services/git";

const commitDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const FILE_STATUS: Record<string, { label: string; tone: string }> = {
  A: { label: "Added", tone: "added" },
  C: { label: "Copied", tone: "added" },
  D: { label: "Deleted", tone: "deleted" },
  M: { label: "Modified", tone: "modified" },
  R: { label: "Renamed", tone: "renamed" },
  T: { label: "Type changed", tone: "modified" },
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Git history could not be loaded";
}

function CommitRow({
  commit,
  selected,
  onSelect,
}: {
  commit: GitCommitSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const authoredAt = new Date(commit.authoredAt);
  return (
    <button
      type="button"
      className="mc-git-history-commit"
      data-selected={selected || undefined}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="mc-git-history-node" aria-hidden />
      <span className="mc-git-history-commit-copy">
        <span className="mc-git-history-subject">{commit.subject}</span>
        {commit.refs.length > 0 && (
          <span className="mc-git-history-refs" aria-label="References">
            {commit.refs.map((ref) => (
              <span key={ref} className="mc-git-history-ref">
                {ref}
              </span>
            ))}
          </span>
        )}
        <span className="mc-git-history-meta">
          <code>{commit.shortSha}</code>
          <span>{commit.authorName}</span>
          <time dateTime={commit.authoredAt} title={authoredAt.toLocaleString()}>
            {commitDate.format(authoredAt)}
          </time>
        </span>
      </span>
    </button>
  );
}

export function GitHistoryModal({
  open,
  projectId,
  worktreeId,
  projectName,
  onClose,
}: {
  open: boolean;
  projectId: string;
  worktreeId?: string | null;
  projectName: string;
  onClose: () => void;
}) {
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const branches = useGitBranches(projectId, worktreeId, { enabled: open });
  const history = useGitHistory(projectId, worktreeId, selectedBranch, { enabled: open });
  const commits = useMemo(() => history.data?.commits ?? [], [history.data?.commits]);
  const selectedCommit = commits.find((commit) => commit.sha === selectedSha) ?? null;
  const files = useGitCommitFiles(projectId, worktreeId, selectedCommit?.sha ?? null, {
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setSelectedBranch(null);
    setSelectedSha(null);
  }, [open, projectId, worktreeId]);

  useEffect(() => {
    if (!open || history.isPending) return;
    setSelectedSha((current) =>
      current && commits.some((commit) => commit.sha === current)
        ? current
        : (commits[0]?.sha ?? null),
    );
  }, [commits, history.isPending, open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="mc-git-history-title">
          <span aria-hidden><Icon name="git-branch" size={12} /></span>
          <span>Commit History</span>
          <span className="mc-git-history-project" title={projectName}>
            {projectName}
          </span>
        </div>
      }
      width="min(1440px, 94vw)"
      height="86vh"
      maxWidth="94vw"
      maxHeight="90vh"
      contentStyle={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}
    >
      <div className="mc-git-history-layout">
        <nav className="mc-git-history-branches" aria-label="Branches">
          <div className="mc-git-history-column-title">Branches</div>
          {branches.isPending ? (
            <div className="mc-git-history-loading"><Spinner aria-hidden /> Loading…</div>
          ) : branches.isError ? (
            <div className="mc-git-history-error">
              <span>{errorMessage(branches.error)}</span>
              <Btn size="sm" onClick={() => void branches.refetch()}>Retry</Btn>
            </div>
          ) : (
            <div className="mc-git-history-branch-list">
              <button
                type="button"
                className="mc-git-history-branch"
                data-selected={selectedBranch === null || undefined}
                aria-pressed={selectedBranch === null}
                onClick={() => setSelectedBranch(null)}
              >
                <span aria-hidden><Icon name="list" size={12} /></span>
                <span>All refs</span>
              </button>
              {branches.data?.branches.map((branch) => (
                <button
                  key={branch.name}
                  type="button"
                  className="mc-git-history-branch"
                  data-selected={selectedBranch === branch.name || undefined}
                  aria-pressed={selectedBranch === branch.name}
                  title={branch.name}
                  onClick={() => setSelectedBranch(branch.name)}
                >
                  <span aria-hidden><Icon name="git-branch" size={12} /></span>
                  <span>{branch.name}</span>
                  {branch.name === branches.data.current && (
                    <span className="mc-git-history-current">current</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </nav>

        <section className="mc-git-history-commits" aria-label="Commits">
          <div className="mc-git-history-column-title">
            <span>{selectedBranch ?? "All refs"}</span>
            {history.data && <span>{history.data.commits.length} commits</span>}
          </div>
          {history.isPending ? (
            <div className="mc-git-history-loading"><Spinner aria-hidden /> Loading commits…</div>
          ) : history.isError ? (
            <div className="mc-git-history-error">
              <span>{errorMessage(history.error)}</span>
              <Btn size="sm" onClick={() => void history.refetch()}>Retry</Btn>
            </div>
          ) : commits.length === 0 ? (
            <div className="mc-git-history-empty">No commits on this branch.</div>
          ) : (
            <div className="mc-git-history-commit-list">
              {commits.map((commit) => (
                <CommitRow
                  key={commit.sha}
                  commit={commit}
                  selected={commit.sha === selectedCommit?.sha}
                  onSelect={() => setSelectedSha(commit.sha)}
                />
              ))}
              {history.data?.truncated && (
                <div className="mc-git-history-limit">Showing latest 100 commits</div>
              )}
            </div>
          )}
        </section>

        <section className="mc-git-history-files" aria-label="Files affected by selected commit">
          <div className="mc-git-history-column-title">
            <span>Files affected</span>
            {files.data && <span>{files.data.files.length}</span>}
          </div>
          {!selectedCommit ? (
            <div className="mc-git-history-empty">Select a commit to inspect its files.</div>
          ) : files.isPending ? (
            <div className="mc-git-history-loading"><Spinner aria-hidden /> Loading files…</div>
          ) : files.isError ? (
            <div className="mc-git-history-error">
              <span>{errorMessage(files.error)}</span>
              <Btn size="sm" onClick={() => void files.refetch()}>Retry</Btn>
            </div>
          ) : (
            <div className="mc-git-history-file-content">
              <div className="mc-git-history-selected-commit">
                <code>{selectedCommit.shortSha}</code>
                <strong>{selectedCommit.subject}</strong>
              </div>
              {files.data?.files.length ? (
                <ul className="mc-git-history-file-list">
                  {files.data.files.map((file) => {
                    const status = FILE_STATUS[file.status[0] ?? ""] ?? {
                      label: file.status,
                      tone: "modified",
                    };
                    return (
                      <li key={`${file.status}:${file.previousPath ?? ""}:${file.path}`}>
                        <span
                          className={`mc-git-history-file-status mc-git-history-file-status-${status.tone}`}
                          aria-label={status.label}
                          title={status.label}
                        >
                          {file.status[0]}
                        </span>
                        <span className="mc-git-history-file-path" title={file.path}>
                          {file.previousPath && (
                            <span className="mc-git-history-old-path">{file.previousPath} → </span>
                          )}
                          {file.path}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="mc-git-history-empty">No changed files recorded.</div>
              )}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
