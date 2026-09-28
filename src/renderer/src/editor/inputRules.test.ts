import { describe, expect, it } from 'vitest'
import { EditorState, EditorSelection, Transaction, type TransactionSpec } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { Table, TaskList } from '@lezer/markdown'
import { history, undo, redo, undoDepth, redoDepth } from '@codemirror/commands'
import { syntaxTree } from '@codemirror/language'
import { buildWysiwygDecorations } from './decorations'

/**
 * Ticket #16 (Input Rules).
 *
 * Architecture finding (see commit message / PR description for the
 * full writeup): this project's #14/#15 rendering pipeline is a
 * cursor-driven show/hide over the real Lezer syntax tree, not an AST
 * round-trip like ProseMirror/Tiptap "input rules" (which delete/replace
 * typed text with a different internal representation). Under that
 * architecture, "input rule" for most markdown syntax (headings, lists,
 * blockquotes, bold, italic, inline code, fenced code) doesn't mean
 * "detect a typed sequence and rewrite it" - the source text already
 * *is* the trigger, and #14/#15's tree walk already turns it into the
 * right visual style continuously as the tree reparses on every
 * keystroke. So most of this file is proving that claim with real
 * character-by-character typing simulations, rather than adding a new
 * text-replacement mechanism.
 *
 * The one real gap found during exploration: GFM task lists
 * (`- [ ] ` / `- [x] `) were not recognized as a distinct node at all
 * (the `[ ]`/`[x]` was misparsed as a `Link`-like span) because the
 * `TaskList` GFM extension wasn't enabled. That gap is fixed in
 * decorations.ts/init.ts (see taskCheckboxPlugin) and covered by
 * decorations.task.test.ts. This file covers acceptance criteria
 * #1-#4 (typing produces the right visual state) and #5-#7 (backspace/
 * undo/redo semantics around triggering).
 */

function typeChar(state: EditorState, ch: string, atTime: number): EditorState {
  return state.update({
    changes: { from: state.selection.main.head, insert: ch },
    selection: EditorSelection.cursor(state.selection.main.head + ch.length),
    annotations: Transaction.time.of(atTime)
  }).state
}

function typeString(state: EditorState, str: string, startTime: number, stepMs = 50): EditorState {
  let s = state
  let t = startTime
  for (const ch of str) {
    s = typeChar(s, ch, t)
    t += stepMs
  }
  return s
}

/**
 * `undo`/`redo` from @codemirror/commands take a `{ state, dispatch }`
 * pair shaped like `EditorView` (they don't need a real view - no DOM
 * is touched by the history commands themselves). This tiny stand-in
 * lets the tests drive undo/redo headlessly, consistent with how the
 * rest of this project's tests exercise `EditorState` without
 * constructing a live `EditorView` (see decorations.test.ts).
 */
function fakeView(initial: EditorState): { state: EditorState; dispatch(tr: TransactionSpec): void } {
  const v = {
    state: initial,
    dispatch(tr: TransactionSpec) {
      v.state = v.state.update(tr).state
    }
  }
  return v
}

function classesInDoc(state: EditorState): string[] {
  const decos = buildWysiwygDecorations(state)
  const classes: string[] = []
  decos.between(0, state.doc.length, (_f, _t, deco) => {
    const cls = (deco.spec as { class?: string }).class
    if (cls) classes.push(...cls.split(' '))
  })
  return classes
}

function makeState(): EditorState {
  return EditorState.create({
    doc: '',
    extensions: [markdown({ extensions: [Table, TaskList] }), history()]
  })
}

describe('acceptance criterion #1: leading "# ".."###### " trigger h1-h6', () => {
  it.each([
    ['# ', 'cf-h1'],
    ['## ', 'cf-h2'],
    ['### ', 'cf-h3'],
    ['#### ', 'cf-h4'],
    ['##### ', 'cf-h5'],
    ['###### ', 'cf-h6']
  ])('typing "%s" + text renders %s once the cursor leaves the line', (prefix, expectedClass) => {
    let state = makeState()
    // Type the heading line, then a second paragraph so the cursor can
    // move away from the heading (decorations are cursor-dependent for
    // marker visibility, but the heading line class itself is not).
    state = typeString(state, `${prefix}Title\n\nbody`, 0)
    const classes = classesInDoc(state)
    expect(classes).toContain(expectedClass)
  })

  it('does not treat "#word" (no space after #, e.g. a hashtag) as a heading', () => {
    // Per CommonMark, an ATX heading marker requires a space (or EOL)
    // after the #s - "#tag" is a plain paragraph, "# tag" is a heading.
    // This also covers the mid-typing state right after pressing "#"
    // followed by a letter, before any space has been typed.
    let state = makeState()
    state = typeString(state, '#word', 0)
    const tree = syntaxTree(state)
    let sawHeading = false
    tree.iterate({ enter: (n) => { if (n.name.startsWith('ATXHeading')) sawHeading = true } })
    expect(sawHeading).toBe(false)
  })
})

