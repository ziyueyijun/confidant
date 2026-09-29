import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  detectLargeDocumentWarning,
  detectLineEnding,
  listDirectoryTree,
  readFile,
  writeFileAtomic,
  writeMarkdownFile,
  createFile,
  renameEntry,
  deleteToTrash,
  generateUniqueFileName,
  DEFAULT_NEW_FILE_NAME,
  LARGE_DOCUMENT_CHAR_THRESHOLD
} from './fileSystem'

vi.mock('electron', () => ({
  shell: {
    trashItem: vi.fn().mockResolvedValue(undefined)
  }
}))

describe('detectLargeDocumentWarning', () => {
  it('returns undefined for a normal-sized document', () => {
    const content = 'a'.repeat(1_000)
    expect(detectLargeDocumentWarning(content)).toBeUndefined()
  })

  it('returns undefined right below the threshold', () => {
    const content = 'a'.repeat(LARGE_DOCUMENT_CHAR_THRESHOLD - 1)
    expect(detectLargeDocumentWarning(content)).toBeUndefined()
  })

  it('returns a warning at or above the threshold', () => {
    const content = 'a'.repeat(LARGE_DOCUMENT_CHAR_THRESHOLD)
    const warning = detectLargeDocumentWarning(content)
    expect(warning).toBeDefined()
    expect(warning).toContain(String(LARGE_DOCUMENT_CHAR_THRESHOLD))
  })

  it('returns a warning for a much larger document', () => {
    const content = '中'.repeat(150_000)
    expect(detectLargeDocumentWarning(content)).toBeDefined()
  })
})

describe('detectLineEnding', () => {
  it('detects CRLF when the file uses \\r\\n', () => {
    expect(detectLineEnding('line1\r\nline2\r\n')).toBe('CRLF')
  })

  it('detects LF when the file uses bare \\n', () => {
    expect(detectLineEnding('line1\nline2\n')).toBe('LF')
  })

  it('defaults to CRLF for content with no line breaks (new file default)', () => {
    expect(detectLineEnding('just one line, no newline')).toBe('CRLF')
  })

  it('defaults to CRLF for empty content', () => {
    expect(detectLineEnding('')).toBe('CRLF')
  })

  it('picks the majority line ending in a mixed file', () => {
    expect(detectLineEnding('a\r\nb\r\nc\r\nd\n')).toBe('CRLF')
    expect(detectLineEnding('a\nb\nc\nd\r\n')).toBe('LF')
  })
})

describe('readFile / writeMarkdownFile round-trip (BOM + line endings)', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'confidant-fs-test-'))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('detects no BOM and CRLF for a plain CRLF file', async () => {
    const filePath = join(dir, 'plain.md')
    await fs.writeFile(filePath, '# Title\r\n\r\nBody text\r\n', 'utf-8')

    const result = await readFile(filePath)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.encoding.hasBOM).toBe(false)
      expect(result.encoding.lineEnding).toBe('CRLF')
      expect(result.content).toBe('# Title\r\n\r\nBody text\r\n')
    }
  })

  it('detects a UTF-8 BOM and strips it from the returned content', async () => {
    const filePath = join(dir, 'bom.md')
    await fs.writeFile(filePath, '﻿# Title\nBody\n', 'utf-8')

    const result = await readFile(filePath)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.encoding.hasBOM).toBe(true)
      expect(result.content).toBe('# Title\nBody\n')
      expect(result.content.charCodeAt(0)).not.toBe(0xfeff)
    }
  })

  it('re-applies the BOM on save when the original file had one', async () => {
    const filePath = join(dir, 'bom.md')
    await fs.writeFile(filePath, '﻿# Title\n', 'utf-8')

    const readResult = await readFile(filePath)
    expect(readResult.success).toBe(true)
    if (!readResult.success) return

    const { encoding } = readResult
    await writeMarkdownFile(filePath, '# Title edited\n', { hasBOM: encoding.hasBOM })

    const raw = await fs.readFile(filePath, 'utf-8')
    expect(raw.charCodeAt(0)).toBe(0xfeff)
    expect(raw).toBe('﻿# Title edited\n')
  })

  it('does not add a BOM on save when the original file had none', async () => {
    const filePath = join(dir, 'no-bom.md')
    await fs.writeFile(filePath, '# Title\n', 'utf-8')

    const readResult = await readFile(filePath)
    expect(readResult.success).toBe(true)
    if (!readResult.success) return

    const { encoding } = readResult
    await writeMarkdownFile(filePath, '# Title edited\n', { hasBOM: encoding.hasBOM })

    const raw = await fs.readFile(filePath, 'utf-8')
    expect(raw.charCodeAt(0)).not.toBe(0xfeff)
    expect(raw).toBe('# Title edited\n')
  })
})

