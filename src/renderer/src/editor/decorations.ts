import { syntaxTree } from '@codemirror/language'
import {
  Decoration,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type EditorView,
  type ViewUpdate
} from '@codemirror/view'
import { RangeSetBuilder, type EditorState, type EditorSelection, type Extension } from '@codemirror/state'
import type { SyntaxNode } from '@lezer/common'

/**
 * Ticket #14 built read-only "always hidden" markers. Ticket #15 makes the
 * editor live: markers for the node(s) under the cursor/selection become
 * visible (Typora-style show-on-focus), and hide again once the
 * cursor/selection moves elsewhere. Everything else about the tree walk
 * (which Lezer node names map to which CSS classes) is unchanged from #14.
 *
 * We walk the Lezer markdown syntax tree that `@codemirror/lang-markdown`
 * already builds (official CommonMark+GFM node names: Heading, ListMark,
 * StrongEmphasis, InlineCode, Blockquote, FencedCode, Table, ...) instead
 * of re-parsing the document ourselves. This is the same approach used by
 * CodeMirror-based Live Preview implementations (Obsidian).
 *
 * NOT implemented here (deferred to later tickets):
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

/**
 * Node names whose *marker children* (HeaderMark/EmphasisMark/CodeMark/
 * QuoteMark/ListMark/LinkMark/URL) should only be visible while the
 * cursor/selection is inside this container. This is the "node the
 * cursor entered" per acceptance criterion #1: headings, bold, italic,
 * inline code, blockquotes, links, and list items.
 */
const MARK_CONTAINER_NODES = new Set([
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
  'StrongEmphasis',
  'Emphasis',
  'InlineCode',
  'Blockquote',
  'Link',
  'ListItem'
])

/** Node names whose own range *is* a syntax marker (hidden unless active). */
const MARKER_NODE_NAMES = new Set(['HeaderMark', 'EmphasisMark', 'CodeMark', 'QuoteMark', 'ListMark', 'LinkMark', 'URL'])

/**
 * Ticket #16 acceptance criterion #2 (task lists `- [ ] ` / `- [x] `).
 * `TaskMarker` (the `[ ]`/`[x]` itself, produced by `@lezer/markdown`'s
 * `TaskList` GFM extension - enabled in init.ts) is NOT put in
 * `MARKER_NODE_NAMES`: unlike `#`/`**`/`` ` ``, the checkbox glyph is
 * useful to see even when the cursor isn't there (that's the whole point
 * of a checkbox), so it's handled by its own always-on widget decoration
 * in `taskCheckboxDecorations` below instead of the hide-unless-active
 * marker mechanism used for the other syntaxes.
 */

/**
 * The Lezer markdown grammar (`@lezer/markdown`) parses *any* `[...]`
 * span as a `Link` node, even when it isn't followed by `(url)` - this
 * is how it also matches footnote references (`[^1]`), footnote
 * definitions (`[^1]: ...`), and (because `[[x]]` is just two nested
 * `[...]` pairs) WikiLinks (`[[Page Name]]`). None of those are in
 * scope per spec.md 5 (footnotes/WikiLinks are unknown syntax, must
 * stay byte-identical plain text - acceptance criterion #8), so we must
 * *not* apply link styling/marker-hiding to a `Link` node unless it's a
 * real `[text](url)` (has a `LinkMark('(')` + `URL` + `LinkMark(')')`
 * child sequence). This check is structural (child shape) rather than a
 * regex on `[^`/`[[` specifically, so it also naturally excludes any
 * other unrecognized `[...]`-shaped syntax without needing a per-syntax
 * allowlist.
 */
function isRealInlineLink(linkNode: SyntaxNode): boolean {
  let child = linkNode.firstChild
  while (child) {
    if (child.name === 'URL') return true
    child = child.nextSibling
  }
  return false
}

/**
 * Returns true if `range` (a node's [from, to)) overlaps or touches any
 * selection range. Touching at a boundary counts as "inside" so that a
 * cursor placed right after e.g. `**bold**` (i.e. at the closing `**`
 * position, `head === node.to`) still shows the markers - matching how
 * Typora/Obsidian treat a cursor adjacent to a marker as "inside" it.
 */
