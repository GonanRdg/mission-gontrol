import { useEffect, useState } from "react";
import { Btn } from "~/components/ui/Btn";
import { Modal } from "~/components/ui/Modal";
import { Textarea } from "~/components/ui/Textarea";

/**
 * Fallback for Commit & Push when the commit CLI can't write the message —
 * none installed, or it produced nothing usable. Typing one by hand beats
 * dead-ending, and it keeps the commit-CLI setting genuinely optional.
 */
export function CommitMessageDialog({
  open,
  reason,
  busy,
  onClose,
  onCommit,
}: {
  open: boolean;
  /** Why the dialog appeared — the CLI error, shown above the field. */
  reason: string | null;
  busy: boolean;
  onClose: () => void;
  onCommit: (message: string) => void;
}) {
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (open) setMessage("");
  }, [open]);

  const trimmed = message.trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Commit message"
      width={520}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn
            variant="primary"
            onClick={() => onCommit(trimmed)}
            disabled={busy || trimmed.length === 0}
          >
            {busy ? "Committing…" : "Commit & Push"}
          </Btn>
        </>
      }
    >
      {reason && (
        <div
          role="alert"
          style={{
            marginBottom: 12,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid color-mix(in srgb, var(--status-failed) 40%, transparent)",
            background: "color-mix(in srgb, var(--status-failed) 10%, transparent)",
            color: "var(--text-dim)",
            fontSize: 12,
            whiteSpace: "pre-wrap",
          }}
        >
          {reason}
        </div>
      )}
      <Textarea
        label="Message"
        hint="Staged changes are committed with this message, then pushed."
        value={message}
        onChange={setMessage}
        placeholder="fix(scope): what changed and why"
        mono
        rows={5}
        autoFocus
        disabled={busy}
      />
    </Modal>
  );
}
