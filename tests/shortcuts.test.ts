import { describe, it, expect } from "vitest";
import {
  defaultShortcuts,
  matchAnnotationShortcut,
  shortcutFromEvent,
  shortcutError,
  formatShortcut,
  shortcutsFor,
  validateShortcuts,
} from "../src/shortcuts";
const event = {
  key: "h",
  code: "KeyH",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
};
describe("annotation shortcuts", () => {
  it("uses physical key codes for IME / non-Latin keys", () => {
    expect(
      matchAnnotationShortcut(
        { ...event, key: "Unidentified", metaKey: true, shiftKey: true },
        defaultShortcuts,
        true,
      ),
    ).toBe("highlight");
    expect(
      matchAnnotationShortcut(
        {
          ...event,
          key: "Process",
          code: "KeyM",
          ctrlKey: true,
          shiftKey: true,
        },
        defaultShortcuts,
        false,
      ),
    ).toBe("note");
  });
  it("supports single keys and custom combinations", () => {
    const bindings = {
      ...defaultShortcuts,
      highlight: "KeyH",
      note: "Alt+KeyN",
    };
    expect(matchAnnotationShortcut(event, bindings, true)).toBe("highlight");
    expect(
      matchAnnotationShortcut(
        { ...event, code: "KeyN", altKey: true },
        bindings,
        false,
      ),
    ).toBe("note");
  });
  it("does not toggle repeatedly when a key is held", () =>
    expect(
      matchAnnotationShortcut(
        { ...event, repeat: true },
        { ...defaultShortcuts, highlight: "KeyH" },
        true,
      ),
    ).toBeNull());
  it("ignores plain composing input", () =>
    expect(
      shortcutFromEvent({ ...event, isComposing: true }, true),
    ).toBeNull());
  it("rejects duplicate and reserved bindings", () => {
    expect(
      shortcutError("highlight", defaultShortcuts.note, defaultShortcuts),
    ).toContain("冲突");
    expect(shortcutError("highlight", "Mod+KeyC", defaultShortcuts)).toContain(
      "常用操作",
    );
    expect(() =>
      validateShortcuts({ ...defaultShortcuts, highlight: "invalid" }),
    ).toThrow();
  });
  it("keeps old preferences compatible and formats both platforms", () => {
    expect(shortcutsFor()).toEqual(defaultShortcuts);
    expect(formatShortcut(defaultShortcuts.note, true)).toBe("⌘⇧M");
    expect(formatShortcut(defaultShortcuts.note, false)).toBe(
      "Ctrl + Shift + M",
    );
  });
});

it("migrates old custom bindings without occupying their keys", () => {
  const map = shortcutsFor({ highlight: "KeyH", note: "KeyJ" });
  expect(map.highlight).toBe("KeyH");
  expect(map.note).toBe("KeyJ");
  expect(map.yellow).toBe("");
  expect(map.green).toBe("");
  expect(map.blue).toBe("KeyK");
  expect(() => validateShortcuts(map)).not.toThrow();
});
