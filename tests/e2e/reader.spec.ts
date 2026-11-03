import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
let app: ElectronApplication, page: Page, dir: string, file: string;
const text =
  "# 技术阅读测试\n\n这是一段值得高亮的文字，也是重要的观点。\n\n## 数学与代码\n\n$$ E = mc^2 $$\n\n```ts\nconst answer = 42\n```\n\n| 项目 | 说明 |\n| --- | --- |\n| 数据 | 正常 |\n\n```mermaid\ngraph LR\n A[阅读] --> B[思考]\n```\n\n脚注测试[^1]。\n\n[^1]: 这是脚注。";
async function select(quote: string) {
  await page.locator(".markdown").evaluate((el, quote) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode as Text;
      const at = n.data.indexOf(quote);
      if (at >= 0) {
        const r = document.createRange();
        r.setStart(n, at);
        r.setEnd(n, at + quote.length);
        const s = window.getSelection()!;
        s.removeAllRanges();
        s.addRange(r);
        break;
      }
    }
  }, quote);
  await page.locator(".markdown").dispatchEvent("mouseup");
  await page.waitForTimeout(100);
}
async function command(label: string) {
  await app.evaluate(({ Menu }, label) => {
    const item = Menu.getApplicationMenu()!
      .items.flatMap((i) => i.submenu?.items || [])
      .find((i) => i.label.startsWith(label));
    item!.click();
  }, label);
}
test.beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "inkstone-e2e-"));
  file = path.join(dir, "技术笔记.md");
  writeFileSync(file, text);
  app = await electron.launch({
    args: ["."],
    env: {
      ...process.env,
      INKSTONE_DATA_DIR: path.join(dir, "profile"),
      INKSTONE_OPEN_FILE: file,
    },
  });
  page = await app.firstWindow();
  await expect(page.locator(".markdown h1")).toHaveText("技术阅读测试");
});
test.afterEach(async () => {
  await app?.close();
  rmSync(dir, { recursive: true, force: true });
});
test("mark, overlap, note attachment, persistence and reanchor", async () => {
  await select("值得高亮的文字");
  await command("高亮 / 取消高亮");
  await expect(page.locator('.ink-mark[data-color="yellow"]')).toHaveText(
    "值得高亮的文字",
  );
  await command("加粗 / 取消加粗");
  await expect(page.locator(".ink-bold")).toHaveText("值得高亮的文字");
  await command("新建批注");
  await expect(page.locator(".note-editor textarea")).toBeFocused();
  await page.locator(".note-editor textarea").fill("这是我的思考");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );
  await page
    .locator(".note-editor input[type=file]")
    .setInputFiles({ name: "截图.png", mimeType: "image/png", buffer: png });
  await expect(page.locator(".attachment-grid img")).toBeVisible();
  await page.getByTitle("关闭批注", { exact: true }).click();
  await expect(page.locator(".note-card")).toHaveCount(2);
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.locator(".ink-bold")).toHaveText("值得高亮的文字");
  await expect(page.locator(".note-thumbnails img")).toBeVisible();
  expect(readFileSync(file, "utf8")).toBe(text);
  writeFileSync(file, text.replace("这是一段", "新增段落。\n\n这是一段"));
  await expect(page.locator(".markdown")).toContainText("新增段落");
  await expect(page.locator(".ink-bold")).toHaveText("值得高亮的文字");
  writeFileSync(file, text.replace("值得高亮的文字", "已经删除的文字"));
  await expect(page.getByText("3 条待定位")).toBeVisible();
  await page.screenshot({ path: "docs/reader-screenshot.png", fullPage: true });
});
test("search, keyboard isolation, render and themes", async () => {
  await expect(page.locator(".katex")).toBeVisible();
  await expect(page.locator(".diagram svg")).toBeVisible();
  await command("文内搜索");
  await page.locator(".searchbar input").fill("重要");
  await expect(page.locator(".searchbar")).toContainText("1 / 1");
  await command("加粗 / 取消加粗");
  await expect(page.locator(".ink-bold")).toHaveCount(0);
  await page.getByTitle("关闭搜索").click();
  await page.getByTitle("阅读设置").click();
  await page.getByRole("button", { name: "夜读", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByTitle("关闭设置").click();
  await page.screenshot({ path: "docs/dark-screenshot.png", fullPage: true });
});
test("real accelerators toggle and empty drafts disappear", async () => {
  await select("重要的观点");
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+Shift+h" : "Control+Shift+h",
  );
  await expect(page.locator(".ink-mark[data-color=yellow]")).toHaveCount(1);
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+Shift+h" : "Control+Shift+h",
  );
  await expect(page.locator(".ink-mark[data-color=yellow]")).toHaveCount(0);
  await command("新建批注");
  await page.getByTitle("关闭批注", { exact: true }).click();
  await expect(page.locator(".note-card")).toHaveCount(0);
});
test("scroll save preserves a newly added bookmark", async () => {
  await page.locator(".reader-scroll").evaluate((el) => {
    el.scrollTop = 150;
    el.dispatchEvent(new Event("scroll"));
  });
  await page.getByTitle("添加书签", { exact: true }).click();
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByRole("button", { name: /书签 1/ }).click();
  await expect(page.locator(".bookmark-card")).toHaveCount(1);
});
test("empty and missing documents retain usable application state", async () => {
  writeFileSync(file, "");
  await expect(page.locator(".markdown")).toHaveText("");
  rmSync(file);
  await expect(page.getByText("原文件已移动或不可用")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "重新关联文件", exact: true }),
  ).toBeVisible();
});
test("canceling a pending image import never revives or modifies another note", async () => {
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return original.call(this);
    };
  });
  await select("值得高亮的文字");
  await command("新建批注");
  await page.locator(".note-editor input[type=file]").setInputFiles({
    name: "图片.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByTitle("关闭批注", { exact: true }).click();
  await select("重要的观点");
  await command("新建批注");
  await page.locator(".note-editor textarea").fill("第二条笔记");
  await page.waitForTimeout(1100);
  await expect(page.locator(".attachment-grid img")).toHaveCount(0);
  await page.getByTitle("关闭批注", { exact: true }).click();
  await page.reload();
  await expect(page.locator(".note-card")).toHaveCount(1);
  await expect(page.locator(".note-card")).toContainText("第二条笔记");
  await expect(page.locator(".note-thumbnails img")).toHaveCount(0);
});
test("pasting an image creates a durable image-only note", async () => {
  await select("重要的观点");
  await command("新建批注");
  await page.locator(".note-editor textarea").evaluate((el) => {
    const bytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      ),
      (c) => c.charCodeAt(0),
    );
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "截图.png", { type: "image/png" }));
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page.locator(".attachment-grid img")).toBeVisible();
  await page.getByTitle("关闭批注", { exact: true }).click();
  await page.reload();
  await expect(page.locator(".note-thumbnails img")).toBeVisible();
});
test("application quit flushes the latest note before a real restart", async () => {
  await select("重要的观点");
  await command("新建批注");
  await page.locator(".note-editor textarea").fill("退出前的最后一句");
  await app.close();
  app = await electron.launch({
    args: ["."],
    env: { ...process.env, INKSTONE_DATA_DIR: path.join(dir, "profile") },
  });
  page = await app.firstWindow();
  await expect(page.locator(".note-card")).toContainText("退出前的最后一句");
});
test("physical key code works when input method reports an unidentified key", async () => {
  await select("重要的观点");
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Unidentified",
        code: "KeyH",
        metaKey: navigator.platform.includes("Mac"),
        ctrlKey: !navigator.platform.includes("Mac"),
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect(page.locator(".ink-mark[data-color=yellow]")).toHaveCount(1);
});
test("custom highlight and note shortcuts persist and never mark inside the note editor", async () => {
  await page.getByTitle("阅读设置").click();
  await page.getByRole("button", { name: "快捷键", exact: true }).click();
  await page
    .getByRole("button", { name: "清除黄色高亮快捷键", exact: true })
    .click();
  await page
    .getByRole("button", { name: "修改高亮快捷键", exact: true })
    .click();
  await page.keyboard.press("h");
  await page
    .getByRole("button", { name: "修改批注快捷键", exact: true })
    .click();
  await page.keyboard.press("n");
  await page.getByTitle("关闭设置").click();
  await select("重要的观点");
  await page.keyboard.press("h");
  await expect(page.locator(".ink-mark[data-color=yellow]")).toHaveCount(1);
  await page.keyboard.press("n");
  await expect(page.locator(".note-editor textarea")).toBeFocused();
  await page.locator(".note-editor textarea").fill("想法");
  await page.keyboard.press("h");
  await expect(page.locator(".note-editor textarea")).toHaveValue("想法h");
  await page.getByTitle("关闭批注", { exact: true }).click();
  await page.reload();
  await select("值得高亮的文字");
  await page.keyboard.press("h");
  await expect(page.locator(".ink-mark[data-color=yellow]")).toHaveCount(2);
});
test("native desktop keys highlight and open a note after mouse selection", async () => {
  const paragraph = page.locator(".markdown p").first();
  const box = (await paragraph.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 180, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => getSelection()?.toString().length || 0))
    .toBeGreaterThan(0);
  async function native(key: string) {
    await app.evaluate(({ BrowserWindow }, key) => {
      const wc = BrowserWindow.getAllWindows()[0].webContents;
      const modifiers: ("meta" | "control" | "shift")[] = [
        process.platform === "darwin" ? "meta" : "control",
        "shift",
      ];
      wc.sendInputEvent({ type: "keyDown", keyCode: key, modifiers });
      wc.sendInputEvent({ type: "keyUp", keyCode: key, modifiers });
    }, key);
  }
  await native("H");
  await expect(page.locator(".ink-mark[data-color=yellow]")).toHaveCount(1);
  await native("M");
  await expect(page.locator(".note-editor textarea")).toBeFocused();
});
test("shortcut conflicts are shown and defaults can be restored", async () => {
  await page.getByTitle("阅读设置").click();
  await page.getByRole("button", { name: "快捷键", exact: true }).click();
  await page
    .getByRole("button", { name: "清除黄色高亮快捷键", exact: true })
    .click();
  await page
    .getByRole("button", { name: "修改高亮快捷键", exact: true })
    .click();
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+Shift+m" : "Control+Shift+m",
  );
  await expect(page.getByRole("alert")).toContainText("冲突");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "修改高亮快捷键", exact: true })
    .click();
  await page.keyboard.press("h");
  await expect(
    page.getByRole("button", { name: "修改高亮快捷键", exact: true }),
  ).toHaveText("H");
  await page
    .getByRole("button", { name: "恢复默认快捷键", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "修改高亮快捷键", exact: true }),
  ).toContainText("H");
  await expect(
    page.getByRole("button", { name: "修改高亮快捷键", exact: true }),
  ).not.toHaveText("H");
  await page.screenshot({ path: "docs/shortcut-settings.png" });
});

