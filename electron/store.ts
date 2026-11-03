import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import type { Document, Mark, Settings, Anchor } from "../src/types";
export const defaults: Settings = {
  theme: "light",
  fontSize: 18,
  lineHeight: 1.9,
  width: 760,
  lastColor: "yellow",
};
export function imageExtension(bytes: Uint8Array) {
  if (bytes.length > 20 * 1024 * 1024) throw Error("图片不能超过 20 MB");
  const b = Buffer.from(bytes);
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "jpg";
  if (
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  throw Error("仅支持 PNG、JPEG、WebP 图片");
}
function checkAnchor(a: Anchor) {
  if (
    !a ||
    typeof a.quote !== "string" ||
    !a.quote ||
    a.quote.length > 2_000_000 ||
    typeof a.prefix !== "string" ||
    typeof a.suffix !== "string" ||
    !Number.isInteger(a.start) ||
    !Number.isInteger(a.end) ||
    a.start < 0 ||
    a.end <= a.start
  )
    throw Error("无效的文字标记");
}
function checkId(id: string) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(id))
    throw Error("无效 ID");
}
export class Store {
  db: DatabaseSync;
  assets: string;
  constructor(public dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.assets = path.join(dir, "assets");
    fs.mkdirSync(this.assets, { recursive: true });
    this.db = new DatabaseSync(path.join(dir, "reader.sqlite"));
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, path TEXT UNIQUE NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS marks (id TEXT PRIMARY KEY, docId TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, data TEXT NOT NULL);",
    );
  }
  get<T>(key: string, fallback: T): T {
    const r = this.db
      .prepare("SELECT data FROM preferences WHERE key=?")
      .get(key) as { data: string } | undefined;
    return r ? JSON.parse(r.data) : fallback;
  }
  set(key: string, value: unknown) {
    this.db
      .prepare("INSERT OR REPLACE INTO preferences VALUES (?,?)")
      .run(key, JSON.stringify(value));
  }
  documents(): Document[] {
    return (
      this.db.prepare("SELECT data FROM documents").all() as { data: string }[]
    )
      .map((r) => JSON.parse(r.data))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  document(id: string): Document {
    const r = this.db
      .prepare("SELECT data FROM documents WHERE id=?")
      .get(id) as { data: string } | undefined;
    if (!r) throw Error("文档不存在");
    return JSON.parse(r.data);
  }
  open(file: string): Document {
    const existing = this.db
      .prepare("SELECT id FROM documents WHERE path=?")
      .get(file) as { id: string } | undefined;
    const doc = existing
      ? this.document(existing.id)
      : {
          id: randomUUID(),
          path: file,
          title: path.basename(file),
          progress: 0,
          bookmarks: [],
          updatedAt: Date.now(),
        };
    doc.updatedAt = Date.now();
    this.putDocument(doc);
    return doc;
  }
  putDocument(doc: Document) {
    checkId(doc.id);
    if (
      typeof doc.path !== "string" ||
      typeof doc.title !== "string" ||
      !Number.isFinite(doc.progress) ||
      doc.progress < 0 ||
      doc.progress > 1 ||
      !Array.isArray(doc.bookmarks)
    )
      throw Error("文档数据无效");
    for (const b of doc.bookmarks) {
      checkId(b.id);
      checkAnchor(b.anchor);
    }
    this.db
      .prepare(
        "INSERT INTO documents VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET path=excluded.path,data=excluded.data",
      )
      .run(doc.id, doc.path, JSON.stringify(doc));
  }
  marks(docId: string): Mark[] {
    return (
      this.db.prepare("SELECT data FROM marks WHERE docId=?").all(docId) as {
        data: string;
      }[]
    ).map((r) => JSON.parse(r.data));
  }
  putMark(m: Mark) {
    checkId(m.id);
    this.document(m.docId);
    checkAnchor(m.anchor);
    if (
      !["highlight", "bold", "note"].includes(m.kind) ||
      !["yellow", "green", "blue", "pink"].includes(m.color) ||
      typeof m.note !== "string" ||
      !Array.isArray(m.images) ||
      m.images.length > 100
    )
      throw Error("批注格式无效");
    for (const id of m.images) this.assetPath(id);
    this.db
      .prepare(
        "INSERT INTO marks VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET docId=excluded.docId,data=excluded.data",
      )
      .run(m.id, m.docId, JSON.stringify(m));
  }
  replaceHighlights(docId: string, remove: string[], add: Mark[]) {
    this.document(docId);
    if (!Array.isArray(remove) || !Array.isArray(add))
      throw Error("高亮更新无效");
    const existing = new Map(this.marks(docId).map((m) => [m.id, m]));
    for (const id of remove)
      if (existing.get(id)?.kind !== "highlight")
        throw Error("只能更新当前文档的高亮");
    for (const m of add) {
      if (
        m.docId !== docId ||
        m.kind !== "highlight" ||
        m.note ||
        m.images.length ||
        this.db.prepare("SELECT id FROM marks WHERE id=?").get(m.id)
      )
        throw Error("高亮更新无效");
    }
    this.db.exec("BEGIN");
    try {
      for (const id of remove) this.deleteMark(id);
      for (const m of add) this.putMark(m);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  deleteMark(id: string) {
    this.db.prepare("DELETE FROM marks WHERE id=?").run(id);
  }
  addImage(bytes: Uint8Array) {
    const ext = imageExtension(bytes);
    const id = createHash("sha256").update(bytes).digest("hex") + "." + ext;
    fs.writeFileSync(path.join(this.assets, id), bytes);
    return id;
  }
  assetPath(id: string) {
    if (!/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(id)) throw Error("无效图片资源");
    const file = path.join(this.assets, id);
    if (!fs.existsSync(file)) throw Error("图片资源不存在");
    return file;
  }
  asset(id: string) {
    const file = this.assetPath(id);
    return (
      "data:image/" +
      (id.endsWith(".jpg") ? "jpeg" : id.split(".").pop()) +
      ";base64," +
      fs.readFileSync(file).toString("base64")
    );
  }
  backup() {
    const zip = new AdmZip();
    const documents = this.documents();
    const marks = documents.flatMap((d) => this.marks(d.id));
    zip.addFile(
      "manifest.json",
      Buffer.from(
        JSON.stringify(
          {
            version: 1,
            documents,
            marks,
            settings: this.get("settings", defaults),
          },
          null,
          2,
        ),
      ),
    );
    for (const id of new Set(marks.flatMap((m) => m.images)))
      zip.addFile("assets/" + id, fs.readFileSync(this.assetPath(id)));
    return zip.toBuffer();
  }
  restore(buffer: Buffer) {
    if (buffer.length > 512 * 1024 * 1024) throw Error("备份过大");
    const zip = new AdmZip(buffer);
    let total = 0;
    for (const e of zip.getEntries()) {
      total += e.header.size;
      if (total > 1024 * 1024 * 1024) throw Error("解压数据过大");
    }
    const entry = zip.getEntry("manifest.json");
    if (!entry || entry.header.size > 32 * 1024 * 1024) throw Error("无效备份");
    const manifest = JSON.parse(entry.getData().toString("utf8"));
    if (
      manifest.version !== 1 ||
      !Array.isArray(manifest.documents) ||
      !Array.isArray(manifest.marks)
    )
      throw Error("不支持的备份格式");
    const images = new Map<string, Buffer>();
    for (const m of manifest.marks) {
      if (!Array.isArray(m.images)) throw Error("备份图片列表无效");
      for (const id of m.images) {
        if (!/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(id))
          throw Error("备份图片路径无效");
        const e = zip.getEntry("assets/" + id);
        if (!e || e.header.size > 20 * 1024 * 1024)
          throw Error("备份缺少图片或图片过大");
        const bytes = e.getData();
        const ext = imageExtension(bytes);
        if (createHash("sha256").update(bytes).digest("hex") + "." + ext !== id)
          throw Error("图片校验失败");
        images.set(id, bytes);
      }
    }
    // Resources are content-addressed. A rolled-back import can leave only harmless unreferenced assets.
    for (const [id, bytes] of images)
      fs.writeFileSync(path.join(this.assets, id), bytes);
    this.db.exec("BEGIN");
    try {
      for (const doc of manifest.documents) {
        if (
          !this.db.prepare("SELECT id FROM documents WHERE id=?").get(doc.id)
        ) {
          const conflict = this.db
            .prepare("SELECT id FROM documents WHERE path=?")
            .get(doc.path);
          if (conflict) doc.path = doc.path + ".restored-" + doc.id;
          this.putDocument(doc);
        }
      }
      for (const m of manifest.marks)
        if (!this.db.prepare("SELECT id FROM marks WHERE id=?").get(m.id))
          this.putMark(m);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  exportDocument(id: string) {
    const doc = this.document(id);
    const marks = this.marks(id);
    const escape = (s: string) => s.replace(/[\\`*_{}\[\]<>#|]/g, "\\$&");
    const parts = ["# " + escape(doc.title) + " · 阅读笔记", ""];
    for (const m of marks) {
      parts.push(
        "## " +
          { highlight: "高亮", bold: "加粗", note: "批注" }[m.kind] +
          (m.kind === "highlight"
            ? " · " +
              { yellow: "黄色", green: "绿色", blue: "蓝色", pink: "粉色" }[
                m.color
              ]
            : ""),
        "",
        ...m.anchor.quote.split("\n").map((l) => "> " + escape(l)),
        "",
      );
      if (m.note) parts.push(escape(m.note), "");
      for (const img of m.images)
        parts.push("![批注图片](assets/" + img + ")", "");
    }
    const markdown = parts.join("\n");
    const images = [...new Set(marks.flatMap((m) => m.images))];
    if (!images.length)
      return { extension: "md", buffer: Buffer.from(markdown) };
    const zip = new AdmZip();
    zip.addFile("notes.md", Buffer.from(markdown));
    for (const id of images)
      zip.addFile("assets/" + id, fs.readFileSync(this.assetPath(id)));
    return { extension: "zip", buffer: zip.toBuffer() };
  }
  close() {
    this.db.close();
  }
}