describe('acceptance criterion #2: list/quote/task markers trigger on typing', () => {
  it('typing "- " triggers a bullet list item', () => {
    let state = makeState()
    state = typeString(state, '- item\n\nbody', 0)
    const tree = syntaxTree(state)
    let sawBulletList = false
    tree.iterate({ enter: (n) => { if (n.name === 'BulletList') sawBulletList = true } })
    expect(sawBulletList).toBe(true)
  })

  it('typing "* " also triggers a bullet list item', () => {
    let state = makeState()
    state = typeString(state, '* item\n\nbody', 0)
    const tree = syntaxTree(state)
    let sawBulletList = false
    tree.iterate({ enter: (n) => { if (n.name === 'BulletList') sawBulletList = true } })
    expect(sawBulletList).toBe(true)
  })

  it('typing "1. " triggers an ordered list item', () => {
    let state = makeState()
    state = typeString(state, '1. item\n\nbody', 0)
    const tree = syntaxTree(state)
    let sawOrderedList = false
    tree.iterate({ enter: (n) => { if (n.name === 'OrderedList') sawOrderedList = true } })
    expect(sawOrderedList).toBe(true)
  })

  it('typing "> " triggers a blockquote', () => {
    let state = makeState()
    state = typeString(state, '> quoted\n\nbody', 0)
    expect(classesInDoc(state)).toContain('cf-blockquote')
  })

  it('typing "- [ ] " triggers an unchecked task item', () => {
    let state = makeState()
    state = typeString(state, '- [ ] todo\n\nbody', 0)
    const tree = syntaxTree(state)
    let sawTask = false
    tree.iterate({ enter: (n) => { if (n.name === 'Task') sawTask = true } })
    expect(sawTask).toBe(true)
    expect(classesInDoc(state)).toContain('cf-task')
    expect(classesInDoc(state)).not.toContain('cf-task-checked')
  })

  it('typing "- [x] " triggers a checked task item', () => {
    let state = makeState()
    state = typeString(state, '- [x] done\n\nbody', 0)
    expect(classesInDoc(state)).toContain('cf-task-checked')
  })
})

describe('acceptance criterion #3: fenced code block triggers on "```"', () => {
  it('typing the opening fence renders the code block line style immediately', () => {
    let state = makeState()
    state = typeString(state, '```', 0)
    const classes = classesInDoc(state)
    expect(classes).toContain('cf-code-block')
  })

  it('continues to render as a code block while typing content inside it', () => {
    let state = makeState()
    state = typeString(state, '```js\nconst x = 1', 0)
    expect(classesInDoc(state)).toContain('cf-code-block')
  })
})

describe('acceptance criterion #4: inline **bold**/*italic*/`code` trigger on completion', () => {
  it('does not style text as bold while only the opening "**" has been typed', () => {
    let state = makeState()
    state = typeString(state, 'this is **bold', 0)
    const tree = syntaxTree(state)
    let sawStrong = false
    tree.iterate({ enter: (n) => { if (n.name === 'StrongEmphasis') sawStrong = true } })
    expect(sawStrong).toBe(false)
  })

  it('renders bold once the closing "**" is typed and the cursor leaves', () => {
    let state = makeState()
    state = typeString(state, 'this is **bold**', 0)
    state = typeString(state, ' and more.\n\nfar paragraph', 1000)
    expect(classesInDoc(state)).toContain('cf-strong')
  })

  it('renders italic once the closing "*" is typed and the cursor leaves', () => {
    let state = makeState()
    state = typeString(state, 'this is *italic*', 0)
    state = typeString(state, ' and more.\n\nfar paragraph', 1000)
    expect(classesInDoc(state)).toContain('cf-em')
  })

  it('renders inline code once the closing backtick is typed and the cursor leaves', () => {
    let state = makeState()
    state = typeString(state, 'use `code`', 0)
    state = typeString(state, ' here.\n\nfar paragraph', 1000)
    expect(classesInDoc(state)).toContain('cf-code-inline')
  })
})