function overlapsSelection(from: number, to: number, selection: EditorSelection): boolean {
  for (const range of selection.ranges) {
    if (range.from <= to && range.to >= from) return true
  }
  return false
}

/**
 * Walks up from `node` to find the nearest ancestor (or itself) whose
 * name is in `MARK_CONTAINER_NODES`. Returns null if none is found
 * (e.g. a marker with no recognized container, which shouldn't normally
 * happen for the node set we handle).
 */
function findMarkContainer(node: SyntaxNode): SyntaxNode | null {
  let cur: SyntaxNode | null = node
  while (cur) {
    if (cur.name === 'Link') {
      // A `[...]` that isn't a real `[text](url)` link (footnote refs,
      // WikiLinks, etc - see `isRealInlineLink`) is unknown syntax and
      // must never be treated as a markable container: its brackets
      // stay plain, always-visible text (acceptance criterion #8).
      if (!isRealInlineLink(cur)) return null
      return cur
    }
    if (MARK_CONTAINER_NODES.has(cur.name)) return cur
    cur = cur.parent
  }
  return null
}

/**
 * Pure function computing which syntax-node ranges are "active" (cursor
 * or selection currently inside them) for a given document + selection.
 * Kept separate from `buildWysiwygDecorations` so it's unit-testable
 * without needing to construct decorations or a live EditorView.
 *
 * Returns the set of [from, to) container ranges (as `${from}:${to}`
 * strings) that are active. A container is active if any selection
 * range overlaps or touches it.
 */
export function computeActiveNodeRanges(
  state: EditorState,
  selection: EditorSelection = state.selection
): Set<string> {
  const active = new Set<string>()
  const tree = syntaxTree(state)

  tree.iterate({
    enter(nodeRef) {
      if (!MARK_CONTAINER_NODES.has(nodeRef.name)) return
      if (nodeRef.name === 'Link' && !isRealInlineLink(nodeRef.node)) return
      if (overlapsSelection(nodeRef.from, nodeRef.to, selection)) {
        active.add(`${nodeRef.from}:${nodeRef.to}`)
      }
    }
  })

  return active
}

