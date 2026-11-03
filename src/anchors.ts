import type { Anchor } from "./types";
export function fingerprint(text: string) {
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return (
    text.length + ":" + (a >>> 0).toString(16) + ":" + (b >>> 0).toString(16)
  );
}
export function anchorAt(text: string, start: number, end: number): Anchor {
  return {
    start,
    end,
    fingerprint: fingerprint(text),
    quote: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - 48), start),
    suffix: text.slice(end, end + 48),
  };
}
export function resolveAnchor(
  text: string,
  a: Anchor,
): { start: number; end: number } | null {
  if (!a.quote) return null;
  if (
    a.fingerprint === fingerprint(text) &&
    text.slice(a.start, a.end) === a.quote
  )
    return { start: a.start, end: a.end };
  const candidates: number[] = [];
  let at = text.indexOf(a.quote);
  while (at >= 0) {
    candidates.push(at);
    at = text.indexOf(a.quote, at + 1);
  }
  if (candidates.length === 1)
    return { start: candidates[0], end: candidates[0] + a.quote.length };
  const scored = candidates
    .map((start) => {
      let score = 0;
      const before = text.slice(Math.max(0, start - a.prefix.length), start),
        after = text.slice(
          start + a.quote.length,
          start + a.quote.length + a.suffix.length,
        );
      for (
        let i = 1;
        i <= Math.min(before.length, a.prefix.length) &&
        before.at(-i) === a.prefix.at(-i);
        i++
      )
        score++;
      for (
        let i = 0;
        i < Math.min(after.length, a.suffix.length) && after[i] === a.suffix[i];
        i++
      )
        score++;
      return { start, score };
    })
    .sort((a, b) => b.score - a.score);
  if (
    !scored.length ||
    scored[0].score === 0 ||
    scored[0].score === scored[1]?.score
  )
    return null;
  return { start: scored[0].start, end: scored[0].start + a.quote.length };
}
export function segments(
  length: number,
  ranges: { start: number; end: number; id: string }[],
) {
  const points = [
    ...new Set([
      0,
      length,
      ...ranges.flatMap((r) => [Math.max(0, r.start), Math.min(length, r.end)]),
    ]),
  ]
    .filter((x) => x >= 0 && x <= length)
    .sort((a, b) => a - b);
  return points.slice(0, -1).map((start, i) => ({
    start,
    end: points[i + 1],
    ids: ranges
      .filter((r) => r.start <= start && r.end >= points[i + 1])
      .map((r) => r.id),
  }));
}
const excluded = "[data-no-anchor], .katex, .mermaid, button, textarea, input";
export function textNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest(excluded)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const result: Text[] = [];
  while (walker.nextNode()) result.push(walker.currentNode as Text);
  return result;
}
export function textIndex(root: HTMLElement) {
  return textNodes(root)
    .map((n) => n.data)
    .join("");
}
export function selectionAnchor(root: HTMLElement): Anchor | null {
  const s = window.getSelection();
  if (!s || s.isCollapsed || !s.rangeCount) return null;
  const r = s.getRangeAt(0);
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer))
    return null;
  if (
    r.startContainer.parentElement?.closest(excluded) ||
    r.endContainer.parentElement?.closest(excluded)
  )
    return null;
  const nodes = textNodes(root);
  // Range endpoints can be elements (whole-paragraph / select-all selections),
  // not only text nodes. Count indexed text preceding each boundary.
  const offsetAt = (container: Node, boundary: number) => {
    const before = document.createRange();
    before.selectNodeContents(root);
    before.setEnd(container, boundary);
    let total = 0;
    for (const node of nodes) {
      if (node === container) {
        total += boundary;
        break;
      }
      if (before.comparePoint(node, node.length) <= 0) total += node.length;
      else break;
    }
    return total;
  };
  const start = offsetAt(r.startContainer, r.startOffset),
    end = offsetAt(r.endContainer, r.endOffset);
  return end > start
    ? anchorAt(nodes.map((n) => n.data).join(""), start, end)
    : null;
}
export function rangeAt(
  root: HTMLElement,
  start: number,
  end: number,
): Range | null {
  let offset = 0;
  const r = document.createRange();
  let found = false;
  for (const n of textNodes(root)) {
    const next = offset + n.length;
    if (!found && start < next) {
      r.setStart(n, Math.max(0, start - offset));
      found = true;
    }
    if (found && end <= next) {
      r.setEnd(n, Math.max(0, end - offset));
      return r;
    }
    offset = next;
  }
  return null;
}
