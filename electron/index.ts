import {
  shortcutsFor,
  validateShortcuts,
  formatShortcut,
  shortcutLabels,
  annotationActions,
} from "../src/shortcuts";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chokidar from "chokidar";
import { Store, defaults, imageExtension } from "./store";
import type { FileNode, Document, Settings, Mark } from "../src/types";
let win: BrowserWindow;
let quitting = false;
let store: Store;
let watcher: ReturnType<typeof chokidar.watch> | undefined;
if (process.env.INKSTONE_DATA_DIR)
  app.setPath("userData", process.env.INKSTONE_DATA_DIR);
const granted = new Set<string>();
const inside = (file: string, root: string) => {
  const relative = path.relative(root, file);
  return (
    relative === "" ||
    (!relative.startsWith(".." + path.sep) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
};
function permitted(file: string) {
  const canonical = fs.realpathSync(file);
  return (
    [...granted].some((root) => inside(canonical, root)) ||
    store.documents().some((d) => d.path === canonical)
  );
}
function markdown(file: string) {
  if (!/\.(md|markdown)$/i.test(file)) throw Error("请选择 Markdown 文件");
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 30 * 1024 * 1024)
    throw Error("文档应小于 30 MB");
  return fs.realpathSync(file);
}
function readDocument(id: string) {
  const document = store.document(id);
  if (!fs.existsSync(document.path))
    return {
      document: { ...document, missing: true },
      source: "",
      marks: store.marks(id),
    };
  const source = fs.readFileSync(markdown(document.path), "utf8");
  return { document, source, marks: store.marks(id) };
}
function openFile(file: string) {
  file = markdown(file);
  const document = store.open(file);
  watchFiles();
  return readDocument(document.id);
}
function tree(root: string, depth = 0): FileNode[] {
  if (!root || depth > 12 || !fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter(
      (e) =>
        !e.name.startsWith(".") &&
        !e.isSymbolicLink() &&
        e.name !== "node_modules",
    )
    .sort(
      (a, b) =>
        Number(b.isDirectory()) - Number(a.isDirectory()) ||
        a.name.localeCompare(b.name),
    )
    .flatMap((e) => {
      const file = path.join(root, e.name);
      if (e.isDirectory()) {
        const children = tree(file, depth + 1);
        return children.length ? [{ name: e.name, path: file, children }] : [];
      }
      return /\.(md|markdown)$/i.test(e.name)
        ? [{ name: e.name, path: file }]
        : [];
    });
}
function send(channel: string, value: string) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, value);
}
function watchFiles() {
  void watcher?.close();
  const root = store.get("root", "");
  watcher = chokidar.watch(
    [...store.documents().map((d) => d.path), ...(root ? [root] : [])],
    {
      ignoreInitial: true,
      ignored: (p) =>
        p
          .split(path.sep)
          .some((x) => x === "node_modules" || x.startsWith(".")),
      awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
      depth: 12,
    },
  );
  watcher.on("all", (_event, file) => {
    for (const d of store.documents())
      if (d.path === file) send("changed", d.id);
    send("changed", "library");
  });
}
async function choose(kind: "file" | "folder") {
  const result = await dialog.showOpenDialog(win, {
    properties: kind === "folder" ? ["openDirectory"] : ["openFile"],
    filters:
      kind === "file"
        ? [{ name: "Markdown", extensions: ["md", "markdown"] }]
        : undefined,
  });
  if (result.canceled) return null;
  const file = fs.realpathSync(result.filePaths[0]);
  if (kind === "folder") {
    granted.add(file);
    store.set("root", file);
    watchFiles();
    return null;
  }
  granted.add(path.dirname(file));
  return openFile(file);
}
function handlers() {
  const handle = (name: string, fn: (...args: any[]) => unknown) =>
    ipcMain.handle(name, (event, ...args) => {
      if (
        event.sender !== win.webContents ||
        event.senderFrame !== win.webContents.mainFrame
      )
        throw Error("拒绝访问");
      return fn(...args);
    });
  handle("library", () => ({
    documents: store
      .documents()
      .map((d) => ({ ...d, missing: !fs.existsSync(d.path) })),
    tree: tree(store.get("root", "")),
    root: store.get("root", ""),
    settings: store.get("settings", defaults),
  }));
  handle("finishClose", () => {
    setImmediate(() => {
      if (win && !win.isDestroyed()) win.destroy();
      if (quitting) app.quit();
    });
  });
  handle("shortcutCapture", (value: boolean) => {
    if (typeof value !== "boolean") throw Error("无效参数");
    win.webContents.setIgnoreMenuShortcuts(value);
  });
  handle("open", choose);
  handle("read", readDocument);
  handle("openPath", (file: string) => {
    if (!permitted(file)) throw Error("请先打开该文件所在的文件夹");
    return openFile(file);
  });
  handle("drop", (files: string[]) => {
    const file = files.find((f) => /\.(md|markdown)$/i.test(f));
    if (!file) throw Error("请拖入 Markdown 文件");
    const canonical = markdown(file);
    granted.add(path.dirname(canonical));
    return openFile(canonical);
  });
  handle("replaceHighlights", (id: string, remove: string[], add: Mark[]) =>
    store.replaceHighlights(id, remove, add),
  );
  handle("saveMark", (mark: Mark) => store.putMark(mark));
  handle("deleteMark", (id: string) => store.deleteMark(id));
  handle("updateDocument", (doc: Document) => {
    const previous = store.document(doc.id);
    store.putDocument({
      ...previous,
      progress: doc.progress,
      bookmarks: doc.bookmarks,
    });
  });
  handle("progress", (id: string, value: number) => {
    const previous = store.document(id);
    store.putDocument({ ...previous, progress: value });
  });
  handle("settings", (s: Settings) => {
    if (
      !["light", "dark", "sepia"].includes(s.theme) ||
      !["yellow", "green", "blue", "pink"].includes(s.lastColor) ||
      s.fontSize < 12 ||
      s.fontSize > 32 ||
      s.lineHeight < 1.2 ||
      s.lineHeight > 2.8 ||
      s.width < 520 ||
      s.width > 1100
    )
      throw Error("阅读设置无效");
    if (s.shortcuts) validateShortcuts(shortcutsFor(s.shortcuts));
    store.set("settings", s);
    updateShortcutMenu();
  });
  handle("relink", async (id: string) => {
    const doc = store.document(id);
    const r = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
    });
    if (r.canceled) return null;
    const file = markdown(r.filePaths[0]);
    if (store.documents().some((d) => d.path === file && d.id !== id))
      throw Error("该文件已在阅读列表中，请选择未关联的文件");
    doc.path = file;
    doc.title = path.basename(file);
    store.putDocument(doc);
    granted.add(path.dirname(file));
    watchFiles();
    return readDocument(id);
  });
  handle("importImage", (_name: string, bytes: ArrayBuffer) =>
    store.addImage(new Uint8Array(bytes)),
  );
  handle("asset", (id: string) => store.asset(id));
  handle("image", async (id: string, src: string, remote = false) => {
    let bytes: Buffer;
    if (/^https?:\/\//i.test(src)) {
      if (!remote) throw Error("远程图片未加载");
      const result = await fetch(src, { signal: AbortSignal.timeout(15000) });
      if (
        !result.ok ||
        Number(result.headers.get("content-length")) > 20 * 1024 * 1024
      )
        throw Error("图片加载失败或超过 20 MB");
      const reader = result.body?.getReader();
      if (!reader) throw Error("图片为空");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 20 * 1024 * 1024) {
          await reader.cancel();
          throw Error("图片不能超过 20 MB");
        }
        chunks.push(value);
      }
      bytes = Buffer.concat(chunks);
    } else {
      if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//"))
        throw Error("不支持的图片地址");
      const doc = store.document(id);
      const file = fs.realpathSync(
        path.resolve(
          path.dirname(doc.path),
          decodeURIComponent(src.split("#")[0]),
        ),
      );
      if (!inside(file, path.dirname(doc.path)) && !permitted(file))
        throw Error("图片位于已授权目录之外");
      if (fs.statSync(file).size > 20 * 1024 * 1024)
        throw Error("图片不能超过 20 MB");
      bytes = fs.readFileSync(file);
    }
    const ext = imageExtension(bytes);
    return (
      "data:image/" +
      (ext === "jpg" ? "jpeg" : ext) +
      ";base64," +
      bytes.toString("base64")
    );
  });
  handle("external", async (url: string) => {
    if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url))
      throw Error("链接类型不支持");
    await shell.openExternal(url);
  });
  handle("exportDocument", async (id: string) => {
    const result = store.exportDocument(id);
    const save = await dialog.showSaveDialog(win, {
      defaultPath:
        store.document(id).title.replace(/\.(md|markdown)$/i, "") +
        "-笔记." +
        result.extension,
    });
    if (save.canceled || !save.filePath) return false;
    fs.writeFileSync(save.filePath, result.buffer);
    return true;
  });
  handle("backup", async () => {
    const save = await dialog.showSaveDialog(win, {
      defaultPath: "Inkstone-backup.zip",
      filters: [{ name: "ZIP", extensions: ["zip"] }],
    });
    if (save.canceled || !save.filePath) return false;
    fs.writeFileSync(save.filePath, store.backup());
    return true;
  });
  handle("restore", async () => {
    const r = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "Inkstone backup", extensions: ["zip"] }],
    });
    if (r.canceled) return false;
    if (fs.statSync(r.filePaths[0]).size > 512 * 1024 * 1024)
      throw Error("备份过大");
    store.restore(fs.readFileSync(r.filePaths[0]));
    watchFiles();
    return true;
  });
}
function updateShortcutMenu() {
  const menu = Menu.getApplicationMenu();
  if (!menu) return;
  const bindings = shortcutsFor(
    store.get<Settings>("settings", defaults).shortcuts,
  );
  for (const action of annotationActions) {
    const item = menu.getMenuItemById(action);
    if (item)
      item.label =
        (action === "highlight"
          ? "高亮 / 取消高亮"
          : action === "bold"
            ? "加粗 / 取消加粗"
            : action === "note"
              ? "新建批注"
              : {
                  yellow: "黄色高亮",
                  green: "绿色高亮",
                  blue: "蓝色高亮",
                  pink: "粉色高亮",
                }[action]) +
        "（" +
        formatShortcut(bindings[action], process.platform === "darwin") +
        "）";
  }
}
function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: "#f7f7f3",
    title: "墨读 · Inkstone",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.on("close", (event) => {
    if (!win.webContents.isCrashed() && !win.webContents.isLoading()) {
      event.preventDefault();
      send("command", "flush-close");
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  if (process.env.ELECTRON_RENDERER_URL)
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  const cmd = (name: string) => () => {
    if (!win || win.isDestroyed()) {
      createWindow();
      win.webContents.once("did-finish-load", () => send("command", name));
    } else send("command", name);
  };
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin"
        ? [
            {
              label: "Inkstone",
              submenu: [{ role: "about" as const }, { role: "quit" as const }],
            },
          ]
        : []),
      {
        label: "文件",
        submenu: [
          { label: "打开文件", accelerator: "CmdOrCtrl+O", click: cmd("open") },
          {
            label: "打开文件夹",
            accelerator: "CmdOrCtrl+Shift+O",
            click: cmd("folder"),
          },
          { label: "导出笔记", click: cmd("export") },
          { label: "备份", click: cmd("backup") },
          { label: "恢复备份", click: cmd("restore") },
        ],
      },
      {
        label: "编辑",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "阅读",
        submenu: [
          ...(["yellow", "green", "blue", "pink"] as const).map((id) => ({
            id,
            label: id,
            click: cmd(id),
          })),
          {
            label: "高亮 / 取消高亮",
            id: "highlight",
            click: cmd("highlight"),
          },
          {
            label: "加粗 / 取消加粗",
            id: "bold",
            click: cmd("bold"),
          },
          {
            label: "新建批注",
            id: "note",
            click: cmd("note"),
          },
          {
            label: "文内搜索",
            accelerator: "CmdOrCtrl+F",
            click: cmd("search"),
          },
          {
            label: "专注模式",
            accelerator: "CmdOrCtrl+Shift+F",
            click: cmd("focus"),
          },
        ],
      },
      {
        label: "视图",
        submenu: [
          { role: "reload" },
          { role: "toggleDevTools" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
        ],
      },
    ]),
  );
  updateShortcutMenu();
}
app.whenReady().then(() => {
  store = new Store(app.getPath("userData"));
  const root = store.get("root", "");
  if (root && fs.existsSync(root)) granted.add(root);
  handlers();
  createWindow();
  watchFiles();
  if (process.env.INKSTONE_OPEN_FILE) {
    openFile(process.env.INKSTONE_OPEN_FILE);
    store.set("settings", {
      ...store.get("settings", defaults),
      lastDoc: store.documents()[0].id,
    });
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  quitting = true;
});
app.on("will-quit", () => {
  void watcher?.close();
  store?.close();
});