test("click annotation reveals card across filters and tabs without editing", async () => {
  await select("值得高亮的文字");
  await command("新建批注");
  await page.locator(".note-editor textarea").fill("定位到这条批注");
  await page.getByTitle("关闭批注", { exact: true }).click();
  await page.locator('.color-filter [data-color="blue"]').click();
  await page.locator(".right-sidebar .sidebar-tabs button").nth(1).click();
  await page.locator(".ink-note").click();
  await expect(page.locator(".selected-note")).toContainText("定位到这条批注");
  await expect(page.locator(".note-editor")).toHaveCount(0);
  await expect(page.locator(".color-filter button").first()).toHaveClass(
    "active",
  );
  await command("专注");
  await page.locator(".ink-note").click();
  await expect(page.locator(".right-sidebar")).toBeVisible();
  await expect(page.locator(".selected-note")).toBeVisible();
  await select("值得高亮的文字");
  await page.locator(".ink-note").dispatchEvent("click");
  await expect(page.locator(".note-editor")).toHaveCount(0);
  await page
    .locator(".selected-note")
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await page.locator(".note-editor textarea").fill("修改后自动保存");
  await page.locator(".ink-note").click();
  await expect(page.locator(".selected-note")).toContainText("修改后自动保存");
  await page.reload();
  await expect(page.locator(".note-card")).toContainText("修改后自动保存");
});

