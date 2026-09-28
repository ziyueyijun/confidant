import { syntaxTree } from '@codemirror/language'
import { Decoration, type DecorationSet, type EditorView } from '@codemirror/view'
import { RangeSetBuilder, type EditorState } from '@codemirror/state'

/**
 * Ticket #14 scope: read-only WYSIWYG rendering only.
 *
 * We walk the Lezer markdown syntax tree that `@codemirror/lang-markdown`
 * already builds (official CommonMark+GFM node names: Heading, ListMark,
 * StrongEmphasis, InlineCode, Blockquote, FencedCode, Table, ...) instead
 * of re-parsing the document ourselves. This is the same approach used by
 * CodeMirror-based Live Preview implementations (Obsidian).
 *
 * NOT implemented here (deferred to ticket #15/#16):
 * - cursor-enter/leave marker show/hide (this doc is read-only, so
 *   "always hide the marker" is the correct behavior for now)
 * - editing, input rules, autosave, undo grouping
 * - table block-edit mode
 */

const HEADING_LINE_CLASS: Record<string, string> = {
  ATXHeading1: 'cf-h1',
  ATXHeading2: 'cf-h2',
  ATXHeading3: 'cf-h3',
  ATXHeading4: 'cf-h4',
  ATXHeading5: 'cf-h5',
  ATXHeading6: 'cf-h6'
}

export function buildWysiwygDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const tree = syntaxTree(state)
  const lineDecosByPos: Array<{ pos: number; deco: Decoration }> = []
  const markDecosByPos: Array<{ from: number; to: number; deco: Decoration }> = []

  tree.iterate({
    enter(node) {
      const headingClass = HEADING_LINE_CLASS[node.name]
      if (headingClass) {
        const line = state.doc.lineAt(node.from)
        lineDecosByPos.push({ pos: line.from, deco: Decoration.line({ class: headingClass }) })
        return
      }

      switch (node.name) {
        case 'HeaderMark':
        case 'EmphasisMark':
        case 'CodeMark':
        case 'QuoteMark':
          markDecosByPos.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: 'cf-syntax-hidden' })
          })
          break

        case 'StrongEmphasis':
          markDecosByPos.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cf-strong' }) })
          break

        case 'Emphasis':
          markDecosByPos.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cf-em' }) })
          break

        case 'InlineCode':
          markDecosByPos.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: 'cf-code-inline' })
          })
          break

        case 'Blockquote': {
          const startLine = state.doc.lineAt(node.from).number
          const endLine = state.doc.lineAt(node.to).number
          for (let ln = startLine; ln <= endLine; ln++) {
            const line = state.doc.line(ln)
            lineDecosByPos.push({ pos: line.from, deco: Decoration.line({ class: 'cf-blockquote' }) })
          }
          break
        }

        case 'FencedCode':
        case 'CodeBlock': {
          const startLine = state.doc.lineAt(node.from).number
          const endLine = state.doc.lineAt(node.to).number
          for (let ln = startLine; ln <= endLine; ln++) {
            const line = state.doc.line(ln)
            // #18: tag the first/last line separately so CSS can draw a
            // single 1px border around the whole block (top+sides on the
            // first line, bottom+sides on the last) instead of a border
            // on every line, while the detection logic (which lines
            // belong to the code block) is unchanged from #14.
            let cls = 'cf-code-block'
            if (ln === startLine) cls += ' cf-code-block-start'
            if (ln === endLine) cls += ' cf-code-block-end'
            lineDecosByPos.push({ pos: line.from, deco: Decoration.line({ class: cls }) })
          }
          break
        }

        case 'ListMark':
          markDecosByPos.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: 'cf-list-mark' })
          })
          break

        case 'Link':
          // Link children: LinkMark('['), <link text>, LinkMark(']'),
          // LinkMark('('), URL, LinkMark(')'). Only the LinkMark/URL
          // children are hidden below (via their own enter() calls); here
          // we just mark the whole node so the visible text gets a
          // clickable-looking style. Click behavior is out of scope (#14).
          markDecosByPos.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cf-link' }) })
          break

        case 'LinkMark':
        case 'URL':
          markDecosByPos.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: 'cf-syntax-hidden' })
          })
          break

        case 'Table': {
          // MVP scope (#14): read-only display distinct from raw source,
          // not a real <table> layout (block-edit mode is #25). Tag every
          // line of the table with one line class; header vs. body rows
          // are distinguished by TableHeader below.
          const startLine = state.doc.lineAt(node.from).number
          const endLine = state.doc.lineAt(node.to).number
          for (let ln = startLine; ln <= endLine; ln++) {
            const line = state.doc.line(ln)
            lineDecosByPos.push({ pos: line.from, deco: Decoration.line({ class: 'cf-table-row' }) })
          }
          break
        }

        case 'TableHeader': {
          const line = state.doc.lineAt(node.from)
          lineDecosByPos.push({ pos: line.from, deco: Decoration.line({ class: 'cf-table-header' }) })
          break
        }

        default:
          break
      }
    }
  })

  // RangeSetBuilder requires ranges sorted by (from, startSide). Line
  // decorations have the lowest startSide, so they always go first at a
  // given position. For mark decorations that share a `from` (e.g. a
  // StrongEmphasis node and its leading EmphasisMark child both start at
  // the same offset), the wider/outer range must be added *before* the
  // narrower/inner one, since CM6 nests marks by insertion order rather
  // than by range containment.
  const all = [
    ...lineDecosByPos.map((d) => ({ from: d.pos, to: d.pos, deco: d.deco, isLine: true })),
    ...markDecosByPos.map((d) => ({ from: d.from, to: d.to, deco: d.deco, isLine: false }))
  ].sort((a, b) => a.from - b.from || Number(b.isLine) - Number(a.isLine) || b.to - a.to)

  for (const item of all) {
    builder.add(item.from, item.to, item.deco)
  }

  return builder.finish()
}

export function frontmatterLineDecoration(fromLine: number, toLine: number, state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (let ln = fromLine; ln <= toLine; ln++) {
    if (ln < 1 || ln > state.doc.lines) continue
    const line = state.doc.line(ln)
    builder.add(line.from, line.from, Decoration.line({ class: 'cf-frontmatter' }))
  }
  return builder.finish()
}

export type { EditorView }
