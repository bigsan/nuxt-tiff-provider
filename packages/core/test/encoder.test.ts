import { describe, expect, it } from 'vitest'
import { fitDimensions } from '../src/encoder'

describe('fitDimensions', () => {
  it('keeps source dimensions when no target is given', () => {
    expect(fitDimensions(1000, 500)).toEqual({ width: 1000, height: 500 })
  })

  it('scales by width (aspect preserved) when only width is given', () => {
    expect(fitDimensions(1000, 500, 640)).toEqual({ width: 640, height: 320 })
  })

  it('scales by height (aspect preserved) when only height is given', () => {
    expect(fitDimensions(1000, 500, undefined, 200)).toEqual({ width: 400, height: 200 })
  })

  it('fits inside the w×h box using the stricter ratio (no crop)', () => {
    expect(fitDimensions(1000, 500, 640, 200)).toEqual({ width: 400, height: 200 })
  })

  it('never upscales beyond source', () => {
    expect(fitDimensions(1000, 500, 2000, 2000)).toEqual({ width: 1000, height: 500 })
  })

  it('clamps each axis to at least 1px', () => {
    expect(fitDimensions(1000, 10, 1)).toEqual({ width: 1, height: 1 })
  })
})