test("overlapping notes choose exact ID and scroll only sidebar to a distant card", async () => {
  await select("值得高亮的文字");
  await command("新建批注");
  await page.locator(".note-editor textarea").fill("第一条");
  await page.getByTitle("关闭批注", { exact: true }).click();
  await page.evaluate(async () => {
    const lib = await window.reader.library();
    const doc = await window.reader.read(lib.documents[0].id);
    const base = doc.marks[0];
    for (let i = 0; i < 25; i++) {
      await window.reader.saveMark({
        ...base,
        id: `overlap-${i}`,
        note: `重叠批注 ${i}`,
        createdAt: base.createdAt + i + 1,
      });
    }
  });
  await page.reload();
  await expect(page.locator(".note-card")).toHaveCount(26);
  const before = await page
    .locator(".markdown")
    .evaluate((el) => el.getBoundingClientRect().top);
  await page.locator(".ink-note").click();
  await expect(page.getByRole("dialog", { name: "选择批注" })).toBeVisible();
  await page.getByRole("button", { name: "重叠批注 24", exact: true }).click();
  await expect(page.locator(".selected-note")).toHaveAttribute(
    "data-note-id",
    "overlap-24",
  );
  await expect
    .poll(() => page.locator(".notes-scroll").evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.locator(".selected-note").evaluate((el) => {
        const r = el.getBoundingClientRect(),
          p = el.parentElement!.getBoundingClientRect();
        return r.top >= p.top && r.top < p.bottom;
      }),
    )
    .toBe(true);
  expect(
    await page
      .locator(".markdown")
      .evaluate((el) => el.getBoundingClientRect().top),
  ).toBe(before);
  await page.locator(".selected-note").getByTitle("删除标记").click();
  await expect(page.locator(".selected-note")).toHaveCount(0);
});

