import {
  anchorAt,
  rangeAt,
  resolveAnchor,
  selectionAnchor,
  segments,
  textIndex,
  textNodes,
} from "./anchors";
import type { Mark } from "./types";
export function paintMarks(root: HTMLElement, marks: Mark[]) {
  const selection = selectionAnchor(root);
  for (const el of root.querySelectorAll("span.ink-mark"))
    el.replaceWith(...el.childNodes);
  root.normalize();
  const text = textIndex(root);
  const ranges = marks.flatMap((m) => {
    const r = resolveAnchor(text, m.anchor);
    return r ? [{ ...r, id: m.id }] : [];
  });
  let offset = 0;
  for (const node of textNodes(root)) {
    const length = node.length;
    const local = ranges
      .filter((r) => r.start < offset + length && r.end > offset)
      .map((r) => ({
        ...r,
        start: Math.max(0, r.start - offset),
        end: Math.min(length, r.end - offset),
      }));
    if (local.length) {
      const fragment = document.createDocumentFragment();
      for (const part of segments(length, local)) {
        const value = node.data.slice(part.start, part.end);
        if (!part.ids.length) {
          fragment.append(value);
          continue;
        }
        const span = document.createElement("span");
        span.className = "ink-mark";
        span.dataset.marks = part.ids.join(" ");
        const active = marks.filter((m) => part.ids.includes(m.id));
        const highlight = active.find((m) => m.kind === "highlight");
        if (highlight) span.dataset.color = highlight.color;
        if (active.some((m) => m.kind === "bold"))
          span.classList.add("ink-bold");
        if (active.some((m) => m.kind === "note"))
          span.classList.add("ink-note");
        span.textContent = value;
        fragment.append(span);
      }
      node.replaceWith(fragment);
    }
    offset += length;
  }
  if (selection) {
    const r = rangeAt(root, selection.start, selection.end);
    if (r) {
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(r);
    }
  }
  return new Set(
    marks.filter((m) => !resolveAnchor(text, m.anchor)).map((m) => m.id),
  );
}
export { anchorAt, rangeAt, resolveAnchor, selectionAnchor, textIndex };
