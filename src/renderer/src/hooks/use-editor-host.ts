// 编辑器宿主(引擎域):createEngine 装载 + 事件面接线——IME 门控(02)、位图/文件粘贴落盘
// 与富文本净化(05/17)、拖入落盘、编辑区右键分流(图片 06/链接 16/表格与任务 09)、
// 链接 Ctrl+单击分流(16)。从 App.tsx 拆分(22);自身只持 engine 渲染态,会话状态经 refs。

import { useEffect, useState, type RefObject } from "react";
import { createEngine, type Engine } from "../../../../packages/engine";
import { landImageFile, looksLikeImageFile } from "../editor/image-insert";
import { isRemoteSrc, resolveImageAbsPath, resolveImageSourceUrl } from "../editor/image-source";
import { createPasteDispatcher } from "../editor/paste-dispatch";
import type { OpenNote } from "../session/types";
import type { createSavePipeline } from "../editor/save-pipeline";

export interface EditorHostApi {
  hostRef: RefObject<HTMLDivElement | null>;
  docRef: RefObject<OpenNote | null>;
  engineRef: RefObject<Engine | null>;
  pipelineRef: RefObject<ReturnType<typeof createSavePipeline> | null>;
  /** 引擎回调后刷新菜单点亮态(编辑/选区变化)。 */
  refreshMenu: () => void;
  /** Ctrl+单击链接 / 右键「打开链接」分流入口(16)。 */
  openLink: (docPath: string, href: string) => void;
  /** UI 节拍递增(浮动条/右键菜单重算;App 侧持 setUiTick)。 */
  bumpUi: () => void;
}

