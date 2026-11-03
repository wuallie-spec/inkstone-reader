// @vitest-environment jsdom
import { it, expect } from "vitest";
import {
  paintMarks,
  anchorAt,
  selectionAnchor,
  textIndex,
  rangeAt,
} from "../src/marks";
import type { Mark } from "../src/types";
it("preserves cross-paragraph selections and overlapping bold/highlights over repeated paints", () => {
  document.body.innerHTML =
    "<article><p>第一段中文</p><p>第二段 <code>code</code></p><div data-no-anchor>ignore</div></article>";
  const root = document.querySelector("article")!;
  const text = textIndex(root);
  const a = anchorAt(text, 2, 9);
  const base: Mark = {
    id: "a",
    docId: "d",
    kind: "highlight",
    color: "green",
    anchor: a,
    note: "",
    images: [],
    createdAt: 1,
  };
  const bold: Mark = {
    ...base,
    id: "b",
    kind: "bold",
    anchor: anchorAt(text, 4, 11),
  };
  const r = rangeAt(root, 2, 9)!;
  window.getSelection()!.addRange(r);
  paintMarks(root, [base, bold]);
  expect(textIndex(root)).toBe(text);
  expect(selectionAnchor(root)?.quote).toBe(a.quote);
  expect(root.querySelectorAll(".ink-bold").length).toBeGreaterThan(0);
  paintMarks(root, [base]);
  expect(root.querySelectorAll(".ink-bold")).toHaveLength(0);
  expect(textIndex(root)).toBe(text);
  paintMarks(root, []);
  expect(root.querySelectorAll(".ink-mark")).toHaveLength(0);
});
it("accepts a whole-paragraph selection with element boundaries", () => {
  document.body.innerHTML =
    "<article><p>整段<strong>重要文字</strong>和结尾</p></article>";
  const root = document.querySelector("article")!;
  const range = document.createRange();
  range.selectNodeContents(root.querySelector("p")!);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  expect(selectionAnchor(root)?.quote).toBe("整段重要文字和结尾");
});
