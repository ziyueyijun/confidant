import { describe, expect, it, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { watchLibrary, type ExternalWatchHandle } from './externalWatch'
import type { CoalescedEvent } from '../shared/externalWatch'

/**
 * Ticket #20: real-filesystem smoke tests for `watchLibrary`.
 *
 * IMPORTANT SCOPE NOTE: this suite exercises the real chokidar watcher
 * against a real temp directory on whatever machine/OS runs the test, so
 * it is inherently less deterministic than the pure-function unit tests
 * in `src/shared/externalWatch.test.ts` (which use a fake clock and
 * synthetic event batches - those are the actual regression coverage for
 * the coalescing/rename-split-merge/etag rules). These tests instead
 * verify the wiring end-to-end: does a real write reach
 * `onExternalChange`, does noteOwnWrite actually suppress our own
 * writes, does a real delete get reported. Timeouts here are generous
 * (real debounce + OS event latency + polling overhead) and assertions
 * only check that the right *kind* of event eventually arrives, not
 * exact timing - flaky-by-timing-precision is exactly what we're
 * avoiding per the ticket's guidance on this being a technically risky
 * area to test.
 *
 * Explicitly NOT covered here (would require a real Windows environment
 * with a slow/networked/cloud-synced folder to reliably reproduce): the
 * literal "chokidar delivers unlink then add as two separate native
 * events for a same-path rename" scenario. Manual smoke testing against
 * real chokidar on this development machine (Windows 11, local NTFS
 * disk) showed that a fast unlink+recreate at the same path is often
 * already collapsed into a single `change` event by chokidar/the OS's
 * own native watcher before it reaches our listeners - so the JS-level
 * rename-split merge in `shared/externalWatch.ts` is a defensive
 * fallback for slower disks/network shares/cloud-sync clients where the
 * split *does* surface as two distinct events, not something this local
 * setup could force to happen. That merge logic's correctness is
 * verified by the fake-clock unit tests instead.
 */

async function waitFor(predicate: () => boolean, timeoutMs = 5000, pollMs = 50): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
  throw new Error('waitFor: condition not met within timeout')
}

describe('watchLibrary (real filesystem smoke tests)', () => {
  let dir: string
  let handle: ExternalWatchHandle | null = null

  afterEach(async () => {
    await handle?.close()
    handle = null
    if (dir) await fs.rm(dir, { recursive: true, force: true })
  })

  it('reports an external write to a file it did not know about as updated', async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'cf-watch-test-'))
    const filePath = join(dir, 'notes.md')
    await fs.writeFile(filePath, 'original')

    const events: CoalescedEvent[] = []
    handle = watchLibrary(dir, { onExternalChange: (e) => events.push(e) })

    // Give chokidar time to finish its initial directory scan before we
    // make a change, so the change isn't swallowed by ignoreInitial's
    // startup window.
    await new Promise((resolve) => setTimeout(resolve, 300))

    await fs.writeFile(filePath, 'changed externally')

    await waitFor(() => events.some((e) => e.path === filePath && e.type === 'updated'))
  }, 10000)

  it('does not report a write as external once noteOwnWrite has recorded its etag', async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'cf-watch-test-'))
    const filePath = join(dir, 'notes.md')
    await fs.writeFile(filePath, 'original')

    const events: CoalescedEvent[] = []
    handle = watchLibrary(dir, { onExternalChange: (e) => events.push(e) })
    await new Promise((resolve) => setTimeout(resolve, 300))

    // Simulate the app's own atomic write sequence (fileSystem.ts
    // writeFileAtomic): write new content, stat it, tell the watcher
    // this etag is "ours" - all before chokidar's event for this write
    // has necessarily fired.
    const newContent = 'saved by the app itself'
    await fs.writeFile(filePath, newContent)
    const stat = await fs.stat(filePath)
    const { computeEtag } = await import('../shared/externalWatch')
    handle.noteOwnWrite(filePath, computeEtag(stat))

    // Give the debounce window + a margin fully elapse, then assert no
    // external-change event fired for this path.
    await new Promise((resolve) => setTimeout(resolve, 800))
    expect(events.some((e) => e.path === filePath)).toBe(false)
  }, 10000)

  it('reports an external delete as deleted', async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'cf-watch-test-'))
    const filePath = join(dir, 'notes.md')
    await fs.writeFile(filePath, 'original')

    const events: CoalescedEvent[] = []
    handle = watchLibrary(dir, { onExternalChange: (e) => events.push(e) })
    await new Promise((resolve) => setTimeout(resolve, 300))

    await fs.unlink(filePath)

    await waitFor(() => events.some((e) => e.path === filePath && e.type === 'deleted'))
  }, 10000)

  it('ignores changes to temp/lock files matching the filter patterns', async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'cf-watch-test-'))
    const tmpFilePath = join(dir, 'notes.md.tmp')

    const events: CoalescedEvent[] = []
    handle = watchLibrary(dir, { onExternalChange: (e) => events.push(e) })
    await new Promise((resolve) => setTimeout(resolve, 300))

    await fs.writeFile(tmpFilePath, 'scratch')
    await new Promise((resolve) => setTimeout(resolve, 800))

    expect(events.some((e) => e.path === tmpFilePath)).toBe(false)
  }, 10000)
})
