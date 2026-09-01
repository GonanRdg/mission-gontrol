import { Icon } from "~/components/ui/Icon";
import type { Theme } from "~/lib/use-theme";
import {
  ACCENT_COLORS,
  type AccentColor,
  type AccentColorId,
} from "~/lib/accent-colors";

// Pixel size of the color-swatch dot used in the accent-color picker (both
// the selected-check badge and the per-row preview swatch use this size).
const SWATCH_DOT_PX = 18;

/**
 * Responsive grid of accent-color swatches. Renders painted-chrome or clean
 * (minimal) preview cards depending on `minimal`, so the swatches preview the
 * accent in the currently-selected theme style — and, via `theme`, in the
 * current appearance. Shared by the Theme settings page and the first-launch
 * theme picker (which stays on the dark default, matching its style preview).
 */
export function AccentColorGrid({
  minimal,
  selected,
  onSelect,
  theme = "dark",
}: {
  minimal: boolean;
  selected: AccentColorId;
  onSelect: (id: AccentColorId) => void;
  /** Current light/dark appearance. The flat card is token-driven and follows
   *  it for free; the painted card has to swap to the light art cut. */
  theme?: Theme;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(196px, 1fr))",
        gap: 14,
      }}
    >
      {ACCENT_COLORS.map((color) =>
        minimal ? (
          <FlatThemeCard
            key={color.id}
            color={color}
            selected={color.id === selected}
            onSelect={() => onSelect(color.id)}
          />
        ) : (
          <ThemePreviewCard
            key={color.id}
            theme={theme}
            color={color}
            selected={color.id === selected}
            onSelect={() => onSelect(color.id)}
          />
        ),
      )}
    </div>
  );
}

function FlatThemeCard({
  color,
  selected,
  onSelect,
}: {
  color: AccentColor;
  selected: boolean;
  onSelect: () => void;
}) {
  const accentRgba = (a: number) => `rgba(${color.rgb}, ${a})`;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={color.name}
      className="mc-swatch-card"
      style={{
        position: "relative",
        boxSizing: "border-box",
        padding: 14,
        cursor: "pointer",
        textAlign: "left",
        background: "var(--surface-1)",
        border: `1px solid ${selected ? color.value : "var(--border)"}`,
        borderRadius: "var(--mm-radius-lg, 10px)",
        boxShadow: selected ? `0 0 0 1px ${color.value} inset` : "none",
      }}
    >
      {selected && (
        <span
          aria-hidden
          className="mc-check-pop"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: SWATCH_DOT_PX,
            height: SWATCH_DOT_PX,
            borderRadius: 999,
            background: color.value,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="check" size={11} />
        </span>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: SWATCH_DOT_PX,
              height: SWATCH_DOT_PX,
              borderRadius: 999,
              background: color.value,
              border: "1px solid rgba(255, 255, 255, 0.15)",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 12.5,
              fontWeight: 600,
              color: selected ? "var(--text)" : "var(--text-dim)",
              letterSpacing: "-0.01em",
            }}
          >
            {color.name}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              fontFamily: "var(--mono)",
              fontSize: 10.5,
              fontWeight: 600,
              color: "#fff",
              borderRadius: "var(--mm-radius-sm, 5px)",
              background: color.value,
            }}
          >
            Action
          </span>
          <span
            aria-hidden
            className="mc-swatch-bar"
            style={{
              flex: 1,
              height: 4,
              borderRadius: "var(--mm-radius-sm, 2px)",
              background: `linear-gradient(90deg, ${color.value}, ${accentRgba(0)})`,
              ...(selected ? { opacity: 1 } : null),
            }}
          />
        </div>
      </div>
    </button>
  );
}

