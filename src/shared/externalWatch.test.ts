import { describe, expect, it } from 'vitest'
import {
  coalesceEvents,
  computeEtag,
  decideExternalChangeAction,
  isExternalChange,
  isTempFileName,
  type RawWatchEvent
} from './externalWatch'

describe('computeEtag', () => {
  it('encodes mtime in base 29 and size in base 31, concatenated', () => {
    const etag = computeEtag({ mtimeMs: 1700000000000, size: 1234 })
    expect(etag).toBe((1700000000000).toString(29) + (1234).toString(31))
  })

  it('produces the same etag for the same (mtime, size) pair', () => {
    const a = computeEtag({ mtimeMs: 123456, size: 42 })
    const b = computeEtag({ mtimeMs: 123456, size: 42 })
    expect(a).toBe(b)
  })

  it('produces different etags when mtime differs', () => {
    const a = computeEtag({ mtimeMs: 123456, size: 42 })
    const b = computeEtag({ mtimeMs: 123457, size: 42 })
    expect(a).not.toBe(b)
  })

  it('produces different etags when size differs', () => {
    const a = computeEtag({ mtimeMs: 123456, size: 42 })
    const b = computeEtag({ mtimeMs: 123456, size: 43 })
    expect(a).not.toBe(b)
  })
})

describe('isExternalChange', () => {
  it('is false when the disk etag matches the known etag (our own save just landed)', () => {
    expect(isExternalChange('abc123', 'abc123')).toBe(false)
  })

  it('is true when the disk etag differs from the known etag', () => {
    expect(isExternalChange('abc123', 'def456')).toBe(true)
  })

  it('is true when there is no known etag yet (file never read/written by us)', () => {
    expect(isExternalChange(null, 'def456')).toBe(true)
  })
})

describe('isTempFileName', () => {
  it.each([
    '~$notes.docx',
    '~$Document1.md',
    'notes.md.tmp',
    'foo.tmp',
    '.~lock.notes.md#',
    '.~lock.notes.odt#'
  ])('flags %s as a temp/lock file', (name) => {
    expect(isTempFileName(name)).toBe(true)
  })

  it.each(['notes.md', 'README.md', 'image.png', 'tmpfile.md', 'notes.md.bak'])(
    'does not flag %s as a temp/lock file',
    (name) => {
      expect(isTempFileName(name)).toBe(false)
    }
  )
})

describe('coalesceEvents', () => {
  const evt = (type: RawWatchEvent['type'], path: string, timestamp: number): RawWatchEvent => ({
    type,
    path,
    timestamp
  })

  it('collapses multiple change events for the same path into one updated', () => {
    const result = coalesceEvents([
      evt('change', '/lib/notes.md', 0),
      evt('change', '/lib/notes.md', 20),
      evt('change', '/lib/notes.md', 40)
    ])
    expect(result).toEqual([{ type: 'updated', path: '/lib/notes.md' }])
  })

  it('emits a plain delete when unlink has no matching add within the debounce window', () => {
    const result = coalesceEvents([evt('unlink', '/lib/notes.md', 0)], 100)
    expect(result).toEqual([{ type: 'deleted', path: '/lib/notes.md' }])
  })

  it('merges unlink+add for the same path within the debounce window into a single updated (Windows rename split, criterion #7)', () => {
    const result = coalesceEvents(
      [evt('unlink', '/lib/notes.md', 0), evt('add', '/lib/notes.md', 40)],
      100
    )
    expect(result).toEqual([{ type: 'updated', path: '/lib/notes.md' }])
  })

  it('treats unlink+add as a real delete when the add arrives after the debounce window', () => {
    const result = coalesceEvents(
      [evt('unlink', '/lib/notes.md', 0), evt('add', '/lib/notes.md', 500)],
      100
    )
    // In production each live debounce window is flushed independently,
    // so this scenario (an add arriving 500ms after the unlink) would
    // normally be split across two separate `coalesceEvents` calls by
    // the caller's timer. Fed as a single batch here, the timestamp math
    // still applies directly: the add is outside the delete's
    // debounceMs window, so it doesn't rescue the delete - this is a
    // real delete, full stop.
    expect(result).toEqual([{ type: 'deleted', path: '/lib/notes.md' }])
  })

  it('handles multiple independent paths in the same window', () => {
    const result = coalesceEvents([
      evt('change', '/lib/a.md', 0),
      evt('unlink', '/lib/b.md', 0),
      evt('add', '/lib/c.md', 10)
    ])
    expect(result.sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { type: 'updated', path: '/lib/a.md' },
      { type: 'deleted', path: '/lib/b.md' },
      { type: 'updated', path: '/lib/c.md' }
    ])
  })

  it('handles delete-after-resurrect: unlink, add (merge), then a later real unlink outside the window', () => {
    const result = coalesceEvents(
      [evt('unlink', '/lib/notes.md', 0), evt('add', '/lib/notes.md', 10), evt('unlink', '/lib/notes.md', 300)],
      100
    )
    expect(result).toEqual([{ type: 'deleted', path: '/lib/notes.md' }])
  })

  it('uses a custom debounce window (e.g. 300ms for cloud-sync folders)', () => {
    const result = coalesceEvents(
      [evt('unlink', '/lib/notes.md', 0), evt('add', '/lib/notes.md', 250)],
      300
    )
    expect(result).toEqual([{ type: 'updated', path: '/lib/notes.md' }])
  })
})

describe('decideExternalChangeAction', () => {
  it('silently reloads when there is no local dirty state and the file was updated externally', () => {
    expect(decideExternalChangeAction(false, 'updated')).toEqual({ kind: 'silent-reload' })
  })

  it('opens the conflict dialog when local changes are unsaved and the file was updated externally', () => {
    expect(decideExternalChangeAction(true, 'updated')).toEqual({ kind: 'conflict-dialog' })
  })

  it('marks the tab deleted when the file was deleted externally and there are no local changes', () => {
    expect(decideExternalChangeAction(false, 'deleted')).toEqual({ kind: 'mark-deleted' })
  })

  it('marks the tab deleted when the file was deleted externally even with local unsaved changes', () => {
    expect(decideExternalChangeAction(true, 'deleted')).toEqual({ kind: 'mark-deleted' })
  })
})
