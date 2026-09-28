import { promises as fs } from 'fs'
import { join } from 'path'
import {
  DEFAULT_THEME_CONFIG,
  parseThemeConfig,
  serializeThemeConfig,
  type ThemeConfig
} from '../shared/theme'

/**
 * Ticket #18 persistence choice: plain `fs.writeFile` of a JSON file in
 * `app.getPath('userData')`, rather than adding the `electron-store`
 * dependency. Both are listed as acceptable in the ticket spec;
 * `electron-store` is a thin wrapper around exactly this pattern (see
 * its README / the Electron docs "Read/Write files" recipe referenced
 * from issue #10's research), and this app already has zero runtime
 * config-persistence dependencies. Avoiding the extra dependency here
 * keeps the install surface smaller for a single small JSON blob; if a
 * future ticket needs more (schema migration, change-watching, atomic
 * multi-key writes) it can revisit this decision then.
 */

const CONFIG_FILE_NAME = 'theme.json'

export function themeConfigPath(userDataDir: string): string {
  return join(userDataDir, CONFIG_FILE_NAME)
}

/**
 * Reads the persisted theme config, falling back to defaults if the
 * file is missing or unreadable (first launch, corrupted file, etc.).
 */
export async function readThemeConfig(userDataDir: string): Promise<ThemeConfig> {
  try {
    const raw = await fs.readFile(themeConfigPath(userDataDir), 'utf-8')
    return parseThemeConfig(raw)
  } catch {
    return { ...DEFAULT_THEME_CONFIG }
  }
}

/** Persists the theme config as JSON in the userData directory. */
export async function writeThemeConfig(userDataDir: string, config: ThemeConfig): Promise<void> {
  await fs.writeFile(themeConfigPath(userDataDir), serializeThemeConfig(config), 'utf-8')
}
