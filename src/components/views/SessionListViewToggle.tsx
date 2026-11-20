import { Btn } from "~/components/ui/Btn";
import type { SessionListLayout } from "~/shared/ui-preferences";

export function SessionListViewToggle({
  layout,
  onChange,
}: {
  layout: SessionListLayout;
  onChange: (layout: SessionListLayout) => void;
}) {
  const label = layout === "table" ? "Switch to session cards" : "Switch to session table";
  return (
    <Btn
      variant="ghost"
      icon="list"
      aria-label={label}
      aria-pressed={layout === "table"}
      title={label}
      onClick={() => onChange(layout === "table" ? "cards" : "table")}
      style={{
        width: 40,
        minWidth: 40,
        paddingInline: 0,
        background: layout === "table" ? "var(--surface-2)" : undefined,
        color: layout === "table" ? "var(--text)" : undefined,
      }}
    />
  );
}