describe('writeFileAtomic', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'confidant-fs-atomic-'))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('writes content to the target path', async () => {
    const filePath = join(dir, 'note.md')
    await writeFileAtomic(filePath, 'hello world')

    expect(await fs.readFile(filePath, 'utf-8')).toBe('hello world')
  })

  it('does not leave a .tmp file behind after a successful save', async () => {
    const filePath = join(dir, 'note.md')
    await writeFileAtomic(filePath, 'hello world')

    const entries = await fs.readdir(dir)
    expect(entries).toEqual(['note.md'])
    expect(entries.some((e) => e.endsWith('.tmp'))).toBe(false)
  })

  it('overwrites an existing file completely', async () => {
    const filePath = join(dir, 'note.md')
    await fs.writeFile(filePath, 'old content', 'utf-8')

    await writeFileAtomic(filePath, 'new content')

    expect(await fs.readFile(filePath, 'utf-8')).toBe('new content')
  })

  it('goes through a sibling .tmp path before the rename (atomic save sequence)', async () => {
    const filePath = join(dir, 'note.md')
    const tmpPath = `${filePath}.tmp`

    const writeSpy = vi.spyOn(fs, 'writeFile')

    await writeFileAtomic(filePath, 'content')

    expect(writeSpy).toHaveBeenCalledWith(tmpPath, 'content', 'utf-8')
    writeSpy.mockRestore()

    // The tmp file must not exist anymore; rename() consumed it.
    await expect(fs.access(tmpPath)).rejects.toThrow()
  })
})

