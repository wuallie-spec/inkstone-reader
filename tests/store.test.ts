import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store, imageExtension } from "../electron/store";
import { anchorAt } from "../src/anchors";
const stores: Store[] = [];
const dirs: string[] = [];
function create() {
  const dir = mkdtempSync(path.join(tmpdir(), "inkstone-test-"));
  dirs.push(dir);
  const s = new Store(dir);
  stores.push(s);
  return s;
}
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
afterEach(() => {
  stores.splice(0).forEach((s) => s.close());
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
});
describe("storage", () => {
  it("persists independent marks and image data without changing the source", () => {
    const s = create(),
      file = path.join(s.dir, "文档.md");
    writeFileSync(file, "原文");
    const doc = s.open(file),
      image = s.addImage(png);
    s.putMark({
      id: "mark-1",
      docId: doc.id,
      kind: "note",
      color: "yellow",
      anchor: anchorAt("原文", 0, 2),
      note: "思考",
      images: [image],
      createdAt: 1,
    });
    expect(s.marks(doc.id)[0].images).toEqual([image]);
    expect(s.asset(image)).toContain("data:image/png;base64,");
    s.db.close();
    s.db = new (s.db.constructor as any)(path.join(s.dir, "reader.sqlite"));
    expect(s.marks(doc.id)[0].note).toBe("思考");
  });
  it("restores images and deduplicates identical backups", () => {
    const a = create(),
      b = create();
    const d = a.open("/tmp/test.md"),
      image = a.addImage(png);
    a.putMark({
      id: "m1",
      docId: d.id,
      kind: "note",
      color: "green",
      anchor: anchorAt("hello", 0, 5),
      note: "",
      images: [image],
      createdAt: 1,
    });
    const backup = a.backup();
    b.restore(backup);
    b.restore(backup);
    expect(b.documents()).toHaveLength(1);
    expect(b.marks(d.id)).toHaveLength(1);
    expect(b.asset(image)).toBe(a.asset(image));
    expect(b.exportDocument(d.id).extension).toBe("zip");
  });
  it("rejects unsupported and oversized images", () => {
    expect(() => imageExtension(Buffer.from("<svg/>"))).toThrow();
    expect(() => imageExtension(Buffer.alloc(20 * 1024 * 1024 + 1))).toThrow(
      "20 MB",
    );
  });
  it("rejects resource traversal", () => {
    const a = create();
    expect(() => a.asset("../reader.sqlite")).toThrow();
  });
  it("exports text-only annotations as markdown", () => {
    const a = create(),
      d = a.open("/tmp/test.md");
    a.putMark({
      id: "m1",
      docId: d.id,
      kind: "bold",
      color: "yellow",
      anchor: anchorAt("hello", 0, 5),
      note: "",
      images: [],
      createdAt: 1,
    });
    const result = a.exportDocument(d.id);
    expect(result.extension).toBe("md");
    expect(result.buffer.toString()).toContain("> hello");
  });
});

it("highlight batch rolls back failures and survives backup restore", () => {
  const s = create(),
    file = path.join(s.dir, "batch.md");
  writeFileSync(file, "中文颜色");
  const d = s.open(file);
  const m = {
    id: "original",
    docId: d.id,
    kind: "highlight" as const,
    color: "yellow" as const,
    anchor: anchorAt("中文颜色", 0, 4),
    note: "",
    images: [],
    createdAt: 1,
  };
  s.putMark(m);
  expect(() =>
    s.replaceHighlights(
      d.id,
      [m.id],
      [{ ...m, id: "invalid", color: "invalid" as any }],
    ),
  ).toThrow();
  expect(s.marks(d.id)).toEqual([m]);
  s.replaceHighlights(d.id, [m.id], [{ ...m, id: "new", color: "green" }]);
  const restored = create();
  restored.restore(s.backup());
  restored.restore(s.backup());
  expect(restored.marks(d.id)).toEqual(s.marks(d.id));
  expect(restored.exportDocument(d.id).extension).toBe("md");
  expect(restored.exportDocument(d.id).buffer.toString()).toContain("绿色");
});
