/**
 * 全应用唯一的一套图标。
 *
 * ## 为什么收进一个文件
 *
 * 原来每处图标各自内联在组件里，于是长出了**两种尺寸配同一套描边**（工具栏
 * 12px、侧栏与底栏 14px，描边都是 1.3–1.5），还有几种互不相干的画法（引用
 * 是实心西文引号、列表符号是实心圆点、其余全是描边）。散着放，就没法保证
 * "一支笔"；收在一起，规矩才是结构上的，不只是约定。
 *
 * ## 一支笔的三条规矩
 *
 * 1. **一个网格**：`viewBox="0 0 16 16"`，作画区 1.5–14.5，四周留 1.5 白边。
 *    所有图标因此看起来一样大——因为它们真的画在同一个格子里。
 * 2. **一种线**：圆头、圆角、`fill="none"`。实心只允许用在"点"上
 *    （列表符号、图片里的太阳），半径不超过 1.2。
 * 3. **描边宽度按尺寸反算**。`stroke-width` 是 viewBox 单位，会跟着缩放：
 *    写死 1.5 的话，44px 的图标长出 4px 的粗边，12px 的只剩 1.1px 发灰。
 *    反算成 `1.5 × 16 / size` 之后，不管画多大，落在屏幕上都是同一种线。
 *
 * ## 一条产品自己的规矩
 *
 * **工具栏上的图标，画的是这个按钮产出的东西的样子**，不是随便挑一个通用
 * 符号：引用画的是正文里那条竖线加两行；行内代码画的是一对反引号夹住正文；
 * 源码画的是标记本身 `#`。以后加按钮照这条来。
 *
 * 例外只有一处，而且是有意的：**块级的东西在 16px 下画不出"块"的样子**
 * （代码块、图片、表格都是），那几个用通用符号。行内的标记本身就是个小符号，
 * 所以用字面的。
 */
import type { CSSProperties, ReactNode } from 'react'

/** 基准描边宽度（size = 16 时的值）。其余尺寸按比例反算。 */
const 基准描边 = 1.5
const 基准尺寸 = 16

