// jsdom 补丁:ProseMirror/TipTap 在无真实布局环境下的运行缺口。
// requestAnimationFrame / cancelAnimationFrame
if (typeof globalThis.requestAnimationFrame !== "function") {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(Date.now()), 0) as unknown as number;
}
if (typeof globalThis.cancelAnimationFrame !== "function") {
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
}

// Element 上 ProseMirror 视图可能用到的测量 API
if (!("getClientRects" in Element.prototype)) {
  // jsdom 现代版本自带;此处仅占位防缺
}