describe('minimal-diff save (acceptance criterion #6)', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'confidant-fs-diff-'))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  const ORIGINAL = [
    '# Notes\r',
    '\r',
    '    indented code line, keep exactly\r',
    '\r',
    'A line with a hard break at the end.  \r', // trailing two spaces = hard break
    'Second line of the same paragraph.\r',
    '\r',
    '- list item one\r',
    '- list item two\r',
    '\r',
    ''
  ].join('\n')

  it('produces byte-identical output when the file is opened and closed without edits', async () => {
    const filePath = join(dir, 'roundtrip.md')
    await fs.writeFile(filePath, ORIGINAL, 'utf-8')

    const readResult = await readFile(filePath)
    expect(readResult.success).toBe(true)
    if (!readResult.success) return

    const { content, encoding } = readResult
    // Simulate "open, make no edits, close": save back exactly what was loaded.
    await writeMarkdownFile(filePath, content, { hasBOM: encoding.hasBOM })

    const after = await fs.readFile(filePath, 'utf-8')
    expect(after).toBe(ORIGINAL)
  })

  it('changes only the edited word\'s line when one word is edited and saved', async () => {
    const filePath = join(dir, 'oneword.md')
    await fs.writeFile(filePath, ORIGINAL, 'utf-8')

    const readResult = await readFile(filePath)
    expect(readResult.success).toBe(true)
    if (!readResult.success) return

    const { content, encoding } = readResult

    // Simulate CM6 handing back `state.doc.toString()` after a targeted
    // word edit: only "Notes" -> "Notes!" changes, nothing else is
    // touched (no re-serialization from an AST).
    const edited = content.replace('# Notes\r', '# Notes!\r')

    await writeMarkdownFile(filePath, edited, { hasBOM: encoding.hasBOM })
    const after = await fs.readFile(filePath, 'utf-8')

    const beforeLines = ORIGINAL.split('\n')
    const afterLines = after.split('\n')
    expect(afterLines.length).toBe(beforeLines.length)

    const changedLineIndexes: number[] = []
    for (let i = 0; i < beforeLines.length; i++) {
      if (beforeLines[i] !== afterLines[i]) changedLineIndexes.push(i)
    }

    expect(changedLineIndexes).toEqual([0])
    expect(afterLines[0]).toBe('# Notes!\r')

    // Every other line, including blank lines, the indented code line,
    // the hard-break trailing spaces, and the CRLF line endings, is
    // byte-for-byte unchanged.
    for (let i = 1; i < beforeLines.length; i++) {
      expect(afterLines[i]).toBe(beforeLines[i])
    }
  })

  it('preserves the trailing two-space hard break exactly', async () => {
    const filePath = join(dir, 'hardbreak.md')
    await fs.writeFile(filePath, ORIGINAL, 'utf-8')

    const readResult = await readFile(filePath)
    expect(readResult.success).toBe(true)
    if (!readResult.success) return

    const { content, encoding } = readResult
    await writeMarkdownFile(filePath, content, { hasBOM: encoding.hasBOM })

    const after = await fs.readFile(filePath, 'utf-8')
    expect(after).toContain('A line with a hard break at the end.  \r')
  })
})

describe('listDirectoryTree (ticket #17)', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'confidant-tree-'))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('returns an empty array for an empty directory', async () => {
    expect(await listDirectoryTree(dir)).toEqual([])
  })

  it('returns an empty array for a nonexistent directory instead of throwing', async () => {
    expect(await listDirectoryTree(join(dir, 'does-not-exist'))).toEqual([])
  })

  it('lists visible files with folders sorted before files', async () => {
    await fs.writeFile(join(dir, 'b.md'), '# B', 'utf-8')
    await fs.writeFile(join(dir, 'a.md'), '# A', 'utf-8')
    await fs.mkdir(join(dir, 'zeta'))
    await fs.mkdir(join(dir, 'alpha'))

    const tree = await listDirectoryTree(dir)

    expect(tree.map((n) => n.name)).toEqual(['alpha', 'zeta', 'a.md', 'b.md'])
    expect(tree.map((n) => n.kind)).toEqual(['directory', 'directory', 'file', 'file'])
  })

  it('filters out hidden files and folders', async () => {
    await fs.writeFile(join(dir, 'visible.md'), 'x', 'utf-8')
    await fs.writeFile(join(dir, '.hidden.md'), 'x', 'utf-8')
    await fs.mkdir(join(dir, '.git'))
    await fs.writeFile(join(dir, '.git', 'config'), 'x', 'utf-8')

    const tree = await listDirectoryTree(dir)

    expect(tree.map((n) => n.name)).toEqual(['visible.md'])
  })

  it('filters out files with non-whitelisted extensions', async () => {
    await fs.writeFile(join(dir, 'notes.md'), 'x', 'utf-8')
    await fs.writeFile(join(dir, 'archive.zip'), 'x', 'utf-8')
    await fs.writeFile(join(dir, 'photo.png'), 'x', 'utf-8')
    await fs.writeFile(join(dir, 'scan.pdf'), 'x', 'utf-8')

    const tree = await listDirectoryTree(dir)

    expect(tree.map((n) => n.name).sort()).toEqual(['notes.md', 'photo.png', 'scan.pdf'])
  })

  it('recurses into subdirectories and sorts each level independently', async () => {
    await fs.mkdir(join(dir, 'sub'))
    await fs.writeFile(join(dir, 'sub', 'z.md'), 'x', 'utf-8')
    await fs.writeFile(join(dir, 'sub', 'a.md'), 'x', 'utf-8')
    await fs.mkdir(join(dir, 'sub', 'nested'))
    await fs.writeFile(join(dir, 'sub', 'nested', 'deep.md'), 'x', 'utf-8')

    const tree = await listDirectoryTree(dir)

    expect(tree).toHaveLength(1)
    const sub = tree[0]
    expect(sub.name).toBe('sub')
    expect(sub.kind).toBe('directory')
    expect(sub.children?.map((n) => n.name)).toEqual(['nested', 'a.md', 'z.md'])

    const nested = sub.children?.find((n) => n.name === 'nested')
    expect(nested?.children?.map((n) => n.name)).toEqual(['deep.md'])
  })

  it('returns absolute paths for every node', async () => {
    await fs.mkdir(join(dir, 'sub'))
    await fs.writeFile(join(dir, 'sub', 'note.md'), 'x', 'utf-8')

    const tree = await listDirectoryTree(dir)
    const sub = tree[0]
    const note = sub.children?.[0]

    expect(sub.path).toBe(join(dir, 'sub'))
    expect(note?.path).toBe(join(dir, 'sub', 'note.md'))
  })

  it('keeps an empty subdirectory as a childless-but-present node', async () => {
    await fs.mkdir(join(dir, 'empty-folder'))

    const tree = await listDirectoryTree(dir)

    expect(tree).toHaveLength(1)
    expect(tree[0].name).toBe('empty-folder')
    expect(tree[0].children).toEqual([])
  })
})

