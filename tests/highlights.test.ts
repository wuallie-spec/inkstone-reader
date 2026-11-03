import { expect, it } from "vitest";
import { highlightChange } from "../src/highlights";
import { anchorAt } from "../src/anchors";
import type { Mark, Color } from "../src/types";
const text = "中文段落\n第二段\n表格代码";
const mark = (
  start: number,
  end: number,
  color: Color,
  kind: Mark["kind"] = "highlight",
): Mark => ({
  id: crypto.randomUUID(),
  docId: "doc",
  kind,
  color,
  anchor: anchorAt(text, start, end),
  note: "",
  images: [],
  createdAt: 1,
});
const change = (marks: Mark[], a: number, b: number, c: Color) =>
  highlightChange(text, marks, anchorAt(text, a, b), c, "doc");
it("recolors only selected text, toggles off, and keeps non-highlight marks", () => {
  const original = mark(0, text.length, "yellow"),
    note = mark(0, 3, "yellow", "note");
  const p = change([original, note], 2, 7, "green");
  expect(p.remove).toEqual([original.id]);
  expect(p.add.map((m) => [m.anchor.start, m.anchor.end, m.color])).toEqual([
    [0, 2, "yellow"],
    [2, 7, "green"],
    [7, text.length, "yellow"],
  ]);
  const off = change(p.add, 2, 7, "green");
  expect(
    [...p.add.filter((m) => !off.remove.includes(m.id)), ...off.add].map(
      (m) => m.anchor.quote,
    ),
  ).toEqual([text.slice(0, 2), text.slice(7)]);
});
it("mixed colors and gaps become a single color; legacy overlaps cannot reappear", () => {
  const p = change(
    [mark(0, 6, "yellow"), mark(2, 9, "blue")],
    0,
    text.length,
    "green",
  );
  expect(p.add).toHaveLength(1);
  expect(change(p.add, 0, text.length, "green").add).toHaveLength(0);
  const old = change(
    [mark(0, 6, "yellow"), mark(2, 9, "blue")],
    3,
    5,
    "yellow",
  );
  expect(old.add.map((m) => [m.anchor.start, m.anchor.end, m.color])).toEqual([
    [0, 3, "yellow"],
    [5, 6, "yellow"],
    [6, 9, "blue"],
  ]);
});
it("preserves unlocatable marks", () => {
  const m = mark(0, 1, "blue");
  m.anchor.quote = "missing";
  expect(change([m], 0, 2, "yellow").remove).toEqual([]);
});
it("keeps unrelated highlight IDs and resolves repeated text by offsets", () => {
  const outside = mark(10, 12, "pink");
  expect(change([outside], 0, 2, "yellow").remove).toEqual([]);
  const repeated = "相同相同";
  const m = { ...mark(0, 2, "yellow"), anchor: anchorAt(repeated, 2, 4) };
  const p = highlightChange(
    repeated,
    [m],
    anchorAt(repeated, 0, 2),
    "green",
    "doc",
  );
  expect(p.remove).toEqual([]);
  expect(p.add[0].anchor.start).toBe(0);
});
