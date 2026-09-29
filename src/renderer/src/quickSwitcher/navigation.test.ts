import { describe, expect, it } from 'vitest'
import { nextIndex, prevIndex, clampIndex } from './navigation'

describe('nextIndex (Down arrow)', () => {
  it('selects the first item when nothing is selected yet', () => {
    expect(nextIndex(-1, 5)).toBe(0)
  })

  it('advances by one', () => {
    expect(nextIndex(0, 5)).toBe(1)
    expect(nextIndex(3, 5)).toBe(4)
  })

  it('wraps from the last item back to the first', () => {
    expect(nextIndex(4, 5)).toBe(0)
  })

  it('returns -1 when there are no results', () => {
    expect(nextIndex(-1, 0)).toBe(-1)
    expect(nextIndex(2, 0)).toBe(-1)
  })
})

describe('prevIndex (Up arrow)', () => {
  it('selects the last item when nothing is selected yet', () => {
    expect(prevIndex(-1, 5)).toBe(4)
  })

  it('goes back by one', () => {
    expect(prevIndex(4, 5)).toBe(3)
    expect(prevIndex(1, 5)).toBe(0)
  })

  it('wraps from the first item to the last', () => {
    expect(prevIndex(0, 5)).toBe(4)
  })

  it('returns -1 when there are no results', () => {
    expect(prevIndex(-1, 0)).toBe(-1)
    expect(prevIndex(2, 0)).toBe(-1)
  })
})

describe('clampIndex', () => {
  it('returns -1 when the result list is empty', () => {
    expect(clampIndex(2, 0)).toBe(-1)
  })

  it('resets to 0 when the previous index is now out of range', () => {
    expect(clampIndex(7, 3)).toBe(0)
    expect(clampIndex(-1, 3)).toBe(0)
  })

  it('keeps the index unchanged when still in range', () => {
    expect(clampIndex(1, 3)).toBe(1)
  })
})