test("color keys replace, split and cancel highlights while preserving selection", async () => {
  await select("值得高亮的文字");
  await page.keyboard.press("h");
  await expect(page.locator(".ink-mark[data-color=yellow]")).toHaveText(
    "值得高亮的文字",
  );
  await page.keyboard.press("j");
  await expect(page.locator(".ink-mark[data-color=green]")).toHaveText(
    "值得高亮的文字",
  );
  await page.keyboard.press("j");
  await expect(page.locator(".ink-mark")).toHaveCount(0);
  await page.keyboard.press("h");
  await select("高亮");
  await page.keyboard.press("k");
  await expect(page.locator(".ink-mark[data-color=blue]")).toHaveText("高亮");
  await expect(page.locator(".ink-mark[data-color=yellow]")).toHaveText([
    "值得",
    "的文字",
  ]);
  await page.keyboard.press("k");
  await expect(page.locator(".ink-mark[data-color=blue]")).toHaveCount(0);
  await expect(page.locator(".ink-mark[data-color=yellow]")).toHaveText([
    "值得",
    "的文字",
  ]);
  await page.keyboard.press("l");
  await expect(page.locator(".ink-mark[data-color=pink]")).toHaveText("高亮");
  await page.reload();
  await expect(page.locator(".ink-mark[data-color=pink]")).toHaveText("高亮");
  await expect(page.locator(".ink-mark[data-color=yellow]")).toHaveText([
    "值得",
    "的文字",
  ]);
  expect(readFileSync(file, "utf8")).toBe(text);
});

test("color keys work across paragraphs, table cells and code", async () => {
  await page.locator(".markdown").evaluate((el) => {
    const p = el.querySelector("p")!,
      h = el.querySelector("h2")!;
    const r = document.createRange();
    r.setStart(p, 0);
    r.setEnd(h, h.childNodes.length);
    const s = window.getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
  });
  await page.keyboard.press("j");
  await expect(
    page.locator(".markdown p .ink-mark[data-color=green]").first(),
  ).toBeVisible();
  await expect(
    page.locator(".markdown h2 .ink-mark[data-color=green]"),
  ).toHaveText("数学与代码");
  await select("正常");
  await page.keyboard.press("k");
  await expect(page.locator("td .ink-mark[data-color=blue]")).toHaveText(
    "正常",
  );
  await select("answer");
  await page.keyboard.press("l");
  await expect(page.locator("code .ink-mark[data-color=pink]")).toHaveText(
    "answer",
  );
});

test("highlight records are hidden by default and visibility preference persists", async () => {
  await select("值得高亮的文字");
  await page.keyboard.press("h");
  await expect(page.locator(".ink-mark[data-color=yellow]")).toBeVisible();
  await expect(page.locator(".note-card")).toHaveCount(0);
  await page.getByLabel("显示高亮记录").check();
  await expect(page.locator(".note-card")).toHaveCount(1);
  await page.reload();
  await expect(page.getByLabel("显示高亮记录")).toBeChecked();
  await expect(page.locator(".note-card")).toHaveCount(1);
  await page.getByLabel("显示高亮记录").uncheck();
  await page.locator(".markdown p").first().click();
  await select("重要的观点");
  await command("新建批注");
  await page.locator(".note-editor textarea").fill("只看批注");
  await page.getByTitle("关闭批注", { exact: true }).click();
  await page.locator(".ink-note").click();
  await expect(page.locator(".selected-note")).toContainText("只看批注");
  await page.reload();
  await expect(page.getByLabel("显示高亮记录")).not.toBeChecked();
  await expect(page.locator(".note-card")).toHaveCount(1);
  await expect(page.locator(".ink-mark[data-color=yellow]")).toBeVisible();
});