function ThemePreviewCard({
  color,
  selected,
  onSelect,
  theme = "dark",
}: {
  color: AccentColor;
  selected: boolean;
  onSelect: () => void;
  theme?: Theme;
}) {
  const accentRgba = (a: number) => `rgba(${color.rgb}, ${a})`;
  // Mirrors frameArtVars (src/lib/accent-colors.ts): the light appearance uses
  // the "-light" cut of the panel art, and drops the art background layer for a
  // paper ground the way CardFrame does — otherwise the swatch samples the
  // art's opaque centre and stays a dark slab on a light page.
  const light = theme === "light";
  const cut = light ? "-light" : "";
  const panelBorder = `url("/borders/panel_focused_${color.id}${cut}.png")`;
  const squareBorder = `url("/borders/square_${color.id}${cut}.png")`;
  // button_filled has no light cut — a solid accent CTA reads fine on paper.
  const buttonBorder = `url("/borders/button_filled_${color.id}.png")`;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={color.name}
      className="mc-swatch-card"
      style={{
        position: "relative",
        boxSizing: "border-box",
        padding: 0,
        cursor: "pointer",
        textAlign: "left",
        background: light
          ? `linear-gradient(var(--surface-0), var(--surface-0)), ` +
            `radial-gradient(circle at 30% 0%, ${accentRgba(selected ? 0.16 : 0.07)}, transparent 65%)`
          : `linear-gradient(rgba(3, 6, 8, 0.30), rgba(3, 6, 8, 0.30)), ` +
            `radial-gradient(circle at 30% 0%, ${accentRgba(selected ? 0.18 : 0.08)}, transparent 65%), ` +
            `${selected ? panelBorder : squareBorder} 39.0625% 39.0625% / 200% 200% no-repeat`,
        backgroundClip: "padding-box",
        borderStyle: "solid",
        borderColor: "transparent",
        borderWidth: 16,
        borderImageSource: selected ? panelBorder : squareBorder,
        borderImageSlice: "48",
        borderImageWidth: "16px",
        borderImageRepeat: "stretch",
        boxShadow: selected ? `0 0 22px ${accentRgba(0.35)}` : "none",
        overflow: "hidden",
      }}
    >
      {selected && (
        <span
          aria-hidden
          className="mc-check-pop"
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: SWATCH_DOT_PX,
            height: SWATCH_DOT_PX,
            borderRadius: 999,
            background: color.value,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 0 10px ${accentRgba(0.6)}`,
          }}
        >
          <Icon name="check" size={11} />
        </span>
      )}
      <div
        style={{
          padding: "10px 12px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: SWATCH_DOT_PX,
              height: SWATCH_DOT_PX,
              borderRadius: 999,
              background: color.value,
              border: `1px solid ${light ? "var(--border-strong)" : "rgba(255, 255, 255, 0.15)"}`,
              boxShadow: `0 0 12px ${accentRgba(0.55)}`,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 12.5,
              fontWeight: 600,
              color: selected ? "var(--text)" : "var(--text-dim)",
              letterSpacing: "-0.01em",
            }}
          >
            {color.name}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            aria-hidden
            style={{
              boxSizing: "border-box",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              fontFamily: "var(--mono)",
              fontSize: 10.5,
              fontWeight: 600,
              // The chip's interior is the accent at low alpha over the card,
              // so it follows the card's ground: dark ink on the light one.
              // (The border art itself is only the ring here — the slice has no
              // `fill` — so it never backs the label.)
              color: light ? "var(--text)" : "#fff",
              borderStyle: "solid",
              borderColor: "transparent",
              borderWidth: 12,
              borderImageSource: buttonBorder,
              borderImageSlice: "48",
              borderImageWidth: "12px",
              borderImageRepeat: "stretch",
              background: accentRgba(light ? 0.26 : 0.18),
              backgroundClip: "padding-box",
              ...(light ? null : { textShadow: `0 0 8px ${accentRgba(0.6)}` }),
            }}
          >
            Action
          </span>
          <span
            aria-hidden
            className="mc-swatch-bar"
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: `linear-gradient(90deg, ${color.value}, ${accentRgba(0)})`,
              ...(selected ? { opacity: 1 } : null),
            }}
          />
        </div>
      </div>
    </button>
  );
}
