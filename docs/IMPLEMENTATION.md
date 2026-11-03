# Inkstone implementation plan

Goal: deliver the approved local Markdown desktop reader with independent highlights, emphasis and image annotations.
Architecture: sandboxed Electron renderer, typed preload bridge, main-process SQLite persistence and managed image assets. React renders sanitized Markdown and a shared text index supports selection, overlapping marks, search and reanchoring.

1. Reading foundation: configure Electron/Vite/TypeScript, shared types, safe Markdown renderer and three-pane UI. Verify typecheck/build and malformed Markdown handling.
2. Persistence and annotations: SQLite document records, typed CRUD, context-aware anchor resolver, text-node painting and shortcuts. Test duplicated quotes, moved text, orphaning and overlapping spans.
3. Image and portability: validated managed assets, clipboard/drop/picker, preview, Markdown/ZIP export and validated transactional restore. Test format/size rejection, backup idempotence and asset recovery.
4. Desktop integration: dialogs, file watchers, folder tree, recent files, relink, menu commands, themes and progress. Verify Electron launch and end-to-end selection/keyboard behavior.
5. Delivery: build macOS artifact, configure Windows installer, document tested platforms and signing limitations.

Defaults: Inkstone / 墨读; local-only; images <=20 MiB; no raw HTML execution; relative links restricted to granted workspace; formula/diagram text excluded from anchor index. Empty notes discarded. Backup retains document identities and uses non-overwriting merge by ID.

## 0.1.3 四色快捷键

新增 yellow/green/blue/pink 动作，默认物理按键 H/J/K/L。旧绑定优先，新默认冲突时留空。高亮覆盖按文本区间计算，只重建与选区连通的重叠高亮；保留无关标记 ID 和待定位标记。旧重叠数据按渲染器的首条优先规则消除隐含颜色。新增受限 replaceHighlights IPC，校验文档、删除对象类型及新增 ID，使用 SQLite 事务保存全部变化。正文、加粗、批注及其图片不改写。
