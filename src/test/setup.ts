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

// Range 几何测量:jsdom 未实现。TipTap focus() 的 scrollIntoView → PM coordsAtPos
// 对文本位置取 Range.getClientRects,缺省会同步抛错(异步用例一 await 即引爆)。
// 零值兜底:scrollToSelection 只消费矩形数值,空/零矩形不会触发真实滚动。
// 运行时守卫用 untyped 引用:TS 的 lib.dom 认为 Range 已实现,jsdom 实际没有。
const rangeProto = Range.prototype as unknown as {
  getClientRects?: () => DOMRectList;
  getBoundingClientRect?: () => DOMRect;
};
if (typeof rangeProto.getClientRects !== "function") {
  rangeProto.getClientRects = () => [] as unknown as DOMRectList;
  rangeProto.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}
