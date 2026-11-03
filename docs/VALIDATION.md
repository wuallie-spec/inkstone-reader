# Validation

Test host: macOS, Apple Silicon (arm64), Node 24.16.0, Electron 45.2.1.

- TypeScript and production build: passed.
- Unit tests: 12 passed. Covers changed/duplicate/deleted anchors; overlapping DOM spans; cross-paragraph selections; persistence; image formats/size; traversal rejection; Markdown and ZIP export; idempotent image backup restore.
- Desktop tests: 8 passed, real Electron windows, isolated temporary SQLite profiles. Covers highlighter and bold overlap; textual and image-only notes; file picker image upload and simulated clipboard image paste; canceled asynchronous import; reload and file watch reanchoring; orphan display; search; KaTeX and Mermaid; dark theme; actual Chromium key events; empty drafts; scroll/bookmark race; empty and missing documents; full app restart persistence.
- A separate read-only review was completed; important findings and changes are recorded in REVIEW.md.
- Windows and Intel Mac: build configuration supplied, not tested on these platforms.
- Release: Apple Silicon macOS ZIP, no Developer ID signature or notarization.

Clipboard test dispatches an image ClipboardEvent to avoid replacing the user's real clipboard. Manual native screenshot-copy and Windows clipboard behavior remain platform acceptance checks.

Final packaged-app smoke test: passed. Launched `release/mac-arm64/Inkstone.app` independently with an isolated profile; verified preload bridge, SQLite initialization, welcome Markdown rendering, screenshot capture and clean quit. ZIP generated with macOS `ditto` after ad-hoc signing (no Developer ID or notarization).

## Version 0.1.1

- Full fresh run: 19 unit tests and 12 Electron desktop tests passed.
- Regression tests failed before fixes for element-boundary paragraph selection and IME-style unidentified keyboard events.
- Custom highlight/note bindings, note-input isolation, persistence after reload, reserved/duplicate detection and reset to defaults verified.
- Native desktop regression uses mouse selection and Electron sendInputEvent, separately from Playwright's Chromium keyboard injection.
- Additional macOS GUI check on an isolated test profile: mouse-dragged Chinese text, pressed Command+Shift+H through native computer control, observed a persisted highlighter card; pressed Command+Shift+M, observed the note editor focused. The user's original document/profile was not modified by this test.
- Final 0.1.1 packaged app smoke test passed. Existing extracted 0.1.0 app left in place because its GUI quit could not be confirmed; users should exit it before opening 0.1.1.

## 0.1.2 — 正文点击定位批注（2026-11-03）

在 macOS Apple Silicon 验证：19 项单元测试通过，14 项 Electron 桌面测试通过（原有 12 项、新增 2 项）。新增测试覆盖筛选、书签页、专注模式、只查看不编辑、编辑自动保存、重叠批注按 ID 选择、26 条批注的侧栏滚动和正文位置不变、删除后取消选中。测试使用临时文档和独立数据目录。Windows 未实测。

正文点击与编辑状态分离；批注 ID 不插入 CSS 选择器，支持备份恢复的任意 ID。拖动或非空选区不触发定位。原文件和数据库结构不变。

## 0.1.3 — 四色高亮（2026-11-03）

macOS Apple Silicon：25 项单元测试、16 项 Electron 桌面测试全部通过；类型检查、生产构建、macOS 打包通过。覆盖 H→J→J、局部换色／取消与选区保持、跨段落、表格、代码、重复文本、旧高亮重叠、未定位标记保留、无关标记 ID 保留、旧快捷键迁移冲突、输入隔离、原文件不变、批量写入回滚、导出颜色标识与重复备份恢复。Windows 未实测。应用仍使用临时签名，未正式公证。

## 0.1.4 — 隐藏右侧高亮记录（2026-11-03）

macOS Apple Silicon：25 项单元测试和 17 项桌面测试通过，构建、打包与打包应用启动验证通过。新增测试验证默认隐藏高亮卡片、开关显示、重载保存偏好、正文高亮保留及批注定位。初次新增测试因模拟选区未移出复选框焦点而超时，修正为先点击正文后通过。Windows 未实测。
