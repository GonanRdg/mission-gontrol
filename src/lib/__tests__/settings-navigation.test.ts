import { describe, expect, it } from "vitest";
import { isOpenSettingsShortcut } from "../settings-navigation";

function keyEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    altKey: false,
    code: "Comma",
    ctrlKey: false,
    key: ",",
    metaKey: false,
    shiftKey: false,
    ...overrides,
  } as KeyboardEvent;
}

describe("isOpenSettingsShortcut", () => {
  it("matches Command+Comma", () => {
    expect(isOpenSettingsShortcut(keyEvent({ metaKey: true }))).toBe(true);
  });

  it("does not claim Control+Comma or modified Command chords", () => {
    expect(isOpenSettingsShortcut(keyEvent({ ctrlKey: true }))).toBe(false);
    expect(isOpenSettingsShortcut(keyEvent({ metaKey: true, ctrlKey: true }))).toBe(false);
    expect(isOpenSettingsShortcut(keyEvent({ metaKey: true, shiftKey: true }))).toBe(false);
    expect(isOpenSettingsShortcut(keyEvent({ metaKey: true, altKey: true }))).toBe(false);
  });

  it("ignores other Command shortcuts", () => {
    expect(isOpenSettingsShortcut(keyEvent({ metaKey: true, code: "KeyG", key: "g" }))).toBe(false);
  });
});
