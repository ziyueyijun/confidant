import { describe, expect, it } from 'vitest'
import {
  addRecentLibrary,
  DEFAULT_LIBRARY_CONFIG,
  MAX_RECENT_LIBRARIES,
  parseLibraryConfig,
  serializeLibraryConfig
} from './library'

describe('addRecentLibrary', () => {
  it('adds a new path to the front of an empty list', () => {
    expect(addRecentLibrary([], 'C:\\notes')).toEqual(['C:\\notes'])
  })

  it('moves an already-present path to the front instead of duplicating it', () => {
    const result = addRecentLibrary(['C:\\a', 'C:\\b', 'C:\\c'], 'C:\\b')
    expect(result).toEqual(['C:\\b', 'C:\\a', 'C:\\c'])
  })

  it('de-dupes case-insensitively (Windows paths)', () => {
    const result = addRecentLibrary(['C:\\Notes', 'C:\\Other'], 'c:\\notes')
    expect(result).toEqual(['c:\\notes', 'C:\\Other'])
  })

  it('de-dupes across slash direction differences', () => {
    const result = addRecentLibrary(['C:/notes/lib'], 'C:\\notes\\lib')
    expect(result).toEqual(['C:\\notes\\lib'])
  })

  it('de-dupes ignoring a trailing slash', () => {
    const result = addRecentLibrary(['C:\\notes\\'], 'C:\\notes')
    expect(result).toEqual(['C:\\notes'])
  })

  it('caps the list at MAX_RECENT_LIBRARIES, dropping the oldest', () => {
    const recents = ['C:\\1', 'C:\\2', 'C:\\3', 'C:\\4', 'C:\\5']
    expect(recents.length).toBe(MAX_RECENT_LIBRARIES)

    const result = addRecentLibrary(recents, 'C:\\6')
    expect(result.length).toBe(MAX_RECENT_LIBRARIES)
    expect(result).toEqual(['C:\\6', 'C:\\1', 'C:\\2', 'C:\\3', 'C:\\4'])
    expect(result).not.toContain('C:\\5')
  })

  it('does not mutate the input array', () => {
    const recents = ['C:\\a', 'C:\\b']
    const copy = [...recents]
    addRecentLibrary(recents, 'C:\\c')
    expect(recents).toEqual(copy)
  })
})

describe('serializeLibraryConfig / parseLibraryConfig', () => {
  it('round-trips a config', () => {
    const config = { recentLibraryPaths: ['C:\\a', 'C:\\b'] }
    const parsed = parseLibraryConfig(serializeLibraryConfig(config))
    expect(parsed).toEqual(config)
  })

  it('falls back to defaults on invalid JSON', () => {
    expect(parseLibraryConfig('not json{{{')).toEqual(DEFAULT_LIBRARY_CONFIG)
  })

  it('falls back to defaults when recentLibraryPaths is missing or malformed', () => {
    expect(parseLibraryConfig('{}')).toEqual(DEFAULT_LIBRARY_CONFIG)
    expect(parseLibraryConfig('{"recentLibraryPaths": "not an array"}')).toEqual(
      DEFAULT_LIBRARY_CONFIG
    )
    expect(parseLibraryConfig('{"recentLibraryPaths": [1, 2, 3]}')).toEqual(
      DEFAULT_LIBRARY_CONFIG
    )
  })

  it('truncates an oversized persisted list to MAX_RECENT_LIBRARIES on read', () => {
    const oversized = { recentLibraryPaths: ['1', '2', '3', '4', '5', '6', '7'] }
    const parsed = parseLibraryConfig(JSON.stringify(oversized))
    expect(parsed.recentLibraryPaths.length).toBe(MAX_RECENT_LIBRARIES)
    expect(parsed.recentLibraryPaths).toEqual(['1', '2', '3', '4', '5'])
  })

  it('produces human-readable pretty-printed JSON', () => {
    const raw = serializeLibraryConfig({ recentLibraryPaths: ['C:\\a'] })
    expect(raw).toContain('"recentLibraryPaths"')
    expect(raw).toContain('\n')
  })
})