describe('acceptance criterion #5: immediate backspace after triggering undoes back to source text', () => {
  it('backspacing right after "# word" removes the space, reverting to the plain-text "#word"', () => {
    let state = makeState()
    state = typeString(state, '# word', 0)
    expect(state.doc.toString()).toBe('# word')
    const treeBefore = syntaxTree(state)
    let sawHeadingBefore = false
    treeBefore.iterate({ enter: (n) => { if (n.name.startsWith('ATXHeading')) sawHeadingBefore = true } })
    expect(sawHeadingBefore).toBe(true)

    // Backspace = CM6's own deleteCharBackward semantics: delete the one
    // character before the cursor (here, the space after "#"). There is
    // no special-cased "undo the trigger" transform to test separately
    // from this, because there is no trigger-time text rewrite in this
    // architecture to begin with - the source text the user typed IS the
    // document, so plain backspace naturally reverts the visual trigger.
    state = state.update({
      changes: { from: 1, to: 2 },
      selection: EditorSelection.cursor(1),
      annotations: Transaction.time.of(60)
    }).state
    expect(state.doc.toString()).toBe('#word')
    const tree = syntaxTree(state)
    let sawHeading = false
    tree.iterate({ enter: (n) => { if (n.name.startsWith('ATXHeading')) sawHeading = true } })
    expect(sawHeading).toBe(false)
  })

  it('backspacing right after closing "**bold**" removes one "*", leaving "**bold*" un-styled', () => {
    let state = makeState()
    state = typeString(state, 'this is **bold**', 0)
    expect(state.doc.toString()).toBe('this is **bold**')
    state = state.update({
      changes: { from: state.doc.length - 1, to: state.doc.length },
      selection: EditorSelection.cursor(state.doc.length - 1),
      annotations: Transaction.time.of(900)
    }).state
    expect(state.doc.toString()).toBe('this is **bold*')
    const tree = syntaxTree(state)
    let sawStrong = false
    tree.iterate({ enter: (n) => { if (n.name === 'StrongEmphasis') sawStrong = true } })
    expect(sawStrong).toBe(false)
  })
})

describe('acceptance criterion #6: undoing after typing more requires Ctrl+Z (plain history stack)', () => {
  it('one undo after "# Title" + more typing restores the pre-trigger text via the history stack, not a special-cased backspace', () => {
    let state = makeState()
    state = typeString(state, '# Title', 0) // one burst, all within 500ms of each other
    state = typeString(state, ' extra', 2000) // second burst, >500ms after the first
    expect(state.doc.toString()).toBe('# Title extra')

    const view = fakeView(state)
    undo(view)
    expect(view.state.doc.toString()).toBe('# Title')
    undo(view)
    expect(view.state.doc.toString()).toBe('')
  })
})

describe('acceptance criterion #7: undo/redo groups by 500ms typing pauses', () => {
  it('keystrokes within 500ms of each other collapse into a single undo unit', () => {
    let state = makeState()
    state = typeChar(state, 'a', 0)
    state = typeChar(state, 'b', 100)
    state = typeChar(state, 'c', 200)
    expect(state.doc.toString()).toBe('abc')
    expect(undoDepth(state)).toBe(1)
  })

  it('a pause of more than 500ms starts a new undo unit', () => {
    let state = makeState()
    state = typeChar(state, 'a', 0)
    state = typeChar(state, 'b', 100)
    state = typeChar(state, 'c', 900) // 700ms after 'b' > 500ms threshold
    expect(undoDepth(state)).toBe(2)

    const view = fakeView(state)
    undo(view)
    expect(view.state.doc.toString()).toBe('ab')
    undo(view)
    expect(view.state.doc.toString()).toBe('')
  })

  it('redo restores what was undone, respecting the same grouping', () => {
    let state = makeState()
    state = typeChar(state, 'a', 0)
    state = typeChar(state, 'b', 100)
    state = typeChar(state, 'c', 900)

    const view = fakeView(state)
    undo(view)
    undo(view)
    expect(view.state.doc.toString()).toBe('')
    expect(redoDepth(view.state)).toBe(2)

    redo(view)
    expect(view.state.doc.toString()).toBe('ab')
    redo(view)
    expect(view.state.doc.toString()).toBe('abc')
  })
})
