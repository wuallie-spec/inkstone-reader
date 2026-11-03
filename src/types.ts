export type Color = "yellow" | "green" | "blue" | "pink";
export type Anchor = {
  start: number;
  end: number;
  quote: string;
  prefix: string;
  suffix: string;
  fingerprint?: string;
};
export type Mark = {
  id: string;
  docId: string;
  kind: "highlight" | "bold" | "note";
  color: Color;
  anchor: Anchor;
  note: string;
  images: string[];
  createdAt: number;
};
export type Document = {
  id: string;
  path: string;
  title: string;
  progress: number;
  bookmarks: { id: string; anchor: Anchor }[];
  updatedAt: number;
  missing?: boolean;
};
export type OpenDocument = {
  document: Document;
  source: string;
  marks: Mark[];
};
export type FileNode = { name: string; path: string; children?: FileNode[] };
export type Settings = {
  theme: "light" | "dark" | "sepia";
  fontSize: number;
  lineHeight: number;
  width: number;
  lastColor: Color;
  lastDoc?: string;
  showHighlightRecords?: boolean;
  shortcuts?: import("./shortcuts").ShortcutMap;
};
export type Library = {
  documents: Document[];
  tree: FileNode[];
  root: string;
  settings: Settings;
};
export interface ReaderAPI {
  library(): Promise<Library>;
  finishClose(): Promise<void>;
  shortcutCapture(active: boolean): Promise<void>;
  open(kind: "file" | "folder"): Promise<OpenDocument | null>;
  read(id: string): Promise<OpenDocument>;
  openPath(path: string): Promise<OpenDocument>;
  drop(files: File[]): Promise<OpenDocument | null>;
  replaceHighlights(
    docId: string,
    remove: string[],
    add: Mark[],
  ): Promise<void>;
  saveMark(mark: Mark): Promise<void>;
  deleteMark(id: string): Promise<void>;
  updateDocument(doc: Document): Promise<void>;
  progress(id: string, value: number): Promise<void>;
  settings(value: Settings): Promise<void>;
  relink(id: string): Promise<OpenDocument | null>;
  image(docId: string, src: string, remote?: boolean): Promise<string>;
  importImage(name: string, bytes: ArrayBuffer): Promise<string>;
  asset(id: string): Promise<string>;
  exportDocument(id: string): Promise<boolean>;
  backup(): Promise<boolean>;
  restore(): Promise<boolean>;
  external(url: string): Promise<void>;
  onChanged(fn: (id: string) => void): () => void;
  onCommand(fn: (cmd: string) => void): () => void;
}
declare global {
  interface Window {
    reader: ReaderAPI;
  }
}
