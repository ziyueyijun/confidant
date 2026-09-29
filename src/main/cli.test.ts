import { describe, expect, it } from 'vitest'
import { findMarkdownPathInArgv } from './cli'

describe('findMarkdownPathInArgv', () => {
  it('finds a .md path passed as the last argument', () => {
    const argv = ['electron.exe', '.', 'C:\\notes\\todo.md']
    expect(findMarkdownPathInArgv(argv)).toBe('C:\\notes\\todo.md')
  })

  it('finds a .markdown or .txt path too', () => {
    expect(findMarkdownPathInArgv(['app.exe', 'note.markdown'])).toBe('note.markdown')
    expect(findMarkdownPathInArgv(['app.exe', 'note.txt'])).toBe('note.txt')
  })

  it('ignores flags like --original-process-start-time appended by Chromium', () => {
    const argv = ['app.exe', 'C:\\notes\\todo.md', '--original-process-start-time=12345']
    expect(findMarkdownPathInArgv(argv)).toBe('C:\\notes\\todo.md')
  })

  it('returns null when no markdown-ish path is present', () => {
    expect(findMarkdownPathInArgv(['electron.exe', '.'])).toBeNull()
  })

  it('is case-insensitive on extension', () => {
    expect(findMarkdownPathInArgv(['app.exe', 'NOTE.MD'])).toBe('NOTE.MD')
  })
})
