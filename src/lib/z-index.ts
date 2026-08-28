/**
 * Shared z-index tiers. `popover` is the topmost interactive tier — floating
 * menus, dropdowns, and typeaheads rendered in portals that must sit above
 * all in-page chrome. `toast` sits above even that: notifications must stay
 * visible over full-screen overlays (settings) and modals. Pinned explicitly
 * on the sonner <Toaster> rather than trusting its built-in 999999999, which
 * could change across upgrades.
 */
export const Z_INDEX = {
  /** Mission Pet corner companion — above in-page panels, below settings/modals. */
  pet: 9500,
  /** Full-workspace overlays (Settings) — above the pet, below modals (9999). */
  settings: 9600,
  popover: 10000,
  /**
   * Tooltips must clear popovers: they are opened *from* dropdown rows, and a
   * tie with `popover` leaves the winner up to portal insertion order.
   * Mirrored by `.mc-tooltip` in styles.css.
   */
  tooltip: 10500,
  toast: 20000,
} as const;
