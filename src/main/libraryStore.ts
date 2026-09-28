import { promises as fs } from 'fs'
import { join } from 'path'
import {
  DEFAULT_LIBRARY_CONFIG,
  parseLibraryConfig,
  serializeLibraryConfig,
  type LibraryConfig
} from '../shared/library'

/**
 * Ticket #17 persistence choice: a separate `library.json` file in
 * `app.getPath('userData')`, alongside #18's `theme.json`, rather than
 * merging the two into one config file. Recent-libraries and
 * theme/editor-width are unrelated concerns with independent read/write
 * lifecycles (recents change every time a folder is opened; theme
 * changes only via the toggle buttons) - keeping them in separate files
 * avoids one feature's writes racing/clobbering unrelated fields in the
 * other's blob, and keeps each file small and single-purpose. Same
 * "plain fs.writeFile of pretty-printed JSON" mechanism as `themeStore.ts`
 * (see that file's comment for why no `electron-store` dependency).
 */

const CONFIG_FILE_NAME = 'library.json'

export function libraryConfigPath(userDataDir: string): string {
  return join(userDataDir, CONFIG_FILE_NAME)
}

/**
 * Reads the persisted library config, falling back to defaults if the
 * file is missing or unreadable (first launch, corrupted file, etc.).
 */
export async function readLibraryConfig(userDataDir: string): Promise<LibraryConfig> {
  try {
    const raw = await fs.readFile(libraryConfigPath(userDataDir), 'utf-8')
    return parseLibraryConfig(raw)
  } catch {
    return { ...DEFAULT_LIBRARY_CONFIG }
  }
}

/** Persists the library config as JSON in the userData directory. */
export async function writeLibraryConfig(
  userDataDir: string,
  config: LibraryConfig
): Promise<void> {
  await fs.writeFile(libraryConfigPath(userDataDir), serializeLibraryConfig(config), 'utf-8')
}
