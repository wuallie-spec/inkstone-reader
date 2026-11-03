import { anchorAt, resolveAnchor } from "./anchors";
import type { Anchor, Color, Mark } from "./types";
// Resolve legacy overlaps with the same first-mark precedence as the painter.
export function highlightChange(
  text: string,
  marks: Mark[],
  selection: Anchor,
  color: Color,
  docId: string,
) {
  const { start, end } = selection;
  const located = marks.flatMap((m) => {
    const r = m.kind === "highlight" ? resolveAnchor(text, m.anchor) : null;
    return r ? [{ m, ...r }] : [];
  });
  // Only rewrite the connected overlapping component touched by this selection.
  let low = start,
    high = end,
    changed = true;
  while (changed) {
    changed = false;
    for (const r of located) {
      if (r.start < high && r.end > low && (r.start < low || r.end > high)) {
        low = Math.min(low, r.start);
        high = Math.max(high, r.end);
        changed = true;
      }
    }
  }
  const ranges = located.filter((r) => r.start < high && r.end > low);
  const boundaries = [
    ...new Set([start, end, ...ranges.flatMap((r) => [r.start, r.end])]),
  ].sort((a, b) => a - b);
  const pieces = boundaries.slice(0, -1).map((a, i) => ({
    start: a,
    end: boundaries[i + 1],
    color: ranges.find((r) => r.start <= a && r.end >= boundaries[i + 1])?.m
      .color,
  }));
  const same = pieces
    .filter((r) => r.start >= start && r.end <= end)
    .every((r) => r.color === color);
  const merged: { start: number; end: number; color: Color }[] = [];
  for (const r of pieces) {
    const c =
      r.start >= start && r.end <= end ? (same ? undefined : color) : r.color;
    if (!c) continue;
    const last = merged[merged.length - 1];
    if (last && last.end === r.start && last.color === c) last.end = r.end;
    else merged.push({ ...r, color: c });
  }
  const add: Mark[] = merged.map((r) => ({
    id: crypto.randomUUID(),
    docId,
    kind: "highlight",
    color: r.color,
    anchor: anchorAt(text, r.start, r.end),
    note: "",
    images: [],
    createdAt: Date.now(),
  }));
  return { remove: ranges.map((r) => r.m.id), add };
}
