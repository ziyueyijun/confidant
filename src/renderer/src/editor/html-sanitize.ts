// 粘贴 HTML 净化(17):白名单标签/属性,事件与脚本属性剥除,危险 scheme 拦截;
// 富文本样式级信息(字体/颜色)可降级;远程图片不引入(网络图裁决出,img 剥离)。

const REMOVE_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "svg",
  "video",
  "audio",
  "source",
  "frame",
]);

/** 危险 URL 协议(链接/图片来源)。 */
function isSafeUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.startsWith("http:") || v.startsWith("https:") || v.startsWith("mailto:")) return true;
  if (v.startsWith("/") || v.startsWith("#") || v.startsWith("./") || v.startsWith("../")) return true;
  if (/^[a-z]:[\\/]/.test(v) || v.startsWith("\\\\")) return true; // 本地路径(Windows)
  return false;
}

/**
 * 净化 HTML:逐元素剥除危险标签与属性;仅 a[href] 保留链接并校验协议,
 * 其余标签去掉全部属性(结构语义由 schema 重建,样式信息不在语义承诺内)。
 */
export function sanitizePasteHtml(rawHtml: string): string {
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  const root = doc.body;

  for (const el of [...root.querySelectorAll("*")]) {
    const tag = el.tagName.toLowerCase();
    if (REMOVE_TAGS.has(tag)) {
      // 脚本类内容整体移除(不留文本);其余如 form 保留子内容
      if (tag === "script" || tag === "style" || tag === "iframe" || tag === "object" || tag === "embed") {
        el.remove();
      } else {
        el.replaceWith(...el.childNodes);
      }
      continue;
    }
    if (tag === "img") {
      el.remove(); // 粘贴 HTML 内嵌图片:不落网络/不落盘,整体剥离(截图走 05 位图通道)
      continue;
    }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (tag === "a" && name === "href") {
        if (!isSafeUrl(attr.value)) el.removeAttribute("href");
        continue;
      }
      // 白名单外的属性一律剥除(表结构必需属性除外)
      const keep =
        (tag === "td" || tag === "th") && (name === "colspan" || name === "rowspan" || name === "align")
          ? true
          : tag === "a" && (name === "href" || name === "title")
            ? true
            : false;
      if (!keep) el.removeAttribute(attr.name);
    }
  }
  return root.innerHTML;
}
