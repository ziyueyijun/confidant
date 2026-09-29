import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readThemeConfig, themeConfigPath, writeThemeConfig } from './themeStore'
import { DEFAULT_THEME_CONFIG } from '../shared/theme'

describe('themeStore', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'confidant-theme-'))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('returns the default config when no file exists yet', async () => {
    const config = await readThemeConfig(dir)
    expect(config).toEqual(DEFAULT_THEME_CONFIG)
  })

  it('round-trips a written config', async () => {
    await writeThemeConfig(dir, { theme: 'dark', editorWidth: '1000px' })
    const config = await readThemeConfig(dir)
    expect(config).toEqual({ theme: 'dark', editorWidth: '1000px' })
  })

  it('falls back to defaults when the file is corrupted', async () => {
    await fs.writeFile(themeConfigPath(dir), 'not json{{{', 'utf-8')
    const config = await readThemeConfig(dir)
    expect(config).toEqual(DEFAULT_THEME_CONFIG)
  })

  it('writes a human-readable JSON file at the expected path', async () => {
    await writeThemeConfig(dir, { theme: 'light', editorWidth: '100%' })
    const raw = await fs.readFile(themeConfigPath(dir), 'utf-8')
    expect(raw).toContain('"theme": "light"')
    expect(raw).toContain('"editorWidth": "100%"')
  })
})
