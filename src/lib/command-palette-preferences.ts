import { createBooleanPreferenceCache } from "./boolean-preference-cache";

export const doubleShiftPreference = createBooleanPreferenceCache("mc:commandPaletteDoubleShift");
export function doubleShiftEnabled() {
  return !doubleShiftPreference.has() || doubleShiftPreference.read();
}
