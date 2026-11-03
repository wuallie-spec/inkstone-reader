import { highlightChange } from "./highlights";
import { ShortcutSettings } from "./ShortcutSettings";
import {
  shortcutsFor,
  formatShortcut,
  matchAnnotationShortcut,
  shortcutFromEvent,
} from "./shortcuts";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  BookOpen,
  FolderOpen,
  FileText,
  Search,
  Plus,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Highlighter,
  Bold,
  MessageSquare,
  Bookmark,
  Settings2,
  Sun,
  Moon,
  Coffee,
  Download,
  Archive,
  Upload,
  Focus,
  X,
  MoreHorizontal,
  ArrowUp,
  ArrowDown,
  Link2,
  Check,
  Trash2,
  Library,
  Clock,
  Menu,
} from "lucide-react";
import { Markdown } from "./Markdown";
import { NoteEditor, Asset } from "./NoteEditor";
import {
  paintMarks,
  anchorAt,
  rangeAt,
  resolveAnchor,
  selectionAnchor,
  textIndex,
} from "./marks";
import type {
  Anchor,
  Color,
  Document,
  FileNode,
  Library as LibraryData,
  Mark,
  OpenDocument,
  Settings,
} from "./types";
import { welcome } from "./demo";
const colors: Color[] = ["yellow", "green", "blue", "pink"];
const colorNames = {
  yellow: "鹅黄",
  green: "苔绿",
  blue: "雾蓝",
  pink: "浅粉",
};
const defaults: Settings = {
  theme: "light",
  fontSize: 18,
  lineHeight: 1.9,
  width: 760,
  lastColor: "yellow",
};
const isMac = navigator.platform.includes("Mac"),
  mod = isMac ? "⌘" : "Ctrl+";
