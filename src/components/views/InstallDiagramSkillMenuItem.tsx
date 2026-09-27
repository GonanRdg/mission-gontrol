import { DropdownMenuItem } from "~/components/ui/DropdownMenuItem";

export function InstallDiagramSkillMenuItem({ onSelect }: { onSelect: () => void }) {
  return (
    <DropdownMenuItem
      icon="chart"
      onClick={onSelect}
      title="Install the Mission Gontrol diagram skill into this project"
    >
      Install diagram skill
    </DropdownMenuItem>
  );
}