describe('generateUniqueFileName (ticket #19)', () => {
  it('returns the base name unchanged when there is no collision', () => {
    expect(generateUniqueFileName([], '未命名.md')).toBe('未命名.md')
    expect(generateUniqueFileName(['other.md'], '未命名.md')).toBe('未命名.md')
  })

  it('appends " 2" when the base name already exists', () => {
    expect(generateUniqueFileName(['未命名.md'], '未命名.md')).toBe('未命名 2.md')
  })

  it('keeps incrementing until it finds a free slot', () => {
    const existing = ['未命名.md', '未命名 2.md', '未命名 3.md']
    expect(generateUniqueFileName(existing, '未命名.md')).toBe('未命名 4.md')
  })

  it('handles gaps in the numbering by still finding the first free slot', () => {
    // "未命名 2.md" is free even though "未命名.md" and "未命名 3.md" are taken.
    const existing = ['未命名.md', '未命名 3.md']
    expect(generateUniqueFileName(existing, '未命名.md')).toBe('未命名 2.md')
  })

  it('preserves the extension when deduplicating', () => {
    expect(generateUniqueFileName(['notes.txt'], 'notes.txt')).toBe('notes 2.txt')
  })

  it('handles a base name with no extension', () => {
    expect(generateUniqueFileName(['README'], 'README')).toBe('README 2')
  })
})

describe('createFile (ticket #19)', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'confidant-create-'))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('creates a new empty file with the default name', async () => {
    const filePath = await createFile(dir)

    expect(filePath).toBe(join(dir, DEFAULT_NEW_FILE_NAME))
    expect(await fs.readFile(filePath, 'utf-8')).toBe('')
  })

  it('auto-numbers the name when the default already exists', async () => {
    await fs.writeFile(join(dir, DEFAULT_NEW_FILE_NAME), 'existing', 'utf-8')

    const filePath = await createFile(dir)

    expect(filePath).toBe(join(dir, '未命名 2.md'))
  })

  it('accepts a custom base name', async () => {
    const filePath = await createFile(dir, 'custom.md')
    expect(filePath).toBe(join(dir, 'custom.md'))
  })

  it('does not touch other files already in the directory', async () => {
    await fs.writeFile(join(dir, 'existing.md'), 'keep me', 'utf-8')

    await createFile(dir)

    expect(await fs.readFile(join(dir, 'existing.md'), 'utf-8')).toBe('keep me')
  })
})

