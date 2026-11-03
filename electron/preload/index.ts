import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { ReaderAPI } from "../../src/types";
const invoke = (channel: string, ...args: unknown[]) =>
  ipcRenderer.invoke(channel, ...args);
const listen = (channel: string, fn: (value: string) => void) => {
  const handler = (_event: unknown, value: string) => fn(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
const api: ReaderAPI = {
  library: () => invoke("library"),
  finishClose: () => invoke("finishClose"),
  shortcutCapture: (active) => invoke("shortcutCapture", active),
  open: (kind) => invoke("open", kind),
  read: (id) => invoke("read", id),
  openPath: (p) => invoke("openPath", p),
  drop: (files) =>
    invoke(
      "drop",
      files.map((f) => webUtils.getPathForFile(f)),
    ),
  replaceHighlights: (id, remove, add) =>
    invoke("replaceHighlights", id, remove, add),
  saveMark: (m) => invoke("saveMark", m),
  deleteMark: (id) => invoke("deleteMark", id),
  updateDocument: (d) => invoke("updateDocument", d),
  progress: (id, value) => invoke("progress", id, value),
  settings: (s) => invoke("settings", s),
  relink: (id) => invoke("relink", id),
  image: (id, src, remote) => invoke("image", id, src, remote),
  importImage: (name, bytes) => invoke("importImage", name, bytes),
  asset: (id) => invoke("asset", id),
  exportDocument: (id) => invoke("exportDocument", id),
  backup: () => invoke("backup"),
  restore: () => invoke("restore"),
  external: (url) => invoke("external", url),
  onChanged: (fn) => listen("changed", fn),
  onCommand: (fn) => listen("command", fn),
};
contextBridge.exposeInMainWorld("reader", api);