export function useEditorHost(api: EditorHostApi): { engine: Engine | null } {
  const { hostRef, docRef, engineRef, pipelineRef, refreshMenu, openLink, bumpUi } = api;
  const [engine, setEngine] = useState<Engine | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // 粘贴分派(05/17):经 editorProps.handlePaste 在 PM 默认插入之前运行(26 修双插)
    const onPaste = createPasteDispatcher({ docRef, engineRef });
    const engine = createEngine(
      host,
      {
        onUpdate: () => {
          if (docRef.current) pipelineRef.current?.notifyEdit();
          refreshMenu();
          bumpUi();
        },
        onSelectionChange: () => {
          refreshMenu();
          bumpUi();
        },
        onBlur: () => bumpUi(),
        onLinkClick: (info, modifiers) => {
          const doc = docRef.current;
          if (!doc) return;
          if (modifiers.ctrl) void openLink(doc.path, info.href);
        },
      },
      {
        // 图片显示:引用按当前文档目录解析(远程不渲染;网络图裁决出)
        resolveImageUrl: (raw) => {
          const doc = docRef.current;
          if (!doc) return "";
          return resolveImageSourceUrl(doc.path, raw) ?? "";
        },
        // 粘贴分派(26):PM 默认插入之前运行,返回 true 不再二次插入
        handlePaste: onPaste,
      },
    );
    engineRef.current = engine;
    setEngine(engine);

    // 拖入:图片文件(资源管理器)→ 复制落盘(沿用源扩展名)→ 按落点插入
    const onDrop = (e: DragEvent) => {
      const doc = docRef.current;
      const current = engineRef.current;
      if (!doc || !current) return;
      const files = [...(e.dataTransfer?.files ?? [])];
      const imageFile = files.find(looksLikeImageFile);
      if (!imageFile) return;
      e.preventDefault();
      const sourcePath = window.confidant.pathForFile(imageFile);
      if (!sourcePath) {
        console.error("[image] drop: cannot resolve file path");
        return;
      }
      void (async () => {
        try {
          const landed = await landImageFile({ notePath: doc.path, sourcePath });
          if (landed) current.insertImageAtCoords(e.clientX, e.clientY, landed.fileName, "");
        } catch (err) {
          console.error("[image] drop insert failed:", err);
        }
      })();
    };

    const start = () => pipelineRef.current?.setComposing(true);
    const end = () => pipelineRef.current?.setComposing(false);
    const allowDrop = (e: DragEvent) => e.preventDefault(); // 允许落点坐标

    // ── 图片/表格/任务 右键操作 ──
    const onContextMenu = async (e: MouseEvent): Promise<void> => {
      const doc = docRef.current;
      const current = engineRef.current;
      if (!doc || !current) return;
      const target = e.target as Element | null;
      if (!target) return;

      // 图片右键(06)
      const imgWrapper = target.closest(".confidant-image-node");
      if (imgWrapper) {
        e.preventDefault();
        const raw = imgWrapper.getAttribute("data-src-raw") ?? "";
        if (isRemoteSrc(raw)) {
          await window.confidant.infoDialog("这是一张网络图片(远程图不做下载与显示)。");
          return;
        }
        const abs = resolveImageAbsPath(doc.path, raw);
        if (!abs) {
          await window.confidant.infoDialog("图片引用无效。");
          return;
        }
        if (!(await window.confidant.pathExists(abs))) {
          // 引用悬空(文件已被外部删走):明确提示,不静默;可移除引用
          const choice = await window.confidant.showContextMenu([
            { id: "gone", label: "图片文件已不存在(可能已被外部删除)", enabled: false },
            { id: "remove-ref", label: "移除引用" },
          ]);
          if (choice === "remove-ref") current.removeImageNodeAtElement(imgWrapper);
          return;
        }
        const choice = await window.confidant.showContextMenu([
          { id: "open", label: "打开所在文件夹" },
          { id: "copy", label: "复制图片" },
          { id: "remove", label: "删除" },
        ]);
        if (choice === "open") {
          await window.confidant.showItemInFolder(abs);
        } else if (choice === "copy") {
          const r = await window.confidant.copyImageToClipboard(abs);
          if (!r.ok) {
            await window.confidant.infoDialog(`复制图片失败:${r.error.message}`);
          }
        } else if (choice === "remove") {
          const yes = await window.confidant.confirmDialog(
            "删除这张图片及其文件?将移入回收站",
          );
          if (!yes) return;
          const refRemoved = current.removeImageNodeAtElement(imgWrapper); // 引用移除 → 自动保存
          const tr = await window.confidant.trashItem(abs);
          if (!tr.ok) {
            await window.confidant.infoDialog(
              refRemoved
                ? `图片文件未能移入回收站:${tr.error.message}(引用已从文档移除)。`
                : `图片文件未能移入回收站:${tr.error.message}`,
            );
          }
        }
        return;
      }

      // 链接右键(16):打开链接(分流)/复制地址
      const anchorEl = target.closest("a[href]");
      if (anchorEl && docRef.current) {
        e.preventDefault();
        e.stopPropagation();
        const href = anchorEl.getAttribute("href") ?? "";
        const choice = await window.confidant.showContextMenu([
          { id: "open-link", label: "打开链接" },
          { id: "copy-link", label: "复制链接地址" },
        ]);
        if (choice === "open-link") void openLink(docRef.current.path, href);
        else if (choice === "copy-link") {
          try {
            await navigator.clipboard.writeText(href);
          } catch {
            await window.confidant.infoDialog("复制失败");
          }
        }
        return;
      }

      // 表格右键(09):光标定位到该格后执行行列/对齐操作
      const cell = target.closest("td, th");
      if (cell && docRef.current && engineRef.current) {
        e.preventDefault();
        await engineRef.current.anchorCursorAtCoords(e.clientX, e.clientY);
        const choice = await window.confidant.showContextMenu([
          { id: "row-before", label: "在上方插入行" },
          { id: "row-after", label: "在下方插入行" },
          { id: "col-before", label: "在左侧插入列" },
          { id: "col-after", label: "在右侧插入列" },
          { id: "sep1", type: "separator" },
          { id: "row-delete", label: "删除本行" },
          { id: "col-delete", label: "删除本列" },
          {
            id: "menu-align",
            type: "submenu",
            label: "对齐",
            submenu: [
              { id: "align-left", label: "左对齐" },
              { id: "align-center", label: "居中" },
              { id: "align-right", label: "右对齐" },
            ],
          },
        ]);
        const ops: Record<string, Parameters<typeof current.tableOp>[0]> = {
          "row-before": "rowBefore",
          "row-after": "rowAfter",
          "row-delete": "rowDelete",
          "col-before": "colBefore",
          "col-after": "colAfter",
          "col-delete": "colDelete",
          "align-left": "alignLeft",
          "align-center": "alignCenter",
          "align-right": "alignRight",
        };
        const op = choice ? ops[choice] : undefined;
        if (op) {
          current.tableOp(op);
          bumpUi();
        }
        return;
      }

      // 任务列表右键(09):勾选切换与缩进/反缩进
      const taskLi = target.closest("li[data-checked]");
      if (taskLi) {
        e.preventDefault();
        const choice = await window.confidant.showContextMenu([
          { id: "task-toggle", label: "切换完成状态" },
          { id: "sep2", type: "separator" },
          { id: "task-indent", label: "缩进" },
          { id: "task-outdent", label: "反缩进" },
        ]);
        if (choice === "task-toggle") current.toggleTaskCheckedAt(taskLi);
        else if (choice === "task-indent") current.listIndent(1);
        else if (choice === "task-outdent") current.listIndent(-1);
        return;
      }
    };

    host.addEventListener("drop", onDrop);
    host.addEventListener("dragover", allowDrop);
    const handleContextMenu = (e: MouseEvent): void => void onContextMenu(e);
    host.addEventListener("contextmenu", handleContextMenu);
    host.addEventListener("compositionstart", start);
    host.addEventListener("compositionend", end);
    host.addEventListener("compositioncancel", end);
    return () => {
      engine.destroy();
      engineRef.current = null;
      setEngine(null);
      host.removeEventListener("drop", onDrop);
      host.removeEventListener("dragover", allowDrop);
      host.removeEventListener("contextmenu", handleContextMenu);
      host.removeEventListener("compositionstart", start);
      host.removeEventListener("compositionend", end);
      host.removeEventListener("compositioncancel", end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { engine };
}
