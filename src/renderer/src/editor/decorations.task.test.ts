import { describe, expect, it } from 'vitest'
import { EditorState, EditorSelection } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { Table, TaskList } from '@lezer/markdown'
import {
  buildWysiwygDecorations,
  taskCheckboxDecorations,
  toggledTaskMarkerText,
  TaskCheckboxWidget
} from './decorations'

/**
 * Ticket #16 acceptance criterion #2 (`- [ ] ` / `- [x] ` task lists).
 *
 * This is the one real gap the exploration found in #14/#15's rendering
 * pipeline: `@codemirror/lang-markdown`'s base grammar (only `Table` was
 * enabled) parses `[ ]`/`[x]` as a `Link`-shaped span, not a task
 * marker, so it never got the checkbox treatment. Enabling `@lezer/
 * markdown`'s `TaskList` GFM extension (in init.ts) fixes the parse;
 * `taskCheckboxDecorations` renders the resulting `TaskMarker` node as a
 * clickable checkbox widget instead of raw `[ ]`/`[x]` text - a
 * view-layer-only change (`Decoration.replace`), same class of change as
 * every other WYSIWYG style in decorations.ts, not a markdown-structure
 * rewrite.
 */
function makeState(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [Table, TaskList] })]
  })
}

describe('taskCheckboxDecorations', () => {
  it('replaces an unchecked "[ ]" marker with an unchecked checkbox widget', () => {
    const state = makeState('- [ ] todo\n')
    const decos = taskCheckboxDecorations(state)
    let found: TaskCheckboxWidget | null = null
    decos.between(0, state.doc.length, (_f, _t, deco) => {
      found = (deco.spec as { widget?: TaskCheckboxWidget }).widget ?? found
    })
    expect(found).not.toBeNull()
    expect(found!.checked).toBe(false)
  })

  it('replaces a checked "[x]" marker with a checked checkbox widget', () => {
    const state = makeState('- [x] done\n')
    const decos = taskCheckboxDecorations(state)
    let found: TaskCheckboxWidget | null = null
    decos.between(0, state.doc.length, (_f, _t, deco) => {
      found = (deco.spec as { widget?: TaskCheckboxWidget }).widget ?? found
    })
    expect(found!.checked).toBe(true)
  })

  it('also recognizes the uppercase "[X]" variant as checked (per acceptance criterion #2)', () => {
    const state = makeState('- [X] done\n')
    const decos = taskCheckboxDecorations(state)
    let found: TaskCheckboxWidget | null = null
    decos.between(0, state.doc.length, (_f, _t, deco) => {
      found = (deco.spec as { widget?: TaskCheckboxWidget }).widget ?? found
    })
    expect(found!.checked).toBe(true)
  })

  it('replaces the exact 3-character marker range only, leaving the label text untouched', () => {
    const doc = '- [ ] buy milk\n'
    const state = makeState(doc)
    const decos = taskCheckboxDecorations(state)
    const ranges: Array<[number, number]> = []
    decos.between(0, state.doc.length, (f, t) => {
      ranges.push([f, t])
    })
    expect(ranges).toHaveLength(1)
    const [from, to] = ranges[0]
    expect(doc.slice(from, to)).toBe('[ ]')
  })

  it('does not add a checkbox decoration for a plain bullet list item (no task marker)', () => {
    const state = makeState('- just a list item\n')
    const decos = taskCheckboxDecorations(state)
    let count = 0
    decos.between(0, state.doc.length, () => {
      count++
    })
    expect(count).toBe(0)
  })

  it('handles multiple task items independently', () => {
    const state = makeState('- [ ] first\n- [x] second\n- [ ] third\n')
    const decos = taskCheckboxDecorations(state)
    const found: boolean[] = []
    decos.between(0, state.doc.length, (_f, _t, deco) => {
      found.push((deco.spec as { widget: TaskCheckboxWidget }).widget.checked)
    })
    expect(found).toEqual([false, true, false])
  })
})

describe('buildWysiwygDecorations: task list line styling', () => {
  it('tags an unchecked task line with cf-task but not cf-task-checked', () => {
    const state = makeState('- [ ] todo\n')
    const decos = buildWysiwygDecorations(state, EditorSelection.single(state.doc.length))
    const classes: string[] = []
    decos.between(0, state.doc.length, (_f, _t, deco) => {
      const cls = (deco.spec as { class?: string }).class
      if (cls) classes.push(...cls.split(' '))
    })
    expect(classes).toContain('cf-task')
    expect(classes).not.toContain('cf-task-checked')
  })

  it('tags a checked task line with both cf-task and cf-task-checked', () => {
    const state = makeState('- [x] done\n')
    const decos = buildWysiwygDecorations(state, EditorSelection.single(state.doc.length))
    const classes: string[] = []
    decos.between(0, state.doc.length, (_f, _t, deco) => {
      const cls = (deco.spec as { class?: string }).class
      if (cls) classes.push(...cls.split(' '))
    })
    expect(classes).toContain('cf-task')
    expect(classes).toContain('cf-task-checked')
  })
})

describe('toggledTaskMarkerText (click-to-toggle pure logic)', () => {
  it('toggles "[ ]" to "[x]"', () => {
    expect(toggledTaskMarkerText('[ ]')).toBe('[x]')
  })

  it('toggles "[x]" to "[ ]"', () => {
    expect(toggledTaskMarkerText('[x]')).toBe('[ ]')
  })

  it('toggles the uppercase "[X]" variant to "[ ]" (normalizes to lowercase on toggle-off)', () => {
    expect(toggledTaskMarkerText('[X]')).toBe('[ ]')
  })

  it('is a 3-character replacement, matching the width of the TaskMarker node it replaces', () => {
    expect(toggledTaskMarkerText('[ ]')).toHaveLength(3)
    expect(toggledTaskMarkerText('[x]')).toHaveLength(3)
  })
})

describe('minimal-diff invariant: toggling a checkbox only changes those 3 bytes', () => {
  it('dispatching the toggle transaction leaves the rest of the document byte-identical', () => {
    const doc = 'intro\n\n- [ ] buy milk\n- [ ] walk dog\n\noutro\n'
    const state = makeState(doc)
    const markerFrom = doc.indexOf('[ ] buy')
    const markerTo = markerFrom + 3
    const nextText = toggledTaskMarkerText(doc.slice(markerFrom, markerTo))

    const tr = state.update({ changes: { from: markerFrom, to: markerTo, insert: nextText } })
    const newDoc = tr.state.doc.toString()

    expect(newDoc).toBe('intro\n\n- [x] buy milk\n- [ ] walk dog\n\noutro\n')
    // Everything before and after the marker is untouched.
    expect(newDoc.slice(0, markerFrom)).toBe(doc.slice(0, markerFrom))
    expect(newDoc.slice(markerFrom + 3)).toBe(doc.slice(markerTo))
  })
})
