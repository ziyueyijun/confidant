import { promises as fs } from 'fs'
import { join } from 'path'
import { shouldIncludeEntry, sortFileTreeNodes, type FileTreeNode } from '../shared/fileTree'

/**
 * Ticket #14 perf acceptance criterion: documents around 100k characters
 * ("10 万字") must surface a warning so the caller can decide how to
 * handle a large load (the actual UI treatment is deferred to a later
 * ticket; this only detects and signals it).
 *
 * We threshold on JS string length (UTF-16 code units) rather than raw
 * file bytes: for CJK text each character is 1 code unit but 3 UTF-8
 * bytes, so a byte-based threshold would trigger 3x too early for
 * Chinese notes and 1x for ASCII ones. Counting characters directly
 * matches the "10 万字" (100k characters) wording of the spec regardless
 * of script.
 */
export const LARGE_DOCUMENT_CHAR_THRESHOLD = 100_000

export type LineEnding = 'CRLF' | 'LF'

/**
 * Byte-level facts about a file needed to write it back without
 * disturbing anything the user didn't touch (ticket #15 acceptance
 * criterion #6: zero-byte diff on an unedited open/close cycle).
 */
export interface FileEncodingInfo {
  /** Whether the file started with a UTF-8 BOM (EF BB BF). */
  hasBOM: boolean
  /** Dominant line ending detected in the file. Defaults to CRLF for new files. */
  lineEnding: LineEnding
}

export interface ReadFileResult {
  content: string
  /** Present when the document is large enough to warrant a load warning. */
  warning?: string
  /** Encoding/line-ending facts to preserve on the next save. */
  encoding: FileEncodingInfo
}

const BOM = '﻿'

/**
 * Detects the dominant line ending style in `content`.
 *
 * We count CRLF vs. lone-LF occurrences rather than just inspecting the
 * first line break: a file could (rarely) be mixed, and majority-vote is
 * a safer default than "first line wins". Files with no line breaks at
 * all default to CRLF per spec ("新建文件用 CRLF").
 */
export function detectLineEnding(content: string): LineEnding {
  let crlfCount = 0
  let lfOnlyCount = 0
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      if (i > 0 && content[i - 1] === '\r') {
        crlfCount++
      } else {
        lfOnlyCount++
      }
    }
  }
  if (crlfCount === 0 && lfOnlyCount === 0) return 'CRLF'
  return crlfCount >= lfOnlyCount ? 'CRLF' : 'LF'
}

/**
 * Reads a UTF-8 text file from disk, detecting BOM/line-ending so a
 * later save (ticket #15) can round-trip them unchanged.
 */
export async function readFile(filePath: string): Promise<ReadFileResult> {
  const raw = await fs.readFile(filePath, 'utf-8')
  const hasBOM = raw.charCodeAt(0) === 0xfeff
  const content = hasBOM ? raw.slice(1) : raw
  const lineEnding = detectLineEnding(content)
  const warning = detectLargeDocumentWarning(content)

  return {
    content,
    encoding: { hasBOM, lineEnding },
    ...(warning ? { warning } : {})
  }
}

/**
 * Returns a warning message if `content` is large enough to risk slow
 * loads (spec perf budget: ~100k characters should still load, but the
 * caller/UI should be told so it can warn the user), or `undefined`
 * otherwise.
 */
export function detectLargeDocumentWarning(content: string): string | undefined {
  if (content.length < LARGE_DOCUMENT_CHAR_THRESHOLD) return undefined
  return `Document is large (${content.length} characters); loading may be slow.`
}

/**
 * Atomically writes `content` to `filePath`.
 *
 * Sequence (ticket #15 acceptance criterion #4, cross-checked against the
 * VS Code save implementation referenced in issue #10): write to a
 * sibling `.tmp` file first, then `fs.rename()` it over the real path.
 * `rename` within the same directory/filesystem is atomic on both
 * POSIX and Windows (NTFS), so a crash mid-write never corrupts the
 * original file - readers either see the old file or the fully-written
 * new one, never a partial write.
 *
 * `content` is expected to already be the exact bytes to persist (BOM
 * prefix included by the caller if `encoding.hasBOM` is true); this
 * function does not re-encode line endings itself, since the editor
 * layer preserves them via CM6's own line-ending-aware document text.
 */
export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.tmp`
  await fs.writeFile(tmpPath, content, 'utf-8')
  try {
    await fs.rename(tmpPath, filePath)
  } catch (err) {
    // Best-effort cleanup: if rename failed, don't leave the tmp file
    // behind. Ignore secondary errors from the cleanup itself.
    await fs.unlink(tmpPath).catch(() => {})
    throw err
  }
}

/**
 * Writes markdown `content` back to `filePath`, re-applying the BOM
 * that was present on load (spec: "检测并沿用原文件的 CRLF/LF/BOM").
 *
 * Line endings are not rewritten here: the caller is expected to hand
 * us `content` with the line endings the user's document already uses
 * (CM6 preserves whatever line separators exist in the doc text as
 * typed/loaded), so no normalization step is needed - and adding one
 * would risk touching lines the user never edited, violating the
 * minimal-diff requirement.
 */
export async function writeMarkdownFile(
  filePath: string,
  content: string,
  encoding: Pick<FileEncodingInfo, 'hasBOM'>
): Promise<void> {
  const withBOM = encoding.hasBOM ? BOM + content : content
  await writeFileAtomic(filePath, withBOM)
}

/**
 * Ticket #17: recursively walks `rootPath` and builds the sidebar's file
 * tree in one pass.
 *
 * Eager/full-load vs. lazy per-directory IPC: this ticket picks eager.
 * A single recursive `fs.readdir` walk, serialized once over IPC, is far
 * simpler to implement and test than a lazy "expand this folder" protocol
 * (no per-node loading state in the renderer, no race between "user
 * double-clicks a folder while its children are still loading", no
 * partial-tree cache invalidation). For a personal notes library
 * (hundreds to low thousands of files, per the ticket's own sizing
 * guidance) a full walk is a handful of milliseconds to a couple hundred
 * ms at the top end, well within "open a folder" latency budgets, and it
 * lets the sidebar render the complete tree in one shot with no
 * loading-spinner UI to build. If a library ever grows into the tens of
 * thousands of files, this would need revisiting (lazy expansion, or at
 * least streaming/chunking the walk) - that's out of scope here.
 *
 * Directories that fail to read (permission errors, broken symlinks,
 * etc.) are skipped rather than aborting the whole walk, so one bad
 * subfolder doesn't prevent the rest of the library from opening.
 */
export async function listDirectoryTree(rootPath: string): Promise<FileTreeNode[]> {
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(rootPath, { withFileTypes: true })
  } catch {
    return []
  }

  const nodes: FileTreeNode[] = []
  for (const entry of entries) {
    const kind = entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : null
    if (kind === null) continue // skip symlinks/sockets/etc.
    if (!shouldIncludeEntry(entry.name, kind)) continue

    const entryPath = join(rootPath, entry.name)
    if (kind === 'directory') {
      const children = await listDirectoryTree(entryPath)
      nodes.push({ path: entryPath, name: entry.name, kind, children })
    } else {
      nodes.push({ path: entryPath, name: entry.name, kind })
    }
  }

  return sortFileTreeNodes(nodes)
}
