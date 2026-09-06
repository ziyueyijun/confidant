// 粘贴分派测试(17/26):四分支行为 + handlePaste 单插语义。
// 26 回归:PM 默认粘贴与应用分派曾各插一次(双插);分派移入 editorProps.handlePaste
// 后在 PM 默认插入之前运行、返回 true 即不再二次插入。
// jsdom 无 ClipboardEvent/DataTransfer 全局:剪贴板以鸭子对象伪造(getData/items)。

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEngine, type Engine } from "../../../../packages/engine";
import type { OpenNote } from "../session/types";
import { createPasteDispatcher } from "./paste-dispatch";

function setup(initial = "") {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const docRef = { current: { path: "C:/ws/note.md", name: "note.md", head: "" } as OpenNote };
  const engineRef = { current: null as Engine | null };
  const engine = createEngine(host, {}, { handlePaste: createPasteDispatcher({ docRef, engineRef }) });
  engineRef.current = engine;
  engine.loadMarkdown(initial);
  engine.focus();
  return { host, engine };
}

/** 向可编辑区派发带剪贴板数据的 paste 事件(走 PM 的默认粘贴路径)。 */
function firePaste(host: HTMLDivElement, clipboardData: unknown): void {
  const editable = host.querySelector("[contenteditable='true']") as HTMLElement;
  const ev = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "clipboardData", { value: clipboardData });
  editable.dispatchEvent(ev);
}

const textClipboard = (plain: string) => ({
  getData: (t: string) => (t === "text/plain" ? plain : ""),
  items: [],
});

const fileClipboard = (file: File, html = "") => ({
  getData: (t: string) => (t === "text/html" ? html : ""),
  items: [{ kind: "file", type: file.type, getAsFile: () => file }],
});

describe("粘贴分派(26 双插回归)", () => {
  beforeEach(() => {
    delete (window as { confidant?: unknown }).confidant;
  });

  it("纯文本粘贴只插入一次", () => {
    const { host, engine } = setup("");
    firePaste(host, textClipboard("hello world"));
    expect(engine.getMarkdown()).toBe("hello world\n");
  });

  it("富文本粘贴经净化只插入一次", () => {
    const { host, engine } = setup("");
    firePaste(host, {
      getData: (t: string) => (t === "text/html" ? "<b>bold</b>" : ""),
      items: [],
    });
    expect(engine.getMarkdown()).toBe("**bold**\n");
  });

  it("无可用剪贴板内容:交回 PM 默认,文档不变", () => {
    const { host, engine } = setup("abc");
    firePaste(host, { getData: () => "", items: [] });
    expect(engine.getMarkdown()).toBe("abc\n");
  });
});

describe("粘贴分派四分支(17)", () => {
  it("位图与富文本并存:位图优先落盘,富文本不再插入(规格 9.2)", async () => {
    const saveClipboardImage = vi.fn(async () => ({ ok: true, value: { fileName: "note-1.png" } }));
    (window as { confidant?: unknown }).confidant = { saveClipboardImage };
    const { host, engine } = setup("");
    firePaste(host, fileClipboard(new File([new Uint8Array([1, 2, 3])], "clip.png", { type: "image/png" }), "<b>x</b>"));
    await vi.waitFor(() => {
      expect(engine.getMarkdown()).toContain("![](note-1.png)");
    });
    expect(engine.getMarkdown()).not.toContain("x");
    expect(saveClipboardImage).toHaveBeenCalledTimes(1);
  });

  it("资源管理器复制文件:非图片 → 链接文本单插", () => {
    (window as { confidant?: unknown }).confidant = {
      pathForFile: () => "C:/src/报告.docx",
      saveClipboardImage: vi.fn(),
      copyImageFromPath: vi.fn(),
    };
    const { host, engine } = setup("");
    firePaste(
      host,
      fileClipboard(
        new File([new Uint8Array(0)], "报告.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      ),
    );
    const md = engine.getMarkdown();
    expect(md).toContain("[报告.docx]");
    expect(md.match(/\[报告\.docx\]/g)?.length).toBe(1);
  });

  it("资源管理器复制图片文件:按扩展名落盘并插入相对引用", async () => {
    const copyImageFromPath = vi.fn(async () => ({ ok: true, value: { fileName: "note-2.png" } }));
    (window as { confidant?: unknown }).confidant = {
      pathForFile: () => "C:/src/photo.PNG",
      saveClipboardImage: vi.fn(),
      copyImageFromPath,
    };
    const { host, engine } = setup("");
    firePaste(host, fileClipboard(new File([new Uint8Array(0)], "photo.PNG", { type: "" })));
    await vi.waitFor(() => {
      expect(engine.getMarkdown()).toContain("![](note-2.png)");
    });
    expect(copyImageFromPath).toHaveBeenCalledTimes(1);
  });
});
