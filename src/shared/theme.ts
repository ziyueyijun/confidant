/**
 * Ticket #18 scope: pure theme logic shared between the main process
 * (persistence) and the renderer (applying CSS variables). Kept
 * dependency-free (no `electron`, no DOM) so it can be unit tested in
 * isolation and imported from both the node and web TS projects.
 */

export const THEME_NAMES = ['light', 'dark'] as const

export type ThemeName = (typeof THEME_NAMES)[number]

export const DEFAULT_THEME: ThemeName = 'light'

/**
 * CSS custom property values for a given theme. Keys match the
 * `--bg-primary` etc. custom properties consumed by
 * `src/renderer/src/styles/editor.css`.
 */
export interface ThemeColors {
  bgPrimary: string
  bgSecondary: string
  bgTertiary: string
  textPrimary: string
  textSecondary: string
  border: string
  accent: string
}

const LIGHT_THEME: ThemeColors = {
  bgPrimary: '#ffffff',
  bgSecondary: '#f5f5f5',
  bgTertiary: '#e8e8e8',
  textPrimary: '#1a1a1a',
  textSecondary: '#666666',
  border: '#d0d0d0',
  accent: '#0066cc'
}

const DARK_THEME: ThemeColors = {
  bgPrimary: '#1e1e1e',
  bgSecondary: '#252526',
  bgTertiary: '#2d2d2d',
  textPrimary: '#d4d4d4',
  textSecondary: '#858585',
  border: '#3c3c3c',
  accent: '#4a9eff'
}

const THEMES: Record<ThemeName, ThemeColors> = {
  light: LIGHT_THEME,
  dark: DARK_THEME
}

/** Returns the full CSS variable set for a given theme name. */
export function getThemeColors(theme: ThemeName): ThemeColors {
  return THEMES[theme]
}

/** Type guard / narrowing helper for values coming from untrusted sources (disk, IPC). */
export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === 'string' && (THEME_NAMES as readonly string[]).includes(value)
}

export const EDITOR_WIDTH_OPTIONS = ['800px', '1000px', '100%'] as const

export type EditorWidth = (typeof EDITOR_WIDTH_OPTIONS)[number]

export const DEFAULT_EDITOR_WIDTH: EditorWidth = '800px'

export function isEditorWidth(value: unknown): value is EditorWidth {
  return typeof value === 'string' && (EDITOR_WIDTH_OPTIONS as readonly string[]).includes(value)
}

/** Shape persisted to disk (theme.json in the userData dir). */
export interface ThemeConfig {
  theme: ThemeName
  editorWidth: EditorWidth
}

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  theme: DEFAULT_THEME,
  editorWidth: DEFAULT_EDITOR_WIDTH
}

/**
 * Serializes a theme config to a JSON string for disk persistence.
 * Pretty-printed so the file is human-editable/diffable.
 */
export function serializeThemeConfig(config: ThemeConfig): string {
  return JSON.stringify(config, null, 2)
}

/**
 * Parses a theme config from disk, tolerating missing/corrupt data by
 * falling back to defaults for any invalid or absent field. Never
 * throws: config files can be hand-edited or partially written, and a
 * bad config must not block the app from starting.
 */
export function parseThemeConfig(raw: string): ThemeConfig {
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof ThemeConfig, unknown>>
    return {
      theme: isThemeName(parsed.theme) ? parsed.theme : DEFAULT_THEME_CONFIG.theme,
      editorWidth: isEditorWidth(parsed.editorWidth)
        ? parsed.editorWidth
        : DEFAULT_THEME_CONFIG.editorWidth
    }
  } catch {
    return { ...DEFAULT_THEME_CONFIG }
  }
}
