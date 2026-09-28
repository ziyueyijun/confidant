import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { libraryConfigPath, readLibraryConfig, writeLibraryConfig } from './libraryStore'
import { DEFAULT_LIBRARY_CONFIG } from '../shared/library'

describe('libraryStore', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'confidant-library-'))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('returns the default config when no file exists yet', async () => {
    const config = await readLibraryConfig(dir)
    expect(config).toEqual(DEFAULT_LIBRARY_CONFIG)
  })

  it('round-trips a written config', async () => {
    await writeLibraryConfig(dir, { recentLibraryPaths: ['C:\\notes', 'C:\\other'] })
    const config = await readLibraryConfig(dir)
    expect(config).toEqual({ recentLibraryPaths: ['C:\\notes', 'C:\\other'] })
  })

  it('falls back to defaults when the file is corrupted', async () => {
    await fs.writeFile(libraryConfigPath(dir), 'not json{{{', 'utf-8')
    const config = await readLibraryConfig(dir)
    expect(config).toEqual(DEFAULT_LIBRARY_CONFIG)
  })

  it('writes a human-readable JSON file at the expected path', async () => {
    await writeLibraryConfig(dir, { recentLibraryPaths: ['C:\\notes'] })
    const raw = await fs.readFile(libraryConfigPath(dir), 'utf-8')
    expect(raw).toContain('"recentLibraryPaths"')
    expect(raw).toContain('C:\\\\notes')
  })

  it('persists at library.json, separate from theme.json', () => {
    expect(libraryConfigPath(dir)).toBe(join(dir, 'library.json'))
  })
})
