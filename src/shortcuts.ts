export const annotationActions = [
  "highlight",
  "bold",
  "note",
  "yellow",
  "green",
  "blue",
  "pink",
] as const;
export type AnnotationAction = (typeof annotationActions)[number];
export type ShortcutMap = Record<AnnotationAction, string>;
export const defaultShortcuts: ShortcutMap = {
  yellow: "KeyH",
  green: "KeyJ",
  blue: "KeyK",
  pink: "KeyL",
  highlight: "Mod+Shift+KeyH",
  bold: "Mod+KeyB",
  note: "Mod+Shift+KeyM",
};
export const shortcutLabels: Record<AnnotationAction, string> = {
  yellow: "黄色高亮",
  green: "绿色高亮",
  blue: "蓝色高亮",
  pink: "粉色高亮",
  highlight: "高亮",
  bold: "加粗",
  note: "批注",
};
export type KeyInput = {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
  repeat?: boolean;
};
export function shortcutsFor(saved?: Partial<ShortcutMap>): ShortcutMap {
  const result = { ...defaultShortcuts, ...saved };
  const used = new Set(Object.values(saved || {}).filter(Boolean));
  for (const action of annotationActions) {
    if (saved?.[action] !== undefined) continue;
    if (used.has(result[action])) result[action] = "";
    else used.add(result[action]);
  }
  return result;
}
export function shortcutFromEvent(
  event: KeyInput,
  mac: boolean,
): string | null {
  // Physical codes remain stable when an IME reports Process / Unidentified.
  let code = event.code || "";
  if (!/^(Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2]))$/.test(code)) {
    const key = event.key.toUpperCase();
    code = /^[A-Z]$/.test(key)
      ? "Key" + key
      : /^[0-9]$/.test(key)
        ? "Digit" + key
        : /^F(?:[1-9]|1[0-2])$/.test(key)
          ? key
          : "";
  }
  if (
    !code ||
    (event.isComposing && !event.metaKey && !event.ctrlKey && !event.altKey)
  )
    return null;
  const parts = [];
  if (mac ? event.metaKey : event.ctrlKey) parts.push("Mod");
  if (mac ? event.ctrlKey : event.metaKey) parts.push(mac ? "Ctrl" : "Meta");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  return [...parts, code].join("+");
}
export function validShortcut(binding: string): boolean {
  return /^(Mod\+)?(Ctrl\+|Meta\+)?(Alt\+)?(Shift\+)?(Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2]))$/.test(
    binding,
  );
}
export function shortcutError(
  action: AnnotationAction,
  binding: string,
  map: ShortcutMap,
): string | null {
  if (!binding) return null;
  if (!validShortcut(binding)) return "请使用字母、数字或 F1–F12，可搭配修饰键";
  const reserved = [
    "Mod+KeyC",
    "Mod+KeyV",
    "Mod+KeyX",
    "Mod+KeyA",
    "Mod+KeyZ",
    "Mod+Shift+KeyZ",
    "Mod+KeyQ",
    "Mod+KeyW",
    "Mod+KeyH",
    "Mod+KeyM",
    "Mod+KeyF",
    "Mod+Shift+KeyF",
    "Mod+KeyO",
    "Mod+Shift+KeyO",
    "Mod+KeyR",
    "Mod+Shift+KeyR",
    "Mod+KeyY",
    "Mod+Digit0",
    "Alt+F4",
    "Mod+Alt+KeyI",
    "Mod+Shift+KeyI",
  ];
  if (reserved.includes(binding))
    return "该组合用于系统或应用常用操作，请换一组";
  const other = annotationActions.find(
    (key) => key !== action && map[key] === binding,
  );
  return other ? `与“${shortcutLabels[other]}”快捷键冲突` : null;
}
export function validateShortcuts(map: ShortcutMap) {
  for (const action of annotationActions) {
    if (typeof map[action] !== "string") throw Error("快捷键设置无效");
    const error = shortcutError(action, map[action], map);
    if (error) throw Error(error);
  }
}
export function formatShortcut(binding: string, mac: boolean) {
  if (!binding) return "未设置";
  return binding
    .split("+")
    .map(
      (part) =>
        (
          ({
            Mod: mac ? "⌘" : "Ctrl",
            Ctrl: mac ? "⌃" : "Ctrl",
            Meta: mac ? "⌘" : "Win",
            Alt: mac ? "⌥" : "Alt",
            Shift: mac ? "⇧" : "Shift",
          }) as Record<string, string>
        )[part] || part.replace(/^Key|^Digit/, ""),
    )
    .join(mac ? "" : " + ");
}
export function matchAnnotationShortcut(
  event: KeyInput,
  bindings: ShortcutMap,
  mac: boolean,
): AnnotationAction | null {
  if (event.repeat) return null;
  const key = shortcutFromEvent(event, mac);
  return annotationActions.find((action) => bindings[action] === key) || null;
}
