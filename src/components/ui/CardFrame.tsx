import { forwardRef, useCallback, type CSSProperties, type HTMLAttributes, type Ref } from "react";
import { useCardGlow } from "~/lib/use-card-glow";

type CardFrameProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "aside" | "nav" | "section";
  frame?: "square" | "slanted";
  glow?: boolean;
  focused?: boolean;
  solid?: boolean;
};

const FRAME_STYLES: Record<
  NonNullable<CardFrameProps["frame"]>,
  Pick<CSSProperties, "borderWidth" | "borderImageSource" | "borderImageSlice" | "borderImageWidth">
> = {
  square: {
    borderWidth: 16,
    borderImageSource: "var(--mc-panel-image)",
    borderImageSlice: "48",
    borderImageWidth: "16px",
  },
  slanted: {
    borderWidth: 16,
    borderImageSource: "var(--mc-panel-image)",
    borderImageSlice: "48",
    borderImageWidth: "16px",
  },
};

const frameBaseStyle: CSSProperties = {
  boxSizing: "border-box",
  backgroundColor: "transparent",
  backgroundClip: "padding-box",
  borderStyle: "solid",
  borderColor: "transparent",
  borderImageSlice: "180",
  borderImageRepeat: "stretch",
  overflow: "hidden",
  position: "relative",
};

export const CardFrame = forwardRef<HTMLElement, CardFrameProps>(function CardFrame(
  { as: Component = "div", frame = "square", glow = false, focused = false, solid = false, style, className, ...props },
  forwardedRef
) {
  const glowRef = useCardGlow<HTMLElement>();
  const frameStyle = FRAME_STYLES[frame];
  const setRef = useCallback(
    (node: HTMLElement | null) => {
      glowRef(glow ? node : null);
      assignRef(forwardedRef, node);
    },
    [forwardedRef, glow, glowRef]
  );
  const mergedClassName = ["mc-card-frame", className].filter(Boolean).join(" ");

  return (
    <Component
      {...props}
      ref={setRef}
      className={mergedClassName}
      data-focused={focused ? "true" : undefined}
      data-solid={solid ? "true" : undefined}
      style={{
        ...frameBaseStyle,
        ...frameStyle,
        ...style,
        backgroundColor: "transparent",
        // The scrim and the art layer both go through CSS vars so a theme can
        // re-bind them: painted-light drops the art (--mc-card-fill: none) and
        // turns the scrim into an opaque paper ground, leaving only the
        // border-image ring. The `solid` variant's heavier scrim is applied by
        // the [data-solid="true"] rule in styles.css, not here.
        backgroundImage: `linear-gradient(var(--mc-card-scrim), var(--mc-card-scrim)), var(--mc-card-fill, ${focused ? "var(--mc-panel-focused-image)" : "var(--mc-panel-image)"})`,
        backgroundPosition: "0% 0%, 39.0625% 39.0625%",
        backgroundSize: "auto, 200% 200%",
        backgroundRepeat: "repeat, no-repeat",
        borderStyle: "solid",
        borderColor: "transparent",
        borderWidth: frameStyle.borderWidth,
        borderImageSource: focused ? "var(--mc-panel-focused-image)" : "var(--mc-panel-image)",
        borderImageSlice: frameStyle.borderImageSlice,
        borderImageWidth: frameStyle.borderImageWidth,
        borderImageRepeat: "stretch",
      }}
    />
  );
});

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
  } else {
    ref.current = value;
  }
}
