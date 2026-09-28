// PROTOTYPE 渲染进程
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { defaultKeymap } from '@codemirror/commands'

let view
let originalContent = ''

// 初始化编辑器
function initEditor(initialDoc = '') {
  const container = document.getElementById('editor-container')
  container.innerHTML = ''

  const startState = EditorState.create({
    doc: initialDoc,
    extensions: [
      keymap.of(defaultKeymap),
      markdown(),
      EditorView.lineWrapping,
      EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': { overflow: 'auto' },
        '.cm-content': { minHeight: '100%' }
      })
    ]
  })

  view = new EditorView({
    state: startState,
    parent: container
  })

  originalContent = initialDoc
  log('编辑器初始化完成')
}

// 日志输出
function log(msg) {
  const status = document.getElementById('status')
  const timestamp = new Date().toLocaleTimeString()
  status.innerHTML += `<div>[${timestamp}] ${msg}</div>`
  status.scrollTop = status.scrollHeight
}

// 生成测试文档
function generateIMETestDoc() {
  return `# IME 测试文档

请用**微软拼音**和**搜狗拼音**分别测试以下场景：

## 1. 标题中输入中文
在这里输入中文看看会不会吞字：

## 2. 列表中快速输入
- 第一项，快速输入中文看看
- 第二项，中英混排 test 测试
- 第三项

## 3. 粗体和斜体中输入
这是**粗体中文**，这是*斜体中文*。

## 4. 表格中输入（整块编辑模式）
| 列1 | 列2 | 列3 |
|-----|-----|-----|
| 在这里输入中文 | 测试 | 看看 |
| 第二行 | 数据 | 内容 |

## 5. 代码块中输入
\`\`\`
在代码块中输入中文
应该保持纯文本编辑
\`\`\`

## 压测清单
- [ ] 长段中文连续输入
- [ ] 中英混排
- [ ] 输入过程中滚动
- [ ] 在已渲染节点边界处输入
- [ ] 快速连续输入不卡顿
- [ ] 撤销重做恢复中文而非拼音字母
`
}

function generateTableTestDoc() {
  return `# 表格编辑测试

## 简单表格
| 姓名 | 年龄 | 城市 |
|------|------|------|
| 张三 | 25 | 北京 |
| 李四 | 30 | 上海 |

点击表格进入源码编辑模式（当前是整块替换方案）

## 复杂表格
| 功能 | CM6 | ProseMirror | 说明 |
|------|-----|-------------|------|
| 往返保真 | ✅ | ❌ | CM6 架构级保证 |
| 编辑流畅 | ⚠️ | ✅ | CM6 有光标问题 |
| 表格编辑 | ❌ | ✅ | CM6 行模型限制 |

## 压测清单
- [ ] 点击表格能否进入编辑
- [ ] 失焦后能否正确渲染
- [ ] Tab 键能否跳单元格（当前不支持，需要手动编辑）
- [ ] 增删行列体验如何
`
}

function generateLongDoc(wordCount) {
  const paragraphs = []
  const sampleText = '这是一段测试文本。'.repeat(10)

  for (let i = 0; i < wordCount / 100; i++) {
    if (i % 50 === 0) {
      paragraphs.push(`\n# 第 ${Math.floor(i / 50) + 1} 章\n`)
    }
    if (i % 10 === 0) {
      paragraphs.push(`\n## 第 ${Math.floor(i / 10) + 1} 节\n`)
    }
    paragraphs.push(sampleText + '\n')
  }

  return paragraphs.join('\n')
}

function computeDiff(oldText, newText) {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const diff = []

  const maxLen = Math.max(oldLines.length, newLines.length)
  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i] || ''
    const newLine = newLines[i] || ''

    if (oldLine !== newLine) {
      if (!oldLines[i]) {
        diff.push(`+ 行${i + 1}: ${newLine}`)
      } else if (!newLines[i]) {
        diff.push(`- 行${i + 1}: ${oldLine}`)
      } else {
        diff.push(`~ 行${i + 1}: ${oldLine} → ${newLine}`)
      }
    }
  }

  return diff.length > 0 ? diff : ['无变更']
}

// 事件监听
document.getElementById('load-ime-test').addEventListener('click', () => {
  const doc = generateIMETestDoc()
  initEditor(doc)
  log('已加载 IME 测试文档，请切换输入法开始测试')
})

document.getElementById('load-table-test').addEventListener('click', () => {
  const doc = generateTableTestDoc()
  initEditor(doc)
  log('已加载表格测试文档')
})

document.getElementById('load-10k').addEventListener('click', () => {
  const start = performance.now()
  const doc = generateLongDoc(10000)
  initEditor(doc)
  const elapsed = (performance.now() - start).toFixed(2)
  log(`已加载 1 万字文档，耗时 ${elapsed}ms，字符数：${doc.length}`)
})

document.getElementById('load-100k').addEventListener('click', () => {
  const start = performance.now()
  const doc = generateLongDoc(100000)
  initEditor(doc)
  const elapsed = (performance.now() - start).toFixed(2)
  log(`已加载 10 万字文档（极端测试），耗时 ${elapsed}ms，字符数：${doc.length}`)
  log('⚠️ 请观察滚动和输入是否卡顿，以及后半段 decoration 是否失效')
})

document.getElementById('save-and-diff').addEventListener('click', () => {
  if (!view) {
    log('❌ 编辑器未初始化')
    return
  }

  const currentContent = view.state.doc.toString()
  const diff = computeDiff(originalContent, currentContent)

  log('===== Diff 结果 =====')
  diff.slice(0, 20).forEach(line => log(line))
  if (diff.length > 20) {
    log(`... 还有 ${diff.length - 20} 行变更`)
  }
  log(`总变更行数：${diff.length}`)
  log('✅ 验证「最小 diff」：只有你编辑的行应该出现在 diff 中')
})

document.getElementById('clear').addEventListener('click', () => {
  initEditor('')
  log('已清空编辑器')
})

// 初始化
initEditor('# 欢迎使用 CM6 可行性压测原型\n\n请点击左侧按钮开始测试。')
log('原型已启动，CodeMirror 版本：6.x')
log('⚠️ 这是 throwaway 代码，仅用于验证可行性')
