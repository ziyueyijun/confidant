# 04: 页脚状态条

**What to build:** 底部页脚（28–30px、border-top 1px、吃主题变量）；右侧常驻字数统计（口径 = 中文字符数 + 英文单词数，不含空白）与光标段落类型（标题 N/代码块/引用/列表等，实时跟随 selection）；点击字数弹出四口径明细浮层（字数/字符/段落/行数），选中口径持久化到设置；输入停顿 200–300ms 防抖刷新（渲染层 doc 遍历统计，不改引擎）。

**Blocked by:** 01 (can start after)

**Status:** ready-for-agent

- [ ] 页脚形态落地（28–30px、border-top、吃主题变量、不遮挡内容）
- [ ] 字数常驻右下角显示，口径 = 中文字符 + 英文单词（不含空白）；输入后 200–300ms 防抖刷新
- [ ] 光标段落类型实时跟随（标题 N/代码块/引用/列表等；正文为默认态）
- [ ] 点击字数弹出四口径明细浮层；选中的口径持久化（重启保持）
- [ ] 字数统计纯函数单测通过（中文按字、英文按词、空白剔除）
- [ ] 段落类型映射纯函数单测通过
- [ ] smoke：字数渲染断言
- [ ] 大文档（数千行）输入时统计不卡顿

## Answer

已实施并实机复验(smoke:字数 6 渲染断言、四口径浮层、口径切换持久化、标题段落类型全绿;doc-stats 单测 9 例)。

- 底部 28px 页脚:border-top 1px `--footer-border`;右常驻字数 + 光标段落类型、左「专注模式/打字机」按钮(hover 浮现,激活 `--footer-btn-active`;06 接线)。
- 字数口径 = 中文字符数 + 英文单词数,不含空白(`countWords`:CJK 每字 1 + 空白分隔的字母数字 token 每词 1,标点粘连不拆词);四口径明细浮层(字数/字符/段落/行数,`docStats`),选中口径持久化(state `wordCountMetric`,`normalizeMetric` 回落)。
- 段落类型实时跟随 selection(`blockTypeLabel`:标题 N/代码块/引用/列表/表格;正文为默认态不显示);统计 250ms 防抖(引擎 `textBetween` 纯文本源,不改引擎)。
- 模式按钮激活态 #1868AD 系(`--footer-btn-active`,github/night 同值,newsprint 用链接蓝)。
