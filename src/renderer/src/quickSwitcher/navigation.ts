/**
 * Ticket #21 scope: pure index arithmetic for the quick switcher's
 * ↑/↓ keyboard navigation (acceptance criterion #4).
 *
 * Wraps around (cycling): pressing ↓ on the last item goes back to the
 * first, and ↑ on the first item wraps to the last. This matches most
 * "quick open" pickers (VS Code's Ctrl+P, Sublime's Goto Anything) and
 * feels more predictable than clamping - clamping means holding ↓ just
 * gets "stuck" at the bottom, which reads as broken rather than
 * intentional, whereas wrapping always does *something* visible.
 */

/** Returns the next index after pressing ↓, wrapping past the last item to the first. */
export function nextIndex(currentIndex: number, resultCount: number): number {
  if (resultCount === 0) return -1
  if (currentIndex < 0) return 0
  return (currentIndex + 1) % resultCount
}

/** Returns the next index after pressing ↑, wrapping past the first item to the last. */
export function prevIndex(currentIndex: number, resultCount: number): number {
  if (resultCount === 0) return -1
  if (currentIndex < 0) return resultCount - 1
  return (currentIndex - 1 + resultCount) % resultCount
}

/**
 * Clamps a selection index to a valid range for a (possibly changed)
 * result count - used when the result list is re-filtered as the user
 * types, so a previously-valid selection doesn't point past the end of a
 * now-shorter list. Returns -1 (no selection) if the list is empty,
 * otherwise 0 if the previous index is out of range, else the unchanged
 * index.
 */
export function clampIndex(currentIndex: number, resultCount: number): number {
  if (resultCount === 0) return -1
  if (currentIndex < 0 || currentIndex >= resultCount) return 0
  return currentIndex
}