function Tree({
  nodes,
  filter,
  current,
  onOpen,
}: {
  nodes: FileNode[];
  filter: string;
  current?: string;
  onOpen: (path: string) => void;
}) {
  return (
    <>
      {nodes
        .filter(
          (n) =>
            !filter ||
            n.name.toLowerCase().includes(filter.toLowerCase()) ||
            n.children,
        )
        .map((n) =>
          n.children ? (
            <details key={n.path} open>
              <summary>
                <ChevronRight size={13} />
                <FolderOpen size={15} />
                {n.name}
              </summary>
              <div className="tree-children">
                <Tree
                  nodes={n.children}
                  filter={filter}
                  current={current}
                  onOpen={onOpen}
                />
              </div>
            </details>
          ) : (
            <button
              className={"file-row " + (current === n.path ? "selected" : "")}
              title={n.path}
              key={n.path}
              onClick={() => onOpen(n.path)}
            >
              <FileText size={15} />
              <span>{n.name.replace(/\.(md|markdown)$/i, "")}</span>
            </button>
          ),
        )}
    </>
  );
}
export default function App() {
  const [settingsTab, setSettingsTab] = useState<"appearance" | "shortcuts">(
    "appearance",
  );
  const [lib, setLib] = useState<LibraryData>({
      documents: [],
      tree: [],
      root: "",
      settings: defaults,
    }),
    [settings, setSettings] = useState(defaults),
    [active, setActive] = useState<OpenDocument | null>(null),
    [marks, setMarks] = useState<Mark[]>([]),
    [left, setLeft] = useState(true),
    [right, setRight] = useState(true),
    [focus, setFocus] = useState(false),
    [leftTab, setLeftTab] = useState("files"),
    [rightTab, setRightTab] = useState("notes"),
    [filter, setFilter] = useState(""),
    [colorFilter, setColorFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [showSearch, setShowSearch] = useState(false),
    [searchIndex, setSearchIndex] = useState(0),
    [searchCount, setSearchCount] = useState(0),
    [toolbar, setToolbar] = useState<{ x: number; y: number } | null>(null),
    [selection, setSelection] = useState<Anchor | null>(null),
    [editing, setEditing] = useState<string | null>(null),
    [selectedNote, setSelectedNote] = useState<string | null>(null),
    [noteChoices, setNoteChoices] = useState<string[]>([]),
    [revealTick, setRevealTick] = useState(0),
    [orphans, setOrphans] = useState(new Set<string>()),
    [outline, setOutline] = useState<
      { title: string; level: number; id: string }[]
    >([]),
    [showSettings, setShowSettings] = useState(false),
    [showMenu, setShowMenu] = useState(false),
    [toast, setToast] = useState(""),
    [preview, setPreview] = useState(""),
    [progress, setProgress] = useState(0),
    [missing, setMissing] = useState(false),
    [reanchor, setReanchor] = useState<string | null>(null);
  const notesScroller = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const content = useRef<HTMLDivElement>(null),
    scroller = useRef<HTMLElement>(null),
    searchInput = useRef<HTMLInputElement>(null),
    lastActive = useRef(active),
    lastMarks = useRef(marks),
    lastSettings = useRef(settings),
    command = useRef<(cmd: string) => void>(() => {}),
    saveQueue = useRef(Promise.resolve()),
    progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    searchRanges = useRef<Range[]>([]);
  lastActive.current = active;
  lastMarks.current = marks;
  lastSettings.current = settings;
  const error = useCallback(
    (e: unknown) => setToast(e instanceof Error ? e.message : String(e)),
    [],
  );
  const enqueue = useCallback(
    (fn: () => Promise<unknown>) => {
      saveQueue.current = saveQueue.current
        .then(fn)
        .then(() => {})
        .catch(error);
      return saveQueue.current;
    },
    [error],
  );
  const refresh = useCallback(async () => {
    const value = await window.reader.library();
    setLib(value);
    return value;
  }, []);
  const changeSettings = useCallback(
    (patch: Partial<Settings>) => {
      const next = { ...lastSettings.current, ...patch };
      lastSettings.current = next;
      setSettings(next);
      void enqueue(() => window.reader.settings(next));
    },
    [enqueue],
  );
  const display = useCallback(
    (value: OpenDocument) => {
      if (progressTimer.current) {
        const previous = lastActive.current?.document;
        if (previous)
          void enqueue(() =>
            window.reader.progress(previous.id, previous.progress),
          );
        clearTimeout(progressTimer.current);
        progressTimer.current = null;
      }
      setSelectedNote(null);
      setNoteChoices([]);
      setActive(value);
      setMarks(value.marks);
      setEditing(null);
      setToolbar(null);
      setSelection(null);
      setMissing(!!value.document.missing);
      setReanchor(null);
      setProgress(value.document.progress);
      changeSettings({ lastDoc: value.document.id });
      void refresh();
    },
    [changeSettings, refresh, enqueue],
  );
  const load = useCallback(
    async (id: string) => {
      try {
        await saveQueue.current;
        display(await window.reader.read(id));
      } catch (e) {
        const d = lib.documents.find((d) => d.id === id);
        if (d) {
          setActive({ document: d, source: "", marks: [] });
          setMarks([]);
          setMissing(true);
        }
        error(e);
      }
    },
    [display, lib.documents, error],
  );
  const choose = useCallback(
    async (kind: "file" | "folder") => {
      try {
        await saveQueue.current;
        const value = await window.reader.open(kind);
        if (value) display(value);
        await refresh();
      } catch (e) {
        error(e);
      }
    },
    [display, refresh, error],
  );
  const openPath = useCallback(
    async (path: string) => {
      try {
        await saveQueue.current;
        display(await window.reader.openPath(path));
      } catch (e) {
        error(e);
      }
    },
    [display, error],
  );
  useEffect(() => {
    window.reader
      .library()
      .then((value) => {
        setLib(value);
        setSettings(value.settings);
        lastSettings.current = value.settings;
        if (value.settings.lastDoc)
          window.reader
            .read(value.settings.lastDoc)
            .then(display)
            .catch(() => {});
      })
      .catch(error);
  }, []);
  useEffect(() => {
    const off = window.reader.onChanged((id) => {
      if (id === "library") {
        void refresh();
        return;
      }
      if (lastActive.current?.document.id === id) {
        void saveQueue.current
          .then(() => window.reader.read(id))
          .then((value) => {
            setSelectedNote(null);
            setNoteChoices([]);
            setActive(value);
            setMarks((previous) => {
              const draft = previous.find(
                (m) => m.id === editing && !m.note.trim() && !m.images.length,
              );
              return draft ? [...value.marks, draft] : value.marks;
            });
            setMissing(!!value.document.missing);
          })
          .catch(() => setMissing(true));
      }
    });
    return off;
  }, [refresh, editing]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);
  useLayoutEffect(() => {
    if (!content.current) return;
    setOrphans(paintMarks(content.current, marks));
    const headings = [...content.current.querySelectorAll("h1,h2,h3")].map(
      (h, i) => {
        h.id = "heading-" + i;
        return {
          id: h.id,
          title: h.textContent || "",
          level: Number(h.tagName[1]),
        };
      },
    );
    setOutline(headings);
  }, [marks, active?.source, missing]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (scroller.current) {
        const el = scroller.current;
        el.scrollTop =
          (active?.document.progress || 0) *
          Math.max(0, el.scrollHeight - el.clientHeight);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [active?.document.id]);
  const onLink = useCallback(
    (href: string) => {
      if (href.startsWith("#")) {
        const target = decodeURIComponent(href.slice(1));
        const root = content.current;
        const found =
          root?.querySelector('[id="' + CSS.escape(target) + '"]') ||
          [...(root?.querySelectorAll("h1,h2,h3,h4,h5,h6") || [])].find(
            (h) =>
              (h.textContent || "").toLowerCase().replace(/\s+/g, "-") ===
              target,
          );
        found?.scrollIntoView({ behavior: "smooth" });
        return;
      }
      if (/^https?:|^mailto:/i.test(href)) {
        void window.reader.external(href).catch(error);
        return;
      }
      const doc = lastActive.current?.document;
      if (doc && /\.(md|markdown)(#.*)?$/i.test(href)) {
        const base = doc.path.replace(/\\/g, "/");
        const resolved = new URL(
          href,
          "file://" + (base.startsWith("/") ? "" : "/") + base,
        );
        let target = decodeURIComponent(resolved.pathname);
        if (!base.startsWith("/")) target = target.slice(1);
        void openPath(target);
      }
    },
    [openPath, error],
  );
  const remove = (id: string) => {
    if (selectedNote === id) setSelectedNote(null);
    setNoteChoices((previous) => previous.filter((value) => value !== id));
    setMarks((previous) => previous.filter((m) => m.id !== id));
    if (editing === id) setEditing(null);
    void enqueue(() => window.reader.deleteMark(id));
  };
  const update = (m: Mark) => {
    setMarks((previous) => previous.map((x) => (x.id === m.id ? m : x)));
    if (m.note.trim() || m.images.length || m.kind !== "note")
      void enqueue(() => window.reader.saveMark(m));
    else void enqueue(() => window.reader.deleteMark(m.id));
  };
  const closeEditor = () => {
    const m = lastMarks.current.find((m) => m.id === editing);
    if (m && !m.note.trim() && !m.images.length)
      setMarks((previous) => previous.filter((x) => x.id !== m.id));
    setEditing(null);
  };
  const revealNote = (id: string) => {
    closeEditor();
    setSelectedNote(id);
    setNoteChoices([]);
    setRight(true);
    setFocus(false);
    setRightTab("notes");
    const target = marks.find((m) => m.id === id);
    if (target && colorFilter !== "all" && colorFilter !== target.color)
      setColorFilter("all");
    setRevealTick((value) => value + 1);
  };
  useEffect(() => {
    if (!selectedNote) return;
    const frame = requestAnimationFrame(() => {
      const container = notesScroller.current;
      const card = container
        ? Array.from(
            container.querySelectorAll<HTMLElement>("[data-note-id]"),
          ).find((el) => el.dataset.noteId === selectedNote)
        : undefined;
      if (!container || !card) return;
      const outer = container.getBoundingClientRect();
      const inner = card.getBoundingClientRect();
      container.scrollTo({
        top: container.scrollTop + inner.top - outer.top - 12,
        behavior: "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedNote, revealTick, right, focus, rightTab, colorFilter]);
  const markSelection = (kind: Mark["kind"], color = settings.lastColor) => {
    if (!active || missing || !content.current) {
      setToast("请先打开一篇 Markdown 文档");
      return;
    }
    const a = selectionAnchor(content.current);
    if (!a || !a.quote) {
      setToast("请先在正文中选中文字，再使用标记快捷键");
      return;
    }
    if (reanchor) {
      const m = marks.find((m) => m.id === reanchor);
      if (m) update({ ...m, anchor: a });
      setReanchor(null);
      setToast("已重新关联原文");
      return;
    }
    if (kind === "highlight") {
      const patch = highlightChange(
        textIndex(content.current),
        lastMarks.current,
        a,
        color,
        active.document.id,
      );
      const next = [
        ...lastMarks.current.filter((m) => !patch.remove.includes(m.id)),
        ...patch.add,
      ];
      lastMarks.current = next;
      setMarks(next);
      changeSettings({ lastColor: color });
      void enqueue(() =>
        window.reader.replaceHighlights(
          active.document.id,
          patch.remove,
          patch.add,
        ),
      );
      return;
    }
    const existing = marks.find(
      (m) =>
        m.kind === kind &&
        resolveAnchor(textIndex(content.current!), m.anchor)?.start ===
          a.start &&
        m.anchor.quote === a.quote,
    );
    if (existing) {
      if (kind === "note") {
        setEditing(existing.id);
        setRight(true);
      } else remove(existing.id);
      return;
    }
    const m: Mark = {
      id: crypto.randomUUID(),
      docId: active.document.id,
      kind,
      color: settings.lastColor,
      anchor: a,
      note: "",
      images: [],
      createdAt: Date.now(),
    };
    setMarks((previous) => [...previous, m]);
    if (kind === "note") {
      closeEditor();
      setEditing(m.id);
      setRight(true);
      setFocus(false);
      setRightTab("notes");
    } else void enqueue(() => window.reader.saveMark(m));
    setToolbar(null);
  };
  const jump = (a: Anchor) => {
    if (!content.current) return;
    const located = resolveAnchor(textIndex(content.current), a);
    if (!located) {
      setToast("原文暂时无法定位，请重新关联");
      return;
    }
    const range = rangeAt(content.current, located.start, located.end);
    range?.startContainer.parentElement?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    if (range) {
      const css = CSS as any;
      css.highlights?.set("jump", new (window as any).Highlight(range));
      setTimeout(() => css.highlights?.delete("jump"), 1800);
    }
  };
  const addBookmark = () => {
    if (!active || !content.current) return;
    const text = textIndex(content.current);
    const top = scroller.current?.getBoundingClientRect().top || 0;
    let anchor = selectionAnchor(content.current);
    if (!anchor) {
      const walker = document.createTreeWalker(
        content.current,
        NodeFilter.SHOW_TEXT,
      );
      let offset = 0;
      while (walker.nextNode()) {
        const n = walker.currentNode as Text;
        if (n.parentElement?.closest("[data-no-anchor],.katex")) continue;
        if (
          n.parentElement!.getBoundingClientRect().bottom > top + 60 &&
          n.data.trim()
        ) {
          anchor = anchorAt(text, offset, Math.min(offset + 80, text.length));
          break;
        }
        offset += n.length;
      }
    }
    if (!anchor) return;
    const d = {
      ...active.document,
      bookmarks: [
        ...active.document.bookmarks,
        { id: crypto.randomUUID(), anchor },
      ],
    };
    setActive({ ...active, document: d });
    void enqueue(() => window.reader.updateDocument(d));
    setRightTab("bookmarks");
    setRight(true);
  };
  const handleScroll = () => {
    if (!scroller.current || !lastActive.current || missing) return;
    const el = scroller.current;
    const fraction =
      el.scrollHeight <= el.clientHeight
        ? 0
        : el.scrollTop / (el.scrollHeight - el.clientHeight);
    setProgress(fraction);
    const doc = { ...lastActive.current.document, progress: fraction };
    lastActive.current = { ...lastActive.current, document: doc };
    setActive((previous) =>
      previous ? { ...previous, document: doc } : previous,
    );
    if (progressTimer.current) clearTimeout(progressTimer.current);
    progressTimer.current = setTimeout(() => {
      void enqueue(() => window.reader.progress(doc.id, doc.progress));
      progressTimer.current = null;
    }, 250);
  };
  useEffect(() => {
    const flush = () => {
      if (lastActive.current)
        void window.reader.progress(
          lastActive.current.document.id,
          lastActive.current.document.progress,
        );
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);
  const find = (index: number) => {
    const count = searchRanges.current.length;
    if (!count) return;
    const next = (index + count) % count;
    setSearchIndex(next);
    const r = searchRanges.current[next];
    r.startContainer.parentElement?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
    (CSS as any).highlights?.set(
      "search-current",
      new (window as any).Highlight(r),
    );
  };
  useEffect(() => {
    const css = CSS as any;
    css.highlights?.delete("search");
    css.highlights?.delete("search-current");
    searchRanges.current = [];
    if (query && content.current) {
      const text = textIndex(content.current).toLocaleLowerCase(),
        needle = query.toLocaleLowerCase();
      let pos = text.indexOf(needle);
      while (pos >= 0 && searchRanges.current.length < 10000) {
        const r = rangeAt(content.current, pos, pos + needle.length);
        if (r) searchRanges.current.push(r);
        pos = text.indexOf(needle, pos + needle.length);
      }
      if (searchRanges.current.length)
        css.highlights?.set(
          "search",
          new (window as any).Highlight(...searchRanges.current),
        );
    }
    setSearchCount(searchRanges.current.length);
    setSearchIndex(0);
    if (query) find(0);
  }, [query, active?.source, marks]);
  command.current = (cmd: string) => {
    if (cmd === "flush-close") {
      void saveQueue.current
        .then(async () => {
          const doc = lastActive.current?.document;
          if (doc) await window.reader.progress(doc.id, doc.progress);
          await window.reader.finishClose();
        })
        .catch(error);
      return;
    }
    const editingInput = (document.activeElement as HTMLElement)?.closest(
      "input,textarea,[contenteditable=true]",
    );
    if (colors.includes(cmd as Color)) {
      if (!editingInput) markSelection("highlight", cmd as Color);
      return;
    }
    if (["highlight", "bold", "note"].includes(cmd)) {
      if (!editingInput) markSelection(cmd as Mark["kind"]);
      return;
    }
    if (cmd === "search") {
      setShowSearch(true);
      setTimeout(() => searchInput.current?.focus(), 20);
    } else if (cmd === "open") void choose("file");
    else if (cmd === "folder") void choose("folder");
    else if (cmd === "focus") setFocus((x) => !x);
    else if (cmd === "export" && active)
      void saveQueue.current
        .then(() => window.reader.exportDocument(active.document.id))
        .then((ok) => ok && setToast("笔记已导出"))
        .catch(error);
    else if (cmd === "backup")
      void saveQueue.current
        .then(() => window.reader.backup())
        .then((ok) => ok && setToast("备份已保存"))
        .catch(error);
    else if (cmd === "restore")
      void window.reader
        .restore()
        .then(async (ok) => {
          if (ok) {
            await refresh();
            if (active) display(await window.reader.read(active.document.id));
            setToast("备份已恢复");
          }
        })
        .catch(error);
  };
  useEffect(() => window.reader.onCommand((cmd) => command.current(cmd)), []);
  // Annotation keys have one owner: this renderer handler. Native menu clicks use command dispatch.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const editingInput = (e.target as HTMLElement)?.closest?.(
        "input,textarea,[contenteditable=true]",
      );
      if (!editingInput && !showSettings) {
        const action = matchAnnotationShortcut(
          e,
          shortcutsFor(lastSettings.current.shortcuts),
          isMac,
        );
        if (action) {
          e.preventDefault();
          command.current(action);
          return;
        }
      }
      const fixed = shortcutFromEvent(e, isMac);
      const fixedAction = (
        {
          "Mod+KeyF": "search",
          "Mod+KeyO": "open",
          "Mod+Shift+KeyO": "folder",
          "Mod+Shift+KeyF": "focus",
        } as Record<string, string>
      )[fixed || ""];
      if (fixedAction && !e.repeat) {
        e.preventDefault();
        command.current(fixedAction);
        return;
      }
      if (e.key === "Escape") {
        setToolbar(null);
        setShowSearch(false);
        setQuery("");
        setShowSettings(false);
        setShowMenu(false);
        setPreview("");
        setReanchor(null);
        closeEditor();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editing, showSettings]);
  const capture = () => {
    setTimeout(() => {
      if (!content.current) return;
      const a = selectionAnchor(content.current);
      if (!a) {
        setToolbar(null);
        setSelection(null);
        return;
      }
      setSelection(a);
      const rect = window.getSelection()?.getRangeAt(0).getBoundingClientRect();
      if (rect)
        setToolbar({
          x: Math.max(
            180,
            Math.min(window.innerWidth - 200, rect.left + rect.width / 2),
          ),
          y: Math.max(120, rect.top - 48),
        });
    }, 0);
  };
  const bindings = shortcutsFor(settings.shortcuts);
  const shortcutText = (action: "highlight" | "bold" | "note" | Color) =>
    formatShortcut(bindings[action], isMac);
  const shown = marks.filter(
      (m) =>
        (settings.showHighlightRecords || m.kind !== "highlight") &&
        (colorFilter === "all" || m.color === colorFilter),
    ),
    editingMark = marks.find((m) => m.id === editing);
  return (
    <div
      className={"app " + (focus ? "focused" : "")}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length)
          void window.reader
            .drop([...e.dataTransfer.files])
            .then((value) => value && display(value))
            .catch(error);
      }}
    >
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon">
            <BookOpen size={22} />
          </span>
          <strong>
            墨读<span>INKSTONE</span>
          </strong>
        </div>
        <div className="header-center">
          <span className="status-dot" />
          本地阅读空间
        </div>
        <div className="header-actions">
          <button
            title="专注模式"
            className={focus ? "active" : ""}
            onClick={() => setFocus(!focus)}
          >
            <Focus size={17} />
            <span>专注</span>
          </button>
          <button
            title="阅读设置"
            className={showSettings ? "active" : ""}
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings2 size={18} />
          </button>
          <div className="popover-anchor">
            <button title="更多操作" onClick={() => setShowMenu(!showMenu)}>
              <MoreHorizontal size={20} />
            </button>
            {showMenu && (
              <div className="popover menu">
                {[
                  ["export", "导出当前笔记", Download],
                  ["backup", "完整备份", Archive],
                  ["restore", "恢复备份", Upload],
                ].map(([id, label, Icon]: any) => (
                  <button
                    key={id}
                    onClick={() => {
                      command.current(id);
                      setShowMenu(false);
                    }}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="workspace">
        {left && !focus && (
          <aside className="left-sidebar">
            <div className="sidebar-title">
              <span>我的书桌</span>
              <button title="打开文件夹" onClick={() => choose("folder")}>
                <Plus size={17} />
              </button>
            </div>
            <div className="open-actions">
              <button className="primary" onClick={() => choose("file")}>
                <Plus size={16} />
                打开文件
              </button>
              <button title="打开文件夹" onClick={() => choose("folder")}>
                <FolderOpen size={18} />
              </button>
            </div>
            <div className="sidebar-tabs">
              <button
                className={leftTab === "files" ? "active" : ""}
                onClick={() => setLeftTab("files")}
              >
                <Library size={14} />
                文件
              </button>
              <button
                className={leftTab === "outline" ? "active" : ""}
                onClick={() => setLeftTab("outline")}
              >
                <Menu size={14} />
                目录
              </button>
            </div>
            {leftTab === "files" ? (
              <>
                <label className="filter">
                  <Search size={14} />
                  <input
                    placeholder="查找文档…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                </label>
                <div className="file-list">
                  {lib.tree.length > 0 && (
                    <>
                      <p className="section-label">
                        {lib.root.split(/[\\/]/).pop()}
                      </p>
                      <Tree
                        nodes={lib.tree}
                        filter={filter}
                        current={active?.document.path}
                        onOpen={openPath}
                      />
                    </>
                  )}
                  <p className="section-label">
                    <Clock size={12} />
                    最近阅读
                  </p>
                  {lib.documents
                    .filter((d) =>
                      d.title.toLowerCase().includes(filter.toLowerCase()),
                    )
                    .map((d) => (
                      <button
                        key={d.id}
                        title={d.path}
                        className={
                          "file-row " +
                          (d.id === active?.document.id ? "selected" : "")
                        }
                        onClick={() => load(d.id)}
                      >
                        <FileText size={15} />
                        <span>{d.title.replace(/\.(md|markdown)$/i, "")}</span>
                        {d.missing && <small>缺失</small>}
                      </button>
                    ))}
                  {!lib.documents.length && (
                    <div className="library-empty">
                      <BookOpen size={28} />
                      <p>
                        你的下一次发现
                        <br />
                        从打开一篇文档开始
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <nav className="outline">
                {outline.map((h) => (
                  <button
                    key={h.id}
                    style={{ paddingLeft: 14 + (h.level - 1) * 12 }}
                    onClick={() =>
                      document
                        .getElementById(h.id)
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    {h.title}
                  </button>
                ))}
              </nav>
            )}
            <div className="sidebar-bottom">
              <span className="status-dot" />
              <span>仅存于本机</span>
              <small>{lib.documents.length} 篇文档</small>
            </div>
          </aside>
        )}
        <section className="reading-pane">
          <div className="document-toolbar">
            <div>
              <button
                title={left ? "收起文件栏" : "展开文件栏"}
                onClick={() => {
                  setLeft(!left);
                  setFocus(false);
                }}
              >
                {left && !focus ? (
                  <PanelLeftClose size={17} />
                ) : (
                  <PanelLeftOpen size={17} />
                )}
              </button>
              <span className="breadcrumb">
                书桌 <ChevronRight size={12} />{" "}
                <strong>{active?.document.title || "欢迎使用墨读"}</strong>
              </span>
            </div>
            <div>
              <button
                title={"文内搜索 " + mod + "F"}
                onClick={() => command.current("search")}
              >
                <Search size={17} />
              </button>
              <button
                title="添加书签"
                disabled={!active || missing}
                onClick={addBookmark}
              >
                <Bookmark size={17} />
              </button>
              <button
                title="展开 / 收起笔记"
                onClick={() => {
                  setRight(!right);
                  setFocus(false);
                }}
              >
                {right && !focus ? (
                  <PanelRightClose size={17} />
                ) : (
                  <PanelRightOpen size={17} />
                )}
              </button>
            </div>
          </div>
          {showSearch && (
            <div className="searchbar">
              <Search size={16} />
              <input
                ref={searchInput}
                placeholder="在文档中查找…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    find(searchIndex + (e.shiftKey ? -1 : 1));
                }}
              />
              <span>
                {searchCount ? searchIndex + 1 : 0} / {searchCount}
              </span>
              <button title="上一个结果" onClick={() => find(searchIndex - 1)}>
                <ArrowUp size={16} />
              </button>
              <button title="下一个结果" onClick={() => find(searchIndex + 1)}>
                <ArrowDown size={16} />
              </button>
              <button
                title="关闭搜索"
                onClick={() => {
                  setShowSearch(false);
                  setQuery("");
                }}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {missing ? (
            <div className="missing">
              <FileText size={40} />
              <h2>原文件已移动或不可用</h2>
              <p>你的批注仍保存在本机。重新关联文件即可继续阅读。</p>
              <button
                className="primary"
                onClick={() =>
                  active &&
                  window.reader
                    .relink(active.document.id)
                    .then((v) => v && display(v))
                    .catch(error)
                }
              >
                <Link2 size={16} />
                重新关联文件
              </button>
            </div>
          ) : (
            <main
              ref={scroller}
              className="reader-scroll"
              onScroll={handleScroll}
            >
              <div className="document-meta">
                <span>
                  {active ? "MARKDOWN DOCUMENT" : "A QUIET PLACE TO THINK"}
                </span>
                <span>
                  {active
                    ? Math.ceil(active.source.length / 600) + " 分钟阅读"
                    : "阅读 · 思考 · 留下痕迹"}
                </span>
              </div>
              <article
                key={
                  (active?.document.id || "welcome") +
                  ":" +
                  (active?.source || "")
                }
                ref={content}
                className="markdown"
                style={{
                  fontSize: settings.fontSize,
                  lineHeight: settings.lineHeight,
                  maxWidth: settings.width,
                }}
                onMouseUp={capture}
                onKeyUp={capture}
                onPointerDown={(e) => {
                  pointerStart.current = { x: e.clientX, y: e.clientY };
                }}
                onClick={(e) => {
                  const start = pointerStart.current;
                  pointerStart.current = null;
                  if (
                    (start &&
                      Math.hypot(e.clientX - start.x, e.clientY - start.y) >
                        4) ||
                    !window.getSelection()?.isCollapsed
                  )
                    return;
                  const span = (e.target as HTMLElement).closest(
                    "[data-marks]",
                  );
                  const ids =
                    span?.getAttribute("data-marks")?.split(" ") || [];
                  const notes = marks.filter(
                    (m) => ids.includes(m.id) && m.kind === "note",
                  );
                  if (!notes.length) {
                    setNoteChoices([]);
                    return;
                  }
                  e.preventDefault();
                  if (notes.length === 1) revealNote(notes[0].id);
                  else setNoteChoices(notes.map((m) => m.id));
                }}
              >
                <Markdown
                  source={active?.source ?? welcome}
                  docId={active?.document.id || ""}
                  onLink={onLink}
                />
              </article>
              <div className="end-mark">
                ◆<span>读到这里，也是一种收获。</span>
              </div>
            </main>
          )}
          <footer className="reading-footer">
            <span>{active ? "Markdown · UTF-8" : "欢迎来到你的阅读空间"}</span>
            <span>
              {marks.length > 0 && `${marks.length} 处标记 · `}
              {Math.round(progress * 100)}% 已读
            </span>
          </footer>
          <div className="progress-track">
            <div style={{ width: progress * 100 + "%" }} />
          </div>
        </section>
        {noteChoices.length > 1 && (
          <div
            className="note-choice-backdrop"
            onClick={() => setNoteChoices([])}
          >
            <section
              className="note-choice"
              role="dialog"
              aria-label="选择批注"
              onClick={(e) => e.stopPropagation()}
            >
              <header>
                此处有多条批注
                <button onClick={() => setNoteChoices([])}>关闭</button>
              </header>
              {noteChoices
                .map((id) => marks.find((m) => m.id === id))
                .filter((m): m is Mark => !!m)
                .map((m) => (
                  <button key={m.id} onClick={() => revealNote(m.id)}>
                    {m.note.trim().slice(0, 80) || "图片批注"}
                    {m.images.length > 0 && ` · ${m.images.length} 张图片`}
                  </button>
                ))}
            </section>
          </div>
        )}
        {right && !focus && (
          <aside className="right-sidebar">
            <div className="sidebar-title">
              <span>
                阅读笔记 <small>{marks.length}</small>
              </span>
              <button
                title="导出笔记"
                disabled={!active}
                onClick={() => command.current("export")}
              >
                <Download size={16} />
              </button>
            </div>
            <div className="sidebar-tabs">
              <button
                className={rightTab === "notes" ? "active" : ""}
                onClick={() => setRightTab("notes")}
              >
                <MessageSquare size={14} />
                批注
              </button>
              <button
                className={rightTab === "bookmarks" ? "active" : ""}
                onClick={() => setRightTab("bookmarks")}
              >
                <Bookmark size={14} />
                书签 <small>{active?.document.bookmarks.length || 0}</small>
              </button>
            </div>
            {rightTab === "notes" ? (
              <>
                <label className="highlight-record-toggle">
                  <input
                    type="checkbox"
                    checked={!!settings.showHighlightRecords}
                    onChange={(e) =>
                      changeSettings({ showHighlightRecords: e.target.checked })
                    }
                  />
                  显示高亮记录
                </label>
                <div className="color-filter">
                  <button
                    className={colorFilter === "all" ? "active" : ""}
                    onClick={() => setColorFilter("all")}
                  >
                    全部
                  </button>
                  {colors.map((c) => (
                    <button
                      key={c}
                      className={
                        "swatch " + (colorFilter === c ? "chosen" : "")
                      }
                      data-color={c}
                      title={colorNames[c]}
                      onClick={() => setColorFilter(c)}
                    />
                  ))}
                  <span>
                    {orphans.size > 0 ? `${orphans.size} 条待定位` : ""}
                  </span>
                </div>
                <div className="notes-scroll" ref={notesScroller}>
                  {reanchor && (
                    <div className="reanchor-hint">
                      请在正文重新选中文字，然后点击“关联此处”。
                      <button onClick={() => setReanchor(null)}>取消</button>
                    </div>
                  )}
                  {editingMark && (
                    <NoteEditor
                      key={editingMark.id}
                      mark={editingMark}
                      onChange={update}
                      onClose={closeEditor}
                      onDelete={() => remove(editingMark.id)}
                      onError={error}
                      onPreview={setPreview}
                    />
                  )}
                  {shown
                    .filter((m) => m.id !== editing)
                    .map((m) => (
                      <section
                        key={m.id}
                        className={
                          "note-card" +
                          (selectedNote === m.id ? " selected-note" : "")
                        }
                        data-note-id={m.id}
                        data-color={m.color}
                      >
                        <div className="note-card-header">
                          <span>
                            {m.kind === "bold" ? (
                              <Bold size={13} />
                            ) : m.kind === "highlight" ? (
                              <Highlighter size={13} />
                            ) : (
                              <MessageSquare size={13} />
                            )}{" "}
                            {m.kind === "bold"
                              ? "加粗"
                              : m.kind === "highlight"
                                ? "高亮"
                                : "批注"}
                          </span>
                          <time>
                            {new Date(m.createdAt).toLocaleDateString("zh-CN", {
                              month: "short",
                              day: "numeric",
                            })}
                          </time>
                        </div>
                        <blockquote onClick={() => jump(m.anchor)}>
                          {m.anchor.quote}
                        </blockquote>
                        {m.note && (
                          <p onClick={() => setEditing(m.id)}>{m.note}</p>
                        )}
                        {m.images.length > 0 && (
                          <div className="note-thumbnails">
                            {m.images.map((id) => (
                              <Asset key={id} id={id} onClick={setPreview} />
                            ))}
                          </div>
                        )}
                        <footer>
                          {orphans.has(m.id) ? (
                            <button
                              onClick={() => {
                                setReanchor(m.id);
                                setToast("选中新的原文，再点击关联此处");
                              }}
                            >
                              <Link2 size={13} />
                              待定位 · 关联
                            </button>
                          ) : (
                            <button onClick={() => jump(m.anchor)}>
                              查看原文 <ChevronRight size={12} />
                            </button>
                          )}
                          <span />
                          {m.kind === "note" && (
                            <button
                              onClick={() => {
                                closeEditor();
                                setEditing(m.id);
                              }}
                            >
                              编辑
                            </button>
                          )}
                          <button title="删除标记" onClick={() => remove(m.id)}>
                            <Trash2 size={13} />
                          </button>
                        </footer>
                      </section>
                    ))}
                  {!shown.length && (
                    <div className="notes-empty">
                      <div className="empty-symbol">
                        <MessageSquare size={27} />
                        <span>✦</span>
                      </div>
                      <h3>
                        {marks.length
                          ? "当前没有可显示的记录"
                          : "好想法，值得留下"}
                      </h3>
                      <p>
                        选中一段打动你的文字，
                        <br />
                        记下此刻的想法。高亮记录可通过上方开关显示。
                      </p>
                      <div className="shortcut-hints">
                        <span>
                          <Highlighter size={14} />
                          高亮<kbd>{shortcutText("highlight")}</kbd>
                        </span>
                        <span>
                          <Bold size={14} />
                          加粗<kbd>{shortcutText("bold")}</kbd>
                        </span>
                        <span>
                          <MessageSquare size={14} />
                          批注<kbd>{shortcutText("note")}</kbd>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="notes-scroll">
                {active?.document.bookmarks.map((b) => (
                  <div className="bookmark-card" key={b.id}>
                    <button onClick={() => jump(b.anchor)}>
                      <Bookmark size={15} />
                      {b.anchor.quote}
                    </button>
                    <button
                      title="删除书签"
                      onClick={() => {
                        const doc = {
                          ...active.document,
                          bookmarks: active.document.bookmarks.filter(
                            (x) => x.id !== b.id,
                          ),
                        };
                        setActive({ ...active, document: doc });
                        void enqueue(() => window.reader.updateDocument(doc));
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {!active?.document.bookmarks.length && (
                  <div className="notes-empty">
                    <Bookmark size={30} />
                    <h3>留一个位置给下次</h3>
                    <p>
                      点击正文上方的书签图标，
                      <br />
                      保存当前阅读位置。
                    </p>
                  </div>
                )}
              </div>
            )}
            <div className="notes-bottom">
              <span className="status-dot" />
              标记独立保存，原文保持不变
            </div>
          </aside>
        )}
      </div>
      {toolbar && active && (
        <div
          className="selection-toolbar"
          style={{ left: toolbar.x, top: toolbar.y }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {reanchor ? (
            <button onClick={() => markSelection("highlight")}>
              <Link2 size={15} />
              关联此处
            </button>
          ) : (
            <>
              {colors.map((c) => (
                <button
                  key={c}
                  className={
                    "swatch " + (settings.lastColor === c ? "chosen" : "")
                  }
                  title={colorNames[c] + " " + shortcutText(c)}
                  data-color={c}
                  onClick={() => markSelection("highlight", c)}
                />
              ))}
              <i />
              <button
                title={"高亮 " + shortcutText("highlight")}
                onClick={() => markSelection("highlight")}
              >
                <Highlighter size={17} />
              </button>
              <button
                title={"加粗 " + shortcutText("bold")}
                onClick={() => markSelection("bold")}
              >
                <Bold size={17} />
              </button>
              <button
                title={"批注 " + shortcutText("note")}
                onClick={() => markSelection("note")}
              >
                <MessageSquare size={17} />
                <span>批注</span>
              </button>
            </>
          )}
        </div>
      )}
      {showSettings && (
        <div className="settings popover">
          <header>
            <strong>阅读设置</strong>
            <button title="关闭设置" onClick={() => setShowSettings(false)}>
              <X size={16} />
            </button>
          </header>
          <div className="settings-tabs">
            <button
              className={settingsTab === "appearance" ? "active" : ""}
              onClick={() => setSettingsTab("appearance")}
            >
              外观
            </button>
            <button
              className={settingsTab === "shortcuts" ? "active" : ""}
              onClick={() => setSettingsTab("shortcuts")}
            >
              快捷键
            </button>
          </div>
          {settingsTab === "shortcuts" ? (
            <ShortcutSettings
              bindings={bindings}
              onChange={(shortcuts) => changeSettings({ shortcuts })}
            />
          ) : (
            <>
              <label>纸张主题</label>
              <div className="themes">
                {(
                  [
                    ["light", "明亮", Sun],
                    ["sepia", "暖纸", Coffee],
                    ["dark", "夜读", Moon],
                  ] as const
                ).map(([theme, label, Icon]) => (
                  <button
                    key={theme}
                    className={settings.theme === theme ? "selected" : ""}
                    onClick={() => changeSettings({ theme })}
                  >
                    <Icon size={18} />
                    {label}
                  </button>
                ))}
              </div>
              <label>
                字号 <span>{settings.fontSize}px</span>
              </label>
              <input
                aria-label="字号"
                type="range"
                min="12"
                max="32"
                value={settings.fontSize}
                onChange={(e) => changeSettings({ fontSize: +e.target.value })}
              />
              <label>
                行距 <span>{settings.lineHeight.toFixed(1)}</span>
              </label>
              <input
                aria-label="行距"
                type="range"
                min="1.2"
                max="2.8"
                step="0.1"
                value={settings.lineHeight}
                onChange={(e) =>
                  changeSettings({ lineHeight: +e.target.value })
                }
              />
              <label>
                阅读宽度 <span>{settings.width}px</span>
              </label>
              <input
                aria-label="阅读宽度"
                type="range"
                min="520"
                max="1100"
                step="20"
                value={settings.width}
                onChange={(e) => changeSettings({ width: +e.target.value })}
              />
            </>
          )}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button title="关闭提示" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {preview && (
        <div className="lightbox" onClick={() => setPreview("")}>
          <button title="关闭大图">
            <X size={24} />
          </button>
          <img src={preview} alt="批注图片大图" />
        </div>
      )}
    </div>
  );
}