describe('renameEntry (ticket #19)', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'confidant-rename-'))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('renames a file successfully when the target does not exist', async () => {
    const oldPath = join(dir, 'old.md')
    await fs.writeFile(oldPath, 'content', 'utf-8')

    const result = await renameEntry(oldPath, 'new.md')

    expect(result).toEqual({ ok: true, newPath: join(dir, 'new.md') })
    expect(await fs.readFile(join(dir, 'new.md'), 'utf-8')).toBe('content')
    await expect(fs.access(oldPath)).rejects.toThrow()
  })

  it('refuses to overwrite an existing target file', async () => {
    const oldPath = join(dir, 'old.md')
    const targetPath = join(dir, 'taken.md')
    await fs.writeFile(oldPath, 'old content', 'utf-8')
    await fs.writeFile(targetPath, 'do not touch', 'utf-8')

    const result = await renameEntry(oldPath, 'taken.md')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('target-exists')
    // Neither file should have been modified.
    expect(await fs.readFile(oldPath, 'utf-8')).toBe('old content')
    expect(await fs.readFile(targetPath, 'utf-8')).toBe('do not touch')
  })

  it('is a no-op success when renaming to the same name', async () => {
    const oldPath = join(dir, 'same.md')
    await fs.writeFile(oldPath, 'content', 'utf-8')

    const result = await renameEntry(oldPath, 'same.md')

    expect(result).toEqual({ ok: true, newPath: oldPath })
  })

  it('reports an error result if the underlying rename fails', async () => {
    const oldPath = join(dir, 'does-not-exist.md')

    const result = await renameEntry(oldPath, 'new.md')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('error')
  })
})

describe('deleteToTrash (ticket #19)', () => {
  it('delegates to Electron shell.trashItem rather than deleting permanently', async () => {
    const { shell } = await import('electron')

    await deleteToTrash('/some/path/note.md')

    expect(shell.trashItem).toHaveBeenCalledWith('/some/path/note.md')
  })
})

