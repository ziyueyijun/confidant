import { describe, it, expect } from 'vitest'
import { parseMarkdownTable, renderTableHTML } from './tableWidget'

describe('tableWidget', () => {
  describe('parseMarkdownTable', () => {
    it('解析简单的两列表格', () => {
      const markdown = `| Name | Age |
| --- | --- |
| Alice | 30 |
| Bob | 25 |`

      const result = parseMarkdownTable(markdown)
      expect(result).toEqual([
        ['Name', 'Age'],
        ['Alice', '30'],
        ['Bob', '25']
      ])
    })

    it('处理单元格中的额外空格', () => {
      const markdown = `|  Name  |  Age  |
| --- | --- |
|  Alice  |  30  |`

      const result = parseMarkdownTable(markdown)
      expect(result).toEqual([
        ['Name', 'Age'],
        ['Alice', '30']
      ])
    })

    it('跳过对齐行（第二行）', () => {
      const markdown = `| Left | Center | Right |
| :--- | :---: | ---: |
| L | C | R |`

      const result = parseMarkdownTable(markdown)
      expect(result).toEqual([
        ['Left', 'Center', 'Right'],
        ['L', 'C', 'R']
      ])
    })

    it('处理空单元格', () => {
      const markdown = `| A | B |
| --- | --- |
|  |  |`

      const result = parseMarkdownTable(markdown)
      expect(result).toEqual([['A', 'B'], ['', '']])
    })

    it('处理单行表格（只有表头）', () => {
      const markdown = `| A | B |
| --- | --- |`

      const result = parseMarkdownTable(markdown)
      expect(result).toEqual([['A', 'B']])
    })
  })

  describe('renderTableHTML', () => {
    it('渲染简单表格为 HTML', () => {
      const rows = [
        ['Name', 'Age'],
        ['Alice', '30']
      ]

      const html = renderTableHTML(rows)
      expect(html).toContain('<table')
      expect(html).toContain('<thead>')
      expect(html).toContain('<th')
      expect(html).toContain('Name')
      expect(html).toContain('Age')
      expect(html).toContain('<tbody>')
      expect(html).toContain('<td')
      expect(html).toContain('Alice')
      expect(html).toContain('30')
    })

    it('转义 HTML 字符防止 XSS', () => {
      const rows = [
        ['Header'],
        ['<script>alert("xss")</script>']
      ]

      const html = renderTableHTML(rows)
      expect(html).not.toContain('<script>')
      expect(html).toContain('&lt;script&gt;')
    })

    it('处理空表格', () => {
      const html = renderTableHTML([])
      expect(html).toBe('<table></table>')
    })

    it('处理只有表头的表格', () => {
      const rows = [['A', 'B']]
      const html = renderTableHTML(rows)
      expect(html).toContain('<thead>')
      expect(html).toContain('A')
      expect(html).toContain('B')
      expect(html).toContain('<tbody>')
      expect(html).toContain('</tbody>')
    })

    it('应用正确的样式', () => {
      const rows = [
        ['H1', 'H2'],
        ['D1', 'D2']
      ]
      const html = renderTableHTML(rows)
      expect(html).toContain('border-collapse: collapse')
      expect(html).toContain('border: 1px solid #ddd')
      expect(html).toContain('padding: 8px')
    })
  })

  describe('集成：parseMarkdownTable + renderTableHTML', () => {
    it('完整流程：从 Markdown 到 HTML', () => {
      const markdown = `| Product | Price |
| --- | --- |
| Apple | $1.50 |
| Banana | $0.80 |`

      const table = parseMarkdownTable(markdown)
      const html = renderTableHTML(table)

      expect(html).toContain('Product')
      expect(html).toContain('Price')
      expect(html).toContain('Apple')
      expect(html).toContain('$1.50')
      expect(html).toContain('Banana')
      expect(html).toContain('$0.80')
    })
  })
})
