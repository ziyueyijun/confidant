// 粘贴净化测试(17):脚本/事件剥除、危险 scheme、白名单、img 剥离。

import { describe, expect, it } from "vitest";
import { sanitizePasteHtml } from "./html-sanitize";

describe("sanitizePasteHtml", () => {
  it("脚本/事件/危险标签剥除,不留执行面", () => {
    const out = sanitizePasteHtml(
      '<p onclick="x()">安全文字</p><script>alert(1)</script><img src="https://evil/x.png" onerror="y()">',
    );
    expect(out).not.toContain("script");
    expect(out).not.toContain("alert(1)");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("img");
    expect(out).toContain("安全文字");
  });

  it("链接:白名单协议保留,危险协议剥除;样式类属性剥除", () => {
    const out = sanitizePasteHtml(
      '<a href="https://ok.cn/a" style="color:red" target="_blank">好链</a><a href="javascript:alert(1)">坏链</a><a href="C:/本地/a.txt">本地</a>',
    );
    expect(out).toContain('href="https://ok.cn/a"');
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("style=");
    expect(out).toContain("本地");
  });

  it("结构语义保留(标题/列表/粗斜体/表格基础结构)", () => {
    const out = sanitizePasteHtml(
      "<h2>小节</h2><ul><li><b>粗</b>内容</li></ul><table><tr><td colspan=\"2\">格</td></tr></table>",
    );
    expect(out).toContain("<h2>小节</h2>");
    expect(out).toContain("<li><b>粗</b>内容</li>");
    expect(out).toContain('colspan="2"');
  });

  it("远程图片剥离(网络图裁决出),不引入 src", () => {
    const out = sanitizePasteHtml('<p>文<img src="https://a/b.png"></p>');
    expect(out).not.toContain("img");
    expect(out).toContain("文");
  });
});
