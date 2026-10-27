import { describe, expect, it } from 'vitest'
import { computeMatrixCount, parseMatrix } from './matrix'

describe('matrix expansion', () => {
  it('multiplies simple dimensions', () => {
    const matrix = parseMatrix({
      node: [20, 22, 24],
      os: ['ubuntu-latest', 'windows-latest'],
    })
    expect(matrix?.dimensions).toEqual({
      node: ['20', '22', '24'],
      os: ['ubuntu-latest', 'windows-latest'],
    })
    expect(matrix?.count).toBe(6)
    expect(matrix?.dynamic).toBe(false)
  })

  it('returns null for a missing matrix', () => {
    expect(parseMatrix(undefined)).toBeNull()
    expect(parseMatrix(null)).toBeNull()
  })

  it('marks expression matrices as dynamic', () => {
    const matrix = parseMatrix("${{ fromJSON(needs.setup.outputs.matrix) }}")
    expect(matrix?.dynamic).toBe(true)
    expect(matrix?.count).toBeNull()

    const object = parseMatrix({ node: '${{ fromJSON(vars.NODES) }}' })
    expect(object?.dynamic).toBe(true)
    expect(object?.count).toBeNull()
  })

  it('subtracts excluded combinations', () => {
    const matrix = parseMatrix({
      os: ['ubuntu-latest', 'windows-latest'],
      node: [20, 22],
      exclude: [
        { os: 'windows-latest', node: 20 },
        { os: 'ubuntu-latest', node: 22 },
      ],
    })
    expect(matrix?.count).toBe(2)
  })

  it('does not add jobs for include entries that merge', () => {
    const matrix = parseMatrix({
      node: [20, 22],
      include: [
        { experimental: true },
        { node: 22, coverage: true },
      ],
    })
    expect(matrix?.count).toBe(2)
  })

  it('adds jobs for include entries that cannot merge', () => {
    const matrix = parseMatrix({
      node: [20, 22],
      include: [{ node: 24, experimental: true }],
    })
    expect(matrix?.count).toBe(3)
  })

  it('handles an empty dimension as zero jobs', () => {
    const matrix = parseMatrix({ node: [] })
    expect(matrix?.count).toBe(0)
  })

  it('keeps a conservative count for large matrices', () => {
    const dimensions = {
      a: Array.from({ length: 30 }, (_, index) => String(index)),
      b: Array.from({ length: 30 }, (_, index) => String(index)),
      c: Array.from({ length: 30 }, (_, index) => String(index)),
      d: Array.from({ length: 30 }, (_, index) => String(index)),
    }
    const count = computeMatrixCount({
      dimensions,
      include: [],
      exclude: [],
      dynamic: false,
    })
    expect(count).toBe(810_000)
  })

  it('stringifies numbers, booleans and objects for labels', () => {
    const matrix = parseMatrix({
      node: 22,
      flag: true,
      config: { shard: 1 },
    })
    expect(matrix?.dynamic).toBe(true)
  })
})
