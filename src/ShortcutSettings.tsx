import { useEffect, useState } from "react";
import {
  annotationActions,
  defaultShortcuts,
  formatShortcut,
  shortcutError,
  shortcutFromEvent,
  shortcutLabels,
  type AnnotationAction,
  type ShortcutMap,
} from "./shortcuts";
export function ShortcutSettings({
  bindings,
  onChange,
}: {
  bindings: ShortcutMap;
  onChange: (next: ShortcutMap) => void;
}) {
  const [recording, setRecording] = useState<AnnotationAction | null>(null),
    [error, setError] = useState("");
  const mac = navigator.platform.includes("Mac");
  useEffect(() => {
    if (!recording) return;
    void window.reader.shortcutCapture(true);
    const handler = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        setRecording(null);
        setError("");
        return;
      }
      if (event.repeat) return;
      const binding = shortcutFromEvent(event, mac);
      if (!binding) return;
      const problem = shortcutError(recording, binding, bindings);
      if (problem) {
        setError(problem);
        return;
      }
      onChange({ ...bindings, [recording]: binding });
      setRecording(null);
      setError("");
    };
    window.addEventListener("keydown", handler, true);
    return () => {
      window.removeEventListener("keydown", handler, true);
      void window.reader.shortcutCapture(false);
    };
  }, [recording, bindings, onChange, mac]);
  return (
    <div className="shortcut-settings">
      <p>
        点击右侧按键，再按下你想使用的组合。也可设置单键，默认 H/J/K/L
        对应黄/绿/蓝/粉。未设置的颜色可手动绑定（升级时会保留已有快捷键）。
      </p>
      {annotationActions.map((action) => (
        <div className="shortcut-setting-row" key={action}>
          <span>{shortcutLabels[action]}</span>
          <button
            aria-label={"修改" + shortcutLabels[action] + "快捷键"}
            className={recording === action ? "recording" : ""}
            onClick={() => {
              setRecording(action);
              setError("");
            }}
          >
            {recording === action
              ? "请按快捷键…"
              : formatShortcut(bindings[action], mac)}
          </button>
          <button
            aria-label={"清除" + shortcutLabels[action] + "快捷键"}
            onClick={() => onChange({ ...bindings, [action]: "" })}
          >
            清除
          </button>
        </div>
      ))}
      {error && (
        <p role="alert" className="shortcut-error">
          {error}
        </p>
      )}
      <p className="shortcut-footnote">
        只在正文选中文字时生效，输入笔记时不会触发。Esc 取消录入。
      </p>
      <button
        className="shortcut-reset"
        onClick={() => {
          setRecording(null);
          setError("");
          onChange({ ...defaultShortcuts });
        }}
      >
        恢复默认快捷键
      </button>
    </div>
  );
}
