import { Field } from "./SettingsParts";

export function ClaudeChromeControl({ value, disabled, onChange }: {
  value: boolean | null;
  disabled?: boolean;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <Field label="Chrome integration">
      <select
        aria-label="Chrome integration"
        value={value === null ? "default" : value ? "enabled" : "disabled"}
        disabled={disabled}
        onChange={(event) => onChange(
          event.target.value === "default" ? null : event.target.value === "enabled",
        )}
        style={{ width: "100%", padding: "8px 10px", borderRadius: 6,
          background: "var(--surface-0)", color: "var(--text)", border: "1px solid var(--border)" }}
      >
        <option value="default">Use Claude CLI default</option>
        <option value="enabled">Enabled</option>
        <option value="disabled">Disabled</option>
      </select>
    </Field>
  );
}