export function buildWysiwygDecorations(
  state: EditorState,
  selection: EditorSelection = state.selection
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const tree = syntaxTree(state)
  const activeContainers = computeActiveNodeRanges(state, selection)
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

      if (MARKER_NODE_NAMES.has(node.name)) {
        const parent = node.node.parent
        // A LinkMark/URL whose immediate parent is a `Link` node that
        // isn't a real `[text](url)` link belongs to unknown syntax
        // (footnote ref/def, WikiLink, ...) - leave it as untouched
        // plain text: no hidden class, no visible-marker styling
        // (acceptance criterion #8).
        if (parent?.name === 'Link' && !isRealInlineLink(parent)) return

        const container = findMarkContainer(node.node)
        const isActive = container ? activeContainers.has(`${container.from}:${container.to}`) : false
        markDecosByPos.push({
          from: node.from,
          to: node.to,
          deco: Decoration.mark({ class: isActive ? 'cf-syntax-visible' : 'cf-syntax-hidden' })
        })
        return
      }

      switch (node.name) {
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

        case 'Task': {
          // Ticket #16 acceptance criterion #2: `- [ ] ` / `- [x] ` task
          // list items. The checked state is read straight from the
          // source text (`[x]` vs `[ ]`/`[X]`), not tracked separately,
          // so there is no risk of the visual state and the on-disk
          // bytes disagreeing.
          const checked = /\[[xX]\]/.test(state.doc.sliceString(node.from, node.to))
          const line = state.doc.lineAt(node.from)
          lineDecosByPos.push({
            pos: line.from,
            deco: Decoration.line({ class: checked ? 'cf-task cf-task-checked' : 'cf-task' })
          })
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

        case 'Link':
          // Link children: LinkMark('['), <link text>, LinkMark(']'),
          // LinkMark('('), URL, LinkMark(')'). Only the LinkMark/URL
          // children are hidden/shown below (via their own enter() calls,
          // handled by the MARKER_NODE_NAMES branch above); here we just
          // mark the whole node so the visible text gets a
          // clickable-looking style. Click behavior is out of scope (#14).
          //
          // Skip styling entirely for `[...]` spans that aren't real
          // `[text](url)` links - footnote refs (`[^1]`), footnote defs
          // (`[^1]: ...`), WikiLinks (`[[Page]]`), and any other
          // unrecognized `[...]`-shaped syntax must render as untouched
          // plain text (acceptance criterion #8), not link styling.
          if (isRealInlineLink(node.node)) {
            markDecosByPos.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cf-link' }) })
          }
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

/**
 * Ticket #16: renders a `- [ ] ` / `- [x] ` task marker as a clickable
 * checkbox instead of raw `[ ]`/`[x]` text. This is the one acceptance
 * criterion (#2, task list checkbox UI) that the spec explicitly calls
 * out as a pure view-layer concern, not a markdown-structure change -
 * see the ticket brief. Implemented as `Decoration.replace` (hides the
 * 3-character `TaskMarker` range, shows a `<input type="checkbox">` in
 * its place) rather than deleting/rewriting anything in the document.
 *
 * Clicking the checkbox dispatches a single minimal-diff transaction
 * that replaces only those same 3 characters (`[ ]` <-> `[x]`) - never
 * a wider rewrite - keeping the "on-disk bytes match what the user
 * typed" invariant intact (the click itself counts as the user's edit,
 * same as if they'd retyped the character by hand).
 */
export class TaskCheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }

  eq(other: TaskCheckboxWidget): boolean {
    return other.checked === this.checked
  }

  toDOM(): HTMLElement {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = this.checked
    box.className = 'cf-task-checkbox'
    return box
  }

  ignoreEvent(event: Event): boolean {
    // Only handle direct clicks on the checkbox itself; let CM6 handle
    // everything else (e.g. selection changes from other mouse events)
    // normally.
    return event.type !== 'mousedown' && event.type !== 'click'
  }
}

/**
 * Pure helper for the click handler: given the current `[ ]`/`[x]` (or
 * `[X]`) text of a TaskMarker, returns the 3-character replacement text
 * that flips its checked state. Kept separate from the event handler so
 * the toggle logic itself is unit-testable without a live EditorView/DOM.
 */
export function toggledTaskMarkerText(currentMarkerText: string): string {
  return /\[[xX]\]/.test(currentMarkerText) ? '[ ]' : '[x]'
}

export function taskCheckboxDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const tree = syntaxTree(state)
  const items: Array<{ from: number; to: number; checked: boolean }> = []

  tree.iterate({
    enter(node) {
      if (node.name !== 'TaskMarker') return
      const text = state.doc.sliceString(node.from, node.to)
      items.push({ from: node.from, to: node.to, checked: /\[[xX]\]/.test(text) })
    }
  })

  items.sort((a, b) => a.from - b.from)
  for (const item of items) {
    builder.add(
      item.from,
      item.to,
      Decoration.replace({ widget: new TaskCheckboxWidget(item.checked) })
    )
  }

  return builder.finish()
}

/**
 * The view plugin wrapper: rebuilds the checkbox decorations on doc
 * changes and wires the click handler that flips `[ ]` <-> `[x]` in the
 * document (see `TaskCheckboxWidget` doc comment above for why this is
 * safe under the minimal-diff invariant).
 */
export function taskCheckboxPlugin(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = taskCheckboxDecorations(view.state)
      }

      update(update: ViewUpdate): void {
        if (update.docChanged) {
          this.decorations = taskCheckboxDecorations(update.view.state)
        }
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        mousedown(event, view) {
          const target = event.target as HTMLElement | null
          if (!target || !target.classList.contains('cf-task-checkbox')) return false

          const pos = view.posAtDOM(target)
          const tree = syntaxTree(view.state)
          const node = tree.resolveInner(pos, 1)
          const marker = node.name === 'TaskMarker' ? node : null
          if (!marker) return false

          const text = view.state.doc.sliceString(marker.from, marker.to)
          view.dispatch({
            changes: { from: marker.from, to: marker.to, insert: toggledTaskMarkerText(text) }
          })
          event.preventDefault()
          return true
        }
      }
    }
  )
}

export type { EditorView }
