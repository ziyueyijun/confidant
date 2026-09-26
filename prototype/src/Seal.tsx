/**
 * 朱砂印章——应用的标识。
 *
 * 「知己笔记」收起来时不该变成孤零零一个「知」字：**一个字本来就是一个印**。
 * 做成朱砂方块之后，它跟展开时那四个字是同一个标识的两种写法，而不是
 * "标题被截断了"。
 *
 * 三条规矩：
 *
 * 1. **不加任何一层**：不用渐变、不用描边、不用阴影。印泥就是一块平的色，
 *    加任何一层都会把它变成一个"按钮"。
 * 2. **方角**：印章是方的，只收一点点角（--radius-sm），不是圆角胶囊。
 * 3. **全应用只有一处**：收起后的文件树。整个界面是墨与纸，朱砂只在这一个
 *    点上出现，出现的时候才有分量。空状态原来也放过一枚，去掉了——同一枚印
 *    同时出现两次就把它冲淡了，而空状态那行字本身已经把事说清楚了。
 *
 * 大纲那一侧收起后**不盖印**，仍是字：印是应用的标识，而那一侧展开时写的
 * 是「大纲」，一个面板标签，不是标识。
 *
 * 底与字用独立的两个变量（--seal-bg / --seal-fg），不直接拿 --accent：
 * 深色下 --accent 是提亮过的那一档（#E0705C），白字压上去只有 3.2:1；
 * 印章要用更深的那档朱砂，白字才有 4.5:1。印泥上的字是刻掉的、露出纸色，
 * 所以永远是白字，不跟着主题反色。
 */
export function Seal({
  size = 24,
  char = '知',
  className,
}: {
  size?: number
  char?: string
  className?: string
}) {
  return (
    <span
      /* 纯装饰：它出现的地方（侧栏顶栏、空状态）旁边的文字已经说明了身份。 */
      aria-hidden="true"
      className={`flex shrink-0 select-none items-center justify-center ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        borderRadius: 'var(--radius-sm)',
        backgroundColor: 'var(--seal-bg)',
        color: 'var(--seal-fg)',
        fontSize: Math.round(size * 0.62),
        fontWeight: 600,
        lineHeight: 1,
        /* 汉字在方框里的视觉重心偏下，往上提一点点才真的居中。 */
        paddingBottom: Math.max(1, Math.round(size * 0.05)),
      }}
    >
      {char}
    </span>
  )
}
