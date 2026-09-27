import { Btn } from "~/components/ui/Btn";
import { useSessionSwitcher } from "~/lib/session-switcher-store";

export function SessionSwitcherButton() {
  const { isOpen, open, sessions } = useSessionSwitcher();
  const liveCount = sessions?.live.reduce((total, group) => total + group.sessions.length, 0) ?? 0;
  const label = liveCount === 1 ? "1 live session" : `${liveCount} live sessions`;

  return (
    <Btn
      variant="ghost"
      icon="terminal"
      onClick={open}
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      aria-label={`Open session switcher, ${label}`}
      title={`Sessions — ${label}`}
    >
      {liveCount > 0 && (
        <span
          aria-hidden
          style={{
            minWidth: 16,
            height: 16,
            padding: "0 4px",
            borderRadius: 999,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--accent-dim)",
            color: "var(--accent-ink)",
            fontFamily: "var(--mono)",
            fontSize: 9,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {liveCount}
        </span>
      )}
    </Btn>
  );
}
