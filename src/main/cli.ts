import { extname } from 'path'

/**
 * Finds a markdown file path passed on the command line, e.g.
 * `confidant.exe C:\notes\todo.md` or `electron . C:\notes\todo.md`
 * during dev. Mirrors the pattern documented in issue #10 research for
 * `second-instance` argv handling, minus the single-instance wiring
 * (that's part of the file-library ticket, #17/#19), since #14 only
 * needs to open one file for read-only rendering.
 */
export function findMarkdownPathInArgv(argv: string[]): string | null {
  for (let i = argv.length - 1; i >= 0; i--) {
    const arg = argv[i]
    if (arg.startsWith('-')) continue
    const ext = extname(arg).toLowerCase()
    if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
      return arg
    }
  }
  return null
}
