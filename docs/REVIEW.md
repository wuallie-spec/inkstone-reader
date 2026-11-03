# Implementation and review record

- Completed: local reader, safe Markdown rendering, SQLite persistence, marks and rich notes, managed image assets, export/restore, file watching, desktop menus and build configuration.
- Independent read-only review identified stale progress writes overwriting bookmarks, asynchronous image imports crossing notes, ambiguous identical passages in unchanged documents, and destroyed macOS window access from file events.
- Fixes: dedicated progress IPC; editor identity and unmount cancellation; content fingerprint plus exact offsets for unchanged text; checked window event delivery and menu-triggered recreation.
- Additional integration checks identified Mermaid children arriving as an array and CDP/native accelerator dispatch differences. Fixed component child normalization and main-process keyboard routing.
- Decisions: file reads limited to 30 MiB; image files 20 MiB; directory depth 12; hidden folders and node_modules excluded. Limits keep synchronous local IO bounded. Image-only notes supported; draft imports canceled when editor closes. Managed unreferenced image assets retained to avoid destructive garbage collection during concurrent operations.
- Exit persistence: window close waits for the renderer's serialized save queue and final progress write before destruction; SQLite closes on will-quit. A full process-restart test verifies the latest note survives.
- Final verification: 12 unit tests, 8 desktop integration tests, TypeScript/build, and packaged application smoke test passed.

## 0.1.1 — annotation keyboard fix and customization

Reproduced before fixes: a paragraph Range with element endpoints returned no anchor; an IME-style `Unidentified` key with physical KeyH did not trigger highlighter. Added failing regression tests for both. Mouse selection plus native Electron key events now has a separate regression, beyond Chromium keyboard injection.

Annotation shortcuts now have one event owner in the renderer; native menu clicks are explicit commands, and native menu labels display the current bindings without registering competing keyboard accelerators. Key matching uses physical letter/number/function-key codes. Whole-node selections map to the indexed text correctly. No selection produces a visible hint. Held-key repeats do not repeatedly toggle a mark.

Added recording controls for highlight, bold and note under Settings → Shortcuts. Supports single letters and modifier combinations, duplicate/reserved binding validation, Escape to cancel, reset to defaults, persistent preferences and old-profile compatibility. Shortcut recording temporarily suspends native menu accelerators. Note input never triggers annotation shortcuts.
