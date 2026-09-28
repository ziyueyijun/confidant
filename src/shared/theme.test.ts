import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME_CONFIG,
  getThemeColors,
  isEditorWidth,
  isThemeName,
  parseThemeConfig,
  serializeThemeConfig,
  type ThemeConfig
} from './theme'

describe('getThemeColors', () => {
  it('returns the light palette per acceptance criteria', () => {
    const colors = getThemeColors('light')
    expect(colors.bgPrimary).toBe('#ffffff')
    expect(colors.bgSecondary).toBe('#f5f5f5')
    expect(colors.textPrimary).toBe('#1a1a1a')
    expect(colors.textSecondary).toBe('#666666')
    expect(colors.accent).toBe('#0066cc')
  })

  it('returns the dark palette per acceptance criteria', () => {
    const colors = getThemeColors('dark')
    expect(colors.bgPrimary).toBe('#1e1e1e')
    expect(colors.bgSecondary).toBe('#252526')
    expect(colors.textPrimary).toBe('#d4d4d4')
    expect(colors.textSecondary).toBe('#858585')
    expect(colors.accent).toBe('#4a9eff')
  })
})

describe('isThemeName', () => {
  it('accepts known theme names', () => {
    expect(isThemeName('light')).toBe(true)
    expect(isThemeName('dark')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isThemeName('blue')).toBe(false)
    expect(isThemeName(42)).toBe(false)
    expect(isThemeName(undefined)).toBe(false)
    expect(isThemeName(null)).toBe(false)
  })
})

describe('isEditorWidth', () => {
  it('accepts the three documented widths', () => {
    expect(isEditorWidth('800px')).toBe(true)
    expect(isEditorWidth('1000px')).toBe(true)
    expect(isEditorWidth('100%')).toBe(true)
  })

  it('rejects arbitrary strings', () => {
    expect(isEditorWidth('900px')).toBe(false)
    expect(isEditorWidth('')).toBe(false)
  })
})

describe('serializeThemeConfig / parseThemeConfig', () => {
  it('round-trips a valid config', () => {
    const config: ThemeConfig = { theme: 'dark', editorWidth: '1000px' }
    const raw = serializeThemeConfig(config)
    expect(parseThemeConfig(raw)).toEqual(config)
  })

  it('falls back to defaults for malformed JSON', () => {
    expect(parseThemeConfig('{not valid')).toEqual(DEFAULT_THEME_CONFIG)
  })

  it('falls back field-by-field for partially invalid data', () => {
    const raw = JSON.stringify({ theme: 'purple', editorWidth: '1000px' })
    expect(parseThemeConfig(raw)).toEqual({ theme: 'light', editorWidth: '1000px' })
  })

  it('falls back to defaults when fields are missing entirely', () => {
    expect(parseThemeConfig('{}')).toEqual(DEFAULT_THEME_CONFIG)
  })
})