function Icon({
  size = 基准尺寸,
  className,
  style,
  children,
}: {
  size?: number
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={(基准描边 * 基准尺寸) / size}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      /* 图标一律是装饰：它旁边的按钮/输入框已经带了 aria-label，
         让读屏再念一遍图形只会重复。 */
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

type P = { size?: number; className?: string; style?: CSSProperties }

// ---- 编辑与格式 ----

/** 搜索：放大镜。三条工具条与搜索面板共用同一支。 */
export const IconSearch = (p: P) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.3 10.3 13.5 13.5" />
  </Icon>
)

/** 引用：正文里那条竖线加两行——就是这个按钮产出的东西的样子。 */
export const IconQuote = (p: P) => (
  <Icon {...p}>
    <path d="M2.6 2.8v10.4" />
    <path d="M5.8 5.4h7.6" />
    <path d="M5.8 10.6h5.2" />
  </Icon>
)

/** 无序列表。 */
export const IconBulletList = (p: P) => (
  <Icon {...p}>
    <circle cx="3.2" cy="4.8" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="3.2" cy="11.2" r="1.15" fill="currentColor" stroke="none" />
    <path d="M6.6 4.8h7.2" />
    <path d="M6.6 11.2h7.2" />
  </Icon>
)

/** 有序列表：与无序列表共用骨架，只把左侧的圆点换成 1 和 2。 */
export const IconNumberList = (p: P) => (
  <Icon {...p}>
    <path d="M6.6 4.6h7.2" />
    <path d="M6.6 11.4h7.2" />
    <path d="M2.2 3.2 3.5 2.4v4.2" />
    <path d="M2.2 9.6h2.5l-2.5 3.2h2.5" />
  </Icon>
)

/** 待办项：勾选框加一行正文。 */
export const IconTaskList = (p: P) => (
  <Icon {...p}>
    <rect x="2" y="4.2" width="7.6" height="7.6" rx="2.2" />
    <path d="M4.1 8 5.7 9.6 8.3 6.6" />
    <path d="M11.8 8h2.4" />
  </Icon>
)

/** 代码块：通用符号。块级的东西在 16px 下画不出"块"的样子。 */
export const IconCodeBlock = (p: P) => (
  <Icon {...p}>
    <path d="M5.6 4 2.4 8l3.2 4" />
    <path d="M10.4 4 13.6 8l-3.2 4" />
    <path d="M9.2 2.8 6.8 13.2" />
  </Icon>
)

/** 行内代码：一对反引号夹住正文——就是这个标记的字面样子。 */
export const IconInlineCode = (p: P) => (
  <Icon {...p}>
    <path d="M3.6 6.4 5 4.6" />
    <path d="M11 6.4 12.4 4.6" />
    <path d="M5.6 8.6h4.8" />
  </Icon>
)

/** 图片：相框加远山。 */
export const IconImage = (p: P) => (
  <Icon {...p}>
    <rect x="2" y="3.2" width="12" height="9.6" rx="2.2" />
    <circle cx="5.4" cy="6.4" r="1.1" fill="currentColor" stroke="none" />
    <path d="M2.4 11.4 5.6 8.4 8 10.7 11 7.8 13.6 10.6" />
  </Icon>
)

/** 表格：表头线加一条分栏线——横线分栏，竖线交给留白。 */
export const IconTable = (p: P) => (
  <Icon {...p}>
    <rect x="2" y="3.2" width="12" height="9.6" rx="2.2" />
    <path d="M2 6.4h12" />
    <path d="M8 6.4v6.4" />
  </Icon>
)

/** 链接：两个环扣在一起。 */
export const IconLink = (p: P) => (
  <Icon {...p}>
    <path d="M7.34 8.67a3.33 3.33 0 0 0 5.03.36l2-2a3.33 3.33 0 0 0-4.71-4.71l-1.15 1.14" />
    <path d="M10 7.33a3.33 3.33 0 0 0-5.03-.36l-2 2a3.33 3.33 0 0 0 4.71 4.71l1.14-1.14" />
  </Icon>
)

/** 分割线：撑满整宽的一条横线。 */
export const IconRule = (p: P) => (
  <Icon {...p}>
    <path d="M1.8 8h12.4" />
  </Icon>
)

/**
 * 源码模式：`#`，就是 Markdown 的标记本身。
 *
 * 原来这个位置画的是 `<>`，和「代码块」那个在 12px 下几乎一样——两个按钮
 * 挨着放，用户分不出哪个是哪个。换成 `#` 之后，它和标题菜单里的 `#` 也呼应
 * 得上：都在说"标记"。
 */
export const IconSource = (p: P) => (
  <Icon {...p}>
    <path d="M6.2 2.6 4.4 13.4" />
    <path d="M11.6 2.6 9.8 13.4" />
    <path d="M2.6 5.8h11.2" />
    <path d="M2.2 10.2h11.2" />
  </Icon>
)

/**
 * 清除格式：划掉的 T。
 *
 * **不能再画 ✕**：界面上已经有三个 ✕（关标签、收侧栏、清除格式），一个符号
 * 三种意思。而且"清除格式"不是"关闭"——它是"把字上的格式划掉"。
 */
export const IconClearFormat = (p: P) => (
  <Icon {...p}>
    <path d="M3.6 4.6h7" />
    <path d="M7.1 4.6v7.8" />
    <path d="M2.8 12.6 13.2 3.4" />
  </Icon>
)

// ---- 导航 ----

/** 向右的箭头。文件树、大纲的展开，都用它转角度。 */
export const IconChevronRight = (p: P) => (
  <Icon {...p}>
    <path d="M6.4 3.6 10.6 8l-4.2 4.4" />
  </Icon>
)

/** 向左的箭头。左栏的收起按钮。 */
export const IconChevronLeft = (p: P) => (
  <Icon {...p}>
    <path d="M9.6 3.6 5.4 8l4.2 4.4" />
  </Icon>
)

/** 向下的箭头。标题菜单的收起标、查找的下一条。 */
export const IconChevronDown = (p: P) => (
  <Icon {...p}>
    <path d="M3.6 6.4 8 10.6l4.4-4.2" />
  </Icon>
)

/** 向上的箭头。查找的上一条。 */
export const IconChevronUp = (p: P) => (
  <Icon {...p}>
    <path d="M3.6 9.6 8 5.4l4.4 4.2" />
  </Icon>
)

/**
 * 全部展开：两个箭头朝外，撑满整个高度。
 *
 * 原来画成两个小箭头（各自只占中间一小段），16px 下挤成一个菱形，读不出
 * "展开"。撑满高度之后，朝外/朝内一眼能对上。
 */
export const IconExpandAll = (p: P) => (
  <Icon {...p}>
    <path d="M8 6.4V2.6" />
    <path d="M5.6 5 8 2.6 10.4 5" />
    <path d="M8 9.6v3.8" />
    <path d="M5.6 11 8 13.4 10.4 11" />
  </Icon>
)

/** 全部折叠：与「全部展开」互为反向。 */
export const IconCollapseAll = (p: P) => (
  <Icon {...p}>
    <path d="M8 2.6v3.8" />
    <path d="M5.6 4 8 6.4 10.4 4" />
    <path d="M8 13.4v-3.8" />
    <path d="M5.6 12 8 9.6 10.4 12" />
  </Icon>
)

/** 关闭：✕。全应用只有这一处该用它（关标签）。 */
export const IconClose = (p: P) => (
  <Icon {...p}>
    <path d="M4 4 12 12" />
    <path d="M12 4 4 12" />
  </Icon>
)

// ---- 文件与文件夹 ----

/** 文件：折角纸页。折角是它与文件夹唯一的区分点，占满右上角四分之一。 */
export const IconFile = (p: P) => (
  <Icon {...p}>
    <path d="M3.4 2.6h5.2l4 4v6.8h-9.2z" />
    <path d="M8.6 2.6v4h4" />
  </Icon>
)

/** 文件夹：顶部的凸起标签，外轮廓与纸页完全不同。 */
export const IconFolder = (p: P) => (
  <Icon {...p}>
    <path d="M2.4 12.8V3.6h3.9l1.7 2.2h5.6v7z" />
  </Icon>
)

// ---- 应用级 ----

/** 设置：八角螺母。16px 下画真齿轮会糊成一团，八角加中心孔足够认。 */
export const IconSettings = (p: P) => (
  <Icon {...p}>
    <path d="M8 1.83l4.34 1.83 1.83 4.34-1.83 4.34L8 14.17l-4.34-1.83L1.83 8l1.83-4.34z" />
    <circle cx="8" cy="8" r="2.4" />
  </Icon>
)

/** 同步中心：环形箭头。 */
export const IconSync = (p: P) => (
  <Icon {...p}>
    <path d="M2.6 8a5.4 5.4 0 0 1 9.2-3.8" />
    <path d="M13.4 8a5.4 5.4 0 0 1-9.2 3.8" />
    <path d="M11.8 1.6v2.6H9.2" />
    <path d="M4.2 14.4v-2.6h2.6" />
  </Icon>
)

/** 亮色模式（当前是深色，点了会变亮）。 */
export const IconSun = (p: P) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="3.1" />
    <path d="M8 1.4v1.6M8 13v1.6M1.4 8h1.6M13 8h1.6M3.3 3.3l1.15 1.15M11.55 11.55 12.7 12.7M12.7 3.3l-1.15 1.15M4.45 11.55 3.3 12.7" />
  </Icon>
)

/** 深色模式（当前是亮色，点了会变深）。 */
export const IconMoon = (p: P) => (
  <Icon {...p}>
    <path d="M13.4 9.4A5.6 5.6 0 0 1 6.6 2.6a5.6 5.6 0 1 0 6.8 6.8z" />
  </Icon>
)

/** 专注模式：四角取景框。 */
export const IconFocus = (p: P) => (
  <Icon {...p}>
    <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
  </Icon>
)
