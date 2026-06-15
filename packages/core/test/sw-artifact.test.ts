import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The shipped SW MUST be a classic IIFE: a Service Worker cannot use runtime
// import() (w3c/ServiceWorker#1356). This test fails loudly if a build change
// reintroduces ES-module syntax or fails to inline the codecs.
const SW = resolve(__dirname, '../dist/tiff-sw.js')

describe('built tiff-sw.js artifact', () => {
  it('exists after the tsup build', () => {
    expect(existsSync(SW)).toBe(true)
  })

  it('is a classic script — no bare import/export statements', () => {
    const code = readFileSync(SW, 'utf8')
    // No top-level ES module syntax. (Substrings like "exports" inside minified
    // identifiers are fine; we match statement-like occurrences.)
    expect(code).not.toMatch(/\bimport\s*[*{]/)
    expect(code).not.toMatch(/\bimport\s+["']/)
    expect(code).not.toMatch(/\bexport\s*[{*]/)
    expect(code).not.toMatch(/\bexport\s+(default|const|function|class)\b/)
  })

  it('inlines the decoders (utif + geotiff) rather than importing them', () => {
    const code = readFileSync(SW, 'utf8')
    expect(code).not.toMatch(/import\(/) // no dynamic import survived bundling
    expect(code.length).toBeGreaterThan(50_000) // codecs are actually inlined
  })
})
