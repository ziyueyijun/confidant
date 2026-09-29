import { getThemeColors, type ThemeName } from '@shared/theme'

/**
 * Applies a theme to the document by:
 * 1. Setting `data-theme` on `<body>` so `editor.css`'s attribute
 *    selectors (`body[data-theme="dark"] { ... }`) take effect.
 * 2. Setting the `--bg-primary` etc. CSS custom properties directly on
 *    `<body>` as well, so the palette is defined in one place (this
 *    module) rather than duplicated as a second full stylesheet in CSS.
 *
 * Kept separate from `../../../shared/theme.ts` (pure, DOM-free) so the
 * palette logic stays unit-testable without jsdom.
 */
export function applyTheme(theme: ThemeName, target: HTMLElement = document.body): void {
  target.dataset.theme = theme
  const colors = getThemeColors(theme)
  target.style.setProperty('--bg-primary', colors.bgPrimary)
  target.style.setProperty('--bg-secondary', colors.bgSecondary)
  target.style.setProperty('--bg-tertiary', colors.bgTertiary)
  target.style.setProperty('--text-primary', colors.textPrimary)
  target.style.setProperty('--text-secondary', colors.textSecondary)
  target.style.setProperty('--border', colors.border)
  target.style.setProperty('--accent', colors.accent)
}

/** Applies the `--editor-max-width` variable consumed by `#editor-container`. */
export function applyEditorWidth(width: string, target: HTMLElement = document.body): void {
  target.style.setProperty('--editor-max-width', width)
}
