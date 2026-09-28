import { describe, expect, it } from 'vitest'
import { recordFileOpened, EMPTY_RECENT_FILES_STATE, MAX_RECENT_FILES } from './recentFiles'

describe('recordFileOpened', () => {
  it('inserts a newly opened file at the front', () => {
    const state = recordFileOpened(EMPTY_RECENT_FILES_STATE, '/a.md')
    expect(state.paths).toEqual(['/a.md'])
  })

  it('keeps most-recently-opened first', () => {
    let state = EMPTY_RECENT_FILES_STATE
    state = recordFileOpened(state, '/a.md')
    state = recordFileOpened(state, '/b.md')
    expect(state.paths).toEqual(['/b.md', '/a.md'])
  })

  it('dedups: reopening a file bumps it to the front instead of duplicating', () => {
    let state = EMPTY_RECENT_FILES_STATE
    state = recordFileOpened(state, '/a.md')
    state = recordFileOpened(state, '/b.md')
    state = recordFileOpened(state, '/a.md')
    expect(state.paths).toEqual(['/a.md', '/b.md'])
  })

  it('caps the list at MAX_RECENT_FILES entries', () => {
    let state = EMPTY_RECENT_FILES_STATE
    for (let i = 0; i < MAX_RECENT_FILES + 5; i++) {
      state = recordFileOpened(state, `/file-${i}.md`)
    }
    expect(state.paths).toHaveLength(MAX_RECENT_FILES)
    // most recent (highest i) should be first
    expect(state.paths[0]).toBe(`/file-${MAX_RECENT_FILES + 4}.md`)
  })

  it('does not mutate the input state', () => {
    const state = EMPTY_RECENT_FILES_STATE
    const before = [...state.paths]
    recordFileOpened(state, '/a.md')
    expect(state.paths).toEqual(before)
  })
})
