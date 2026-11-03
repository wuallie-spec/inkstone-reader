import { useEffect, useRef, useState } from "react";
import { ImagePlus, X, Trash2 } from "lucide-react";
import type { Mark } from "./types";
export function Asset({
  id,
  onClick,
}: {
  id: string;
  onClick?: (src: string) => void;
}) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    window.reader
      .asset(id)
      .then(setSrc)
      .catch(() => setSrc(""));
  }, [id]);
  return src ? (
    <img src={src} alt="批注图片" onClick={() => onClick?.(src)} />
  ) : (
    <span>图片不可用</span>
  );
}
export function NoteEditor({
  mark,
  onChange,
  onClose,
  onDelete,
  onError,
  onPreview,
}: {
  mark: Mark;
  onChange: (m: Mark) => void;
  onClose: () => void;
  onDelete: () => void;
  onError: (e: unknown) => void;
  onPreview: (src: string) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null),
    picker = useRef<HTMLInputElement>(null);
  const latest = useRef(mark),
    alive = useRef(true);
  latest.current = mark;
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    alive.current = true;
    input.current?.focus();
    return () => {
      alive.current = false;
    };
  }, [mark.id]);
  async function add(files: File[]) {
    setBusy(true);
    try {
      const ids = [];
      for (const file of files) {
        if (file.size > 20 * 1024 * 1024) throw Error("图片不能超过 20 MB");
        ids.push(
          await window.reader.importImage(file.name, await file.arrayBuffer()),
        );
      }
      if (alive.current)
        onChange({
          ...latest.current,
          images: [...new Set([...latest.current.images, ...ids])],
        });
    } catch (e) {
      onError(e);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section
      className="note-editor"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void add([...e.dataTransfer.files]);
      }}
      onPaste={(e) => {
        const files = [...e.clipboardData.files];
        if (files.length) {
          e.preventDefault();
          void add(files);
        }
      }}
    >
      <header>
        <span>写下你的想法</span>
        <button title="关闭批注" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <blockquote>{mark.anchor.quote}</blockquote>
      <textarea
        ref={input}
        placeholder="记录想法，或粘贴一张截图…"
        value={mark.note}
        onChange={(e) => onChange({ ...mark, note: e.target.value })}
      />
      <div className="attachment-grid">
        {mark.images.map((id) => (
          <div key={id}>
            <Asset id={id} onClick={onPreview} />
            <button
              title="删除图片"
              onClick={() =>
                onChange({
                  ...mark,
                  images: mark.images.filter((x) => x !== id),
                })
              }
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <footer>
        <button onClick={() => picker.current?.click()} disabled={busy}>
          <ImagePlus size={16} />
          {busy ? "正在导入…" : "添加图片"}
        </button>
        <small>{busy ? "" : "自动保存 · PNG / JPG / WebP"}</small>
        <button title="删除批注" onClick={onDelete}>
          <Trash2 size={15} />
        </button>
      </footer>
      <input
        ref={picker}
        type="file"
        hidden
        multiple
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          void add([...(e.target.files || [])]);
          e.target.value = "";
        }}
      />
    </section>
  );
}
