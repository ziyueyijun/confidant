import { describe, expect, it } from 'vitest'
import {
  isHiddenName,
  isMarkdownFile,
  isVisibleFileName,
  shouldIncludeEntry,
  sortFileTreeNodes,
  type FileTreeNode
} from './fileTree'

describe('isHiddenName', () => {
  it('treats dotfiles as hidden', () => {
    expect(isHiddenName('.gitignore')).toBe(true)
    expect(isHiddenName('.git')).toBe(true)
  })

  it('treats normal names as not hidden', () => {
    expect(isHiddenName('notes.md')).toBe(false)
    expect(isHiddenName('folder')).toBe(false)
  })
})

describe('isVisibleFileName', () => {
  it('shows .md/.markdown/.txt files', () => {
    expect(isVisibleFileName('todo.md')).toBe(true)
    expect(isVisibleFileName('todo.markdown')).toBe(true)
    expect(isVisibleFileName('notes.txt')).toBe(true)
  })

  it('shows common image formats and PDFs', () => {
    expect(isVisibleFileName('photo.png')).toBe(true)
    expect(isVisibleFileName('photo.JPG')).toBe(true)
    expect(isVisibleFileName('scan.pdf')).toBe(true)
  })

  it('hides unrelated extensions', () => {
    expect(isVisibleFileName('archive.zip')).toBe(false)
    expect(isVisibleFileName('script.js')).toBe(false)
    expect(isVisibleFileName('data.json')).toBe(false)
  })

  it('hides dotfiles even if they end in a visible-looking extension', () => {
    expect(isVisibleFileName('.hidden.md')).toBe(false)
  })

  it('hides extensionless files and pure dotfiles', () => {
    expect(isVisibleFileName('README')).toBe(false)
    expect(isVisibleFileName('.gitignore')).toBe(false)
  })

  it('is case-insensitive on extension', () => {
    expect(isVisibleFileName('NOTES.MD')).toBe(true)
    expect(isVisibleFileName('SCAN.PDF')).toBe(true)
  })
})

describe('shouldIncludeEntry', () => {
  it('always keeps directories unless hidden', () => {
    expect(shouldIncludeEntry('subfolder', 'directory')).toBe(true)
    expect(shouldIncludeEntry('.hidden-folder', 'directory')).toBe(false)
  })

  it('keeps files only if their extension is visible', () => {
    expect(shouldIncludeEntry('note.md', 'file')).toBe(true)
    expect(shouldIncludeEntry('note.exe', 'file')).toBe(false)
  })
})

describe('isMarkdownFile', () => {
  it('recognizes .md and .markdown', () => {
    expect(isMarkdownFile('a.md')).toBe(true)
    expect(isMarkdownFile('a.markdown')).toBe(true)
  })

  it('rejects other visible-but-non-markdown files', () => {
    expect(isMarkdownFile('a.txt')).toBe(false)
    expect(isMarkdownFile('a.png')).toBe(false)
  })
})

describe('sortFileTreeNodes', () => {
  function file(name: string): FileTreeNode {
    return { path: `/lib/${name}`, name, kind: 'file' }
  }
  function dir(name: string): FileTreeNode {
    return { path: `/lib/${name}`, name, kind: 'directory', children: [] }
  }

  it('puts directories before files regardless of input order', () => {
    const input = [file('b.md'), dir('zeta'), file('a.md'), dir('alpha')]
    const sorted = sortFileTreeNodes(input)
    expect(sorted.map((n) => n.kind)).toEqual(['directory', 'directory', 'file', 'file'])
  })

  it('sorts directories and files alphabetically (case-insensitive) within their group', () => {
    const input = [dir('Zebra'), dir('apple'), file('Banana.md'), file('cherry.md')]
    const sorted = sortFileTreeNodes(input)
    expect(sorted.map((n) => n.name)).toEqual(['apple', 'Zebra', 'Banana.md', 'cherry.md'])
  })

  it('does not mutate the input array', () => {
    const input = [file('b.md'), dir('a')]
    const inputCopy = [...input]
    sortFileTreeNodes(input)
    expect(input).toEqual(inputCopy)
  })
})
