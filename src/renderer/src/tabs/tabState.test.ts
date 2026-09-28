import { describe, expect, it } from 'vitest'
import { closeTab, EMPTY_TAB_STATE, focusTab, isTabOpen, openTab, renameTab, type TabState } from './tabState'

describe('openTab', () => {
  it('opens a brand-new tab and focuses it', () => {
    const { state, didOpen } = openTab(EMPTY_TAB_STATE, '/lib/a.md')
    expect(didOpen).toBe(true)
    expect(state).toEqual({ tabs: ['/lib/a.md'], activePath: '/lib/a.md' })
  })

  it('appends subsequent new tabs after existing ones and focuses the new one', () => {
    let state = openTab(EMPTY_TAB_STATE, '/lib/a.md').state
    const result = openTab(state, '/lib/b.md')
    state = result.state
    expect(result.didOpen).toBe(true)
    expect(state).toEqual({ tabs: ['/lib/a.md', '/lib/b.md'], activePath: '/lib/b.md' })
  })

  it('focuses an already-open tab instead of duplicating it (acceptance criterion #3)', () => {
    let state = openTab(EMPTY_TAB_STATE, '/lib/a.md').state
    state = openTab(state, '/lib/b.md').state
    state = openTab(state, '/lib/c.md').state // active is now c.md

    const result = openTab(state, '/lib/a.md')
    expect(result.didOpen).toBe(false)
    expect(result.state.tabs).toEqual(['/lib/a.md', '/lib/b.md', '/lib/c.md']) // order unchanged
    expect(result.state.activePath).toBe('/lib/a.md') // but now focused
  })

  it('does not mutate the input state', () => {
    const state: TabState = { tabs: ['/lib/a.md'], activePath: '/lib/a.md' }
    const snapshot = JSON.parse(JSON.stringify(state))
    openTab(state, '/lib/b.md')
    expect(state).toEqual(snapshot)
  })
})

describe('focusTab', () => {
  it('switches the active tab to an already-open path', () => {
    const state: TabState = { tabs: ['/a.md', '/b.md'], activePath: '/a.md' }
    expect(focusTab(state, '/b.md')).toEqual({ tabs: ['/a.md', '/b.md'], activePath: '/b.md' })
  })

  it('is a no-op if the path is not open', () => {
    const state: TabState = { tabs: ['/a.md'], activePath: '/a.md' }
    expect(focusTab(state, '/not-open.md')).toEqual(state)
  })
})

describe('closeTab', () => {
  it('removes a non-active tab without changing which tab is active', () => {
    const state: TabState = { tabs: ['/a.md', '/b.md', '/c.md'], activePath: '/a.md' }
    const result = closeTab(state, '/b.md')
    expect(result).toEqual({ tabs: ['/a.md', '/c.md'], activePath: '/a.md' })
  })

  it('closing the only open tab leaves no tabs and no active path', () => {
    const state: TabState = { tabs: ['/a.md'], activePath: '/a.md' }
    expect(closeTab(state, '/a.md')).toEqual({ tabs: [], activePath: null })
  })

  it('closing the active middle tab focuses its left neighbor', () => {
    const state: TabState = { tabs: ['/a.md', '/b.md', '/c.md'], activePath: '/b.md' }
    const result = closeTab(state, '/b.md')
    expect(result).toEqual({ tabs: ['/a.md', '/c.md'], activePath: '/a.md' })
  })

  it('closing the active leftmost tab focuses the new leftmost tab', () => {
    const state: TabState = { tabs: ['/a.md', '/b.md', '/c.md'], activePath: '/a.md' }
    const result = closeTab(state, '/a.md')
    expect(result).toEqual({ tabs: ['/b.md', '/c.md'], activePath: '/b.md' })
  })

  it('closing the active rightmost tab focuses the new rightmost tab', () => {
    const state: TabState = { tabs: ['/a.md', '/b.md', '/c.md'], activePath: '/c.md' }
    const result = closeTab(state, '/c.md')
    expect(result).toEqual({ tabs: ['/a.md', '/b.md'], activePath: '/b.md' })
  })

  it('is a no-op if the path is not open', () => {
    const state: TabState = { tabs: ['/a.md'], activePath: '/a.md' }
    expect(closeTab(state, '/not-open.md')).toEqual(state)
  })

  it('does not mutate the input state', () => {
    const state: TabState = { tabs: ['/a.md', '/b.md'], activePath: '/b.md' }
    const snapshot = JSON.parse(JSON.stringify(state))
    closeTab(state, '/a.md')
    expect(state).toEqual(snapshot)
  })
})

describe('renameTab', () => {
  it('renames an open tab in place, preserving its position', () => {
    const state: TabState = { tabs: ['/a.md', '/b.md', '/c.md'], activePath: '/a.md' }
    const result = renameTab(state, '/b.md', '/b-renamed.md')
    expect(result).toEqual({ tabs: ['/a.md', '/b-renamed.md', '/c.md'], activePath: '/a.md' })
  })

  it('updates activePath when the renamed tab was active', () => {
    const state: TabState = { tabs: ['/a.md', '/b.md'], activePath: '/b.md' }
    const result = renameTab(state, '/b.md', '/b-renamed.md')
    expect(result).toEqual({ tabs: ['/a.md', '/b-renamed.md'], activePath: '/b-renamed.md' })
  })

  it('is a no-op if oldPath is not open', () => {
    const state: TabState = { tabs: ['/a.md'], activePath: '/a.md' }
    expect(renameTab(state, '/not-open.md', '/new.md')).toEqual(state)
  })

  it('does not mutate the input state', () => {
    const state: TabState = { tabs: ['/a.md', '/b.md'], activePath: '/b.md' }
    const snapshot = JSON.parse(JSON.stringify(state))
    renameTab(state, '/b.md', '/renamed.md')
    expect(state).toEqual(snapshot)
  })
})

describe('isTabOpen', () => {
  it('reports open/closed correctly', () => {
    const state: TabState = { tabs: ['/a.md'], activePath: '/a.md' }
    expect(isTabOpen(state, '/a.md')).toBe(true)
    expect(isTabOpen(state, '/b.md')).toBe(false)
  })
})

describe('integration: open, switch, close sequence', () => {
  it('simulates a realistic session', () => {
    let state = EMPTY_TAB_STATE

    state = openTab(state, '/a.md').state
    state = openTab(state, '/b.md').state
    state = openTab(state, '/c.md').state
    expect(state.activePath).toBe('/c.md')

    state = focusTab(state, '/a.md')
    expect(state.activePath).toBe('/a.md')

    // Re-clicking an already-open file focuses it without reordering tabs.
    const reopen = openTab(state, '/b.md')
    expect(reopen.didOpen).toBe(false)
    state = reopen.state
    expect(state.tabs).toEqual(['/a.md', '/b.md', '/c.md'])
    expect(state.activePath).toBe('/b.md')

    state = closeTab(state, '/b.md')
    expect(state).toEqual({ tabs: ['/a.md', '/c.md'], activePath: '/a.md' })

    state = closeTab(state, '/a.md')
    state = closeTab(state, '/c.md')
    expect(state).toEqual(EMPTY_TAB_STATE)
  })
})