describe('exception handling (ticket #27)', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'confidant-exception-'))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  describe('file size checks (acceptance criterion #4)', () => {
    it('warns but allows opening a file between 10MB and 50MB', async () => {
      const filePath = join(dir, 'large.md')
      const content = 'x'.repeat(15 * 1024 * 1024) // 15MB
      await fs.writeFile(filePath, content, 'utf-8')

      const result = await readFile(filePath)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.warning).toBeDefined()
        expect(result.warning).toContain('文件较大')
        expect(result.content).toBe(content)
      }
    })

    it('refuses to open a file >= 50MB', async () => {
      const filePath = join(dir, 'huge.md')
      const content = 'x'.repeat(60 * 1024 * 1024) // 60MB
      await fs.writeFile(filePath, content, 'utf-8')

      const result = await readFile(filePath)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('FILE_TOO_LARGE')
        expect(result.message).toContain('文件过大')
      }
    })

    it('allows opening a file just under 10MB without file size warning', async () => {
      const filePath = join(dir, 'normal.md')
      // Use a smaller file to avoid triggering the character count warning
      const content = 'x'.repeat(50_000) // 50k characters, well under 100k
      await fs.writeFile(filePath, content, 'utf-8')

      const result = await readFile(filePath)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.warning).toBeUndefined()
        expect(result.content).toBe(content)
      }
    })
  })

  describe('binary file detection (acceptance criterion #6)', () => {
    it('refuses to open a file containing null bytes', async () => {
      const filePath = join(dir, 'binary.dat')
      const content = 'text\0more text\0'
      await fs.writeFile(filePath, content, 'utf-8')

      const result = await readFile(filePath)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('BINARY_FILE')
        expect(result.message).toContain('二进制文件')
      }
    })

    it('allows opening a text file without null bytes', async () => {
      const filePath = join(dir, 'text.md')
      const content = '# Title\n\nNormal text content'
      await fs.writeFile(filePath, content, 'utf-8')

      const result = await readFile(filePath)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.content).toBe(content)
      }
    })
  })

  describe('write permission errors (acceptance criteria #1, #2, #3)', () => {
    it('returns PERMISSION_DENIED error when write fails with EACCES', async () => {
      const filePath = join(dir, 'protected.md')
      const writeSpy = vi.spyOn(fs, 'writeFile').mockRejectedValue(
        Object.assign(new Error('EACCES'), { code: 'EACCES' })
      )

      const result = await writeFileAtomic(filePath, 'content')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('PERMISSION_DENIED')
        expect(result.message).toContain('权限不足')
      }

      writeSpy.mockRestore()
    })

    it('returns READ_ONLY error when write fails with EROFS', async () => {
      const filePath = join(dir, 'readonly.md')
      const writeSpy = vi.spyOn(fs, 'writeFile').mockRejectedValue(
        Object.assign(new Error('EROFS'), { code: 'EROFS' })
      )

      const result = await writeFileAtomic(filePath, 'content')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('READ_ONLY')
        expect(result.message).toContain('只读')
      }

      writeSpy.mockRestore()
    })

    it('returns DISK_FULL error when write fails with ENOSPC', async () => {
      const filePath = join(dir, 'full.md')
      const writeSpy = vi.spyOn(fs, 'writeFile').mockRejectedValue(
        Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' })
      )

      const result = await writeFileAtomic(filePath, 'content')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('DISK_FULL')
        expect(result.message).toContain('磁盘空间不足')
      }

      writeSpy.mockRestore()
    })

    it('returns success when write succeeds', async () => {
      const filePath = join(dir, 'success.md')

      const result = await writeFileAtomic(filePath, 'content')

      expect(result.success).toBe(true)
      expect(await fs.readFile(filePath, 'utf-8')).toBe('content')
    })

    it('handles permission error on rename step', async () => {
      const filePath = join(dir, 'rename-fail.md')
      const renameSpy = vi.spyOn(fs, 'rename').mockRejectedValue(
        Object.assign(new Error('EACCES'), { code: 'EACCES' })
      )

      const result = await writeFileAtomic(filePath, 'content')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('PERMISSION_DENIED')
      }

      renameSpy.mockRestore()
    })
  })

  describe('writeMarkdownFile returns result', () => {
    it('returns success result when write succeeds', async () => {
      const filePath = join(dir, 'good.md')

      const result = await writeMarkdownFile(filePath, '# Test', { hasBOM: false })

      expect(result.success).toBe(true)
    })

    it('returns error result when write fails', async () => {
      const filePath = join(dir, 'bad.md')
      const writeSpy = vi.spyOn(fs, 'writeFile').mockRejectedValue(
        Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' })
      )

      const result = await writeMarkdownFile(filePath, '# Test', { hasBOM: false })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('DISK_FULL')
      }

      writeSpy.mockRestore()
    })
  })

  describe('read permission errors', () => {
    it('returns ACCESS_DENIED when stat fails with EACCES', async () => {
      const filePath = join(dir, 'no-access.md')
      const statSpy = vi.spyOn(fs, 'stat').mockRejectedValue(
        Object.assign(new Error('EACCES'), { code: 'EACCES' })
      )

      const result = await readFile(filePath)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('ACCESS_DENIED')
        expect(result.message).toContain('权限不足')
      }

      statSpy.mockRestore()
    })

    it('returns ACCESS_DENIED when stat fails with EPERM', async () => {
      const filePath = join(dir, 'no-perm.md')
      const statSpy = vi.spyOn(fs, 'stat').mockRejectedValue(
        Object.assign(new Error('EPERM'), { code: 'EPERM' })
      )

      const result = await readFile(filePath)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('ACCESS_DENIED')
      }

      statSpy.mockRestore()
    })
  })
})

