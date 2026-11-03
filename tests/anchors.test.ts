import { describe, it, expect } from "vitest";
import { anchorAt, resolveAnchor, segments } from "../src/anchors";
describe("durable anchors", () => {
  it("recovers an inserted paragraph", () => {
    const a = anchorAt("甲乙目标丙丁", 2, 4);
    expect(resolveAnchor("新增\n甲乙目标丙丁", a)?.start).toBe(5);
  });
  it("does not guess between identical passages", () => {
    const a = anchorAt("标题目标结尾", 2, 4);
    expect(resolveAnchor("标题目标结尾\n标题目标结尾", a)).toBeNull();
  });
  it("marks deleted quotes unresolved", () =>
    expect(resolveAnchor("已删除", anchorAt("原文", 0, 2))).toBeNull());
  it("uses context to distinguish duplicates", () => {
    const a = anchorAt("第一目标最后", 2, 4);
    expect(resolveAnchor("其他目标\n第一目标最后", a)?.start).toBe(7);
  });
  it("uses exact offset for unchanged identical passages", () => {
    const text =
      "同".repeat(120) + "目标" + "同".repeat(120) + "目标" + "同".repeat(120);
    const a = anchorAt(text, 242, 244);
    expect(resolveAnchor(text, a)?.start).toBe(242);
  });
  it("splits overlapping marks", () =>
    expect(
      segments(10, [
        { start: 1, end: 5, id: "a" },
        { start: 3, end: 7, id: "b" },
      ]),
    ).toEqual([
      { start: 0, end: 1, ids: [] },
      { start: 1, end: 3, ids: ["a"] },
      { start: 3, end: 5, ids: ["a", "b"] },
      { start: 5, end: 7, ids: ["b"] },
      { start: 7, end: 10, ids: [] },
    ]));
});
