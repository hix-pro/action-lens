import type { MatrixInfo } from '../types'

type Combination = Record<string, string>

const MAX_COMBINATIONS = 10_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null) return 'null'
  return JSON.stringify(value)
}

function normalizeEntries(value: unknown): Record<string, string>[] | null {
  if (!Array.isArray(value)) return null
  return value.map((entry) =>
    isRecord(entry)
      ? Object.fromEntries(
          Object.entries(entry).map(([key, item]) => [key, stringify(item)]),
        )
      : {},
  )
}

function matches(combination: Combination, filter: Record<string, string>): boolean {
  return Object.entries(filter).every(
    ([key, value]) => combination[key] === value,
  )
}

function expandDimensions(
  dimensions: Record<string, string[]>,
): Combination[] | null {
  const keys = Object.keys(dimensions)
  if (keys.length === 0) return []

  let combinations: Combination[] = [{}]
  for (const key of keys) {
    const values = dimensions[key] ?? []
    if (values.length === 0) return []
    const next: Combination[] = []
    for (const combination of combinations) {
      for (const value of values) {
        next.push({ ...combination, [key]: value })
        if (next.length > MAX_COMBINATIONS) return null
      }
    }
    combinations = next
  }
  return combinations
}

/**
 * Computes a best-effort matrix expansion count using GitHub's documented
 * include/exclude behaviour. Expressions make the result unknowable ahead of
 * time, so those matrices are marked dynamic and the count is null.
 */
export function computeMatrixCount(info: {
  dimensions: Record<string, string[]>
  include: Record<string, string>[]
  exclude: Record<string, string>[]
  dynamic: boolean
}): number | null {
  if (info.dynamic) return null

  const base = expandDimensions(info.dimensions)
  if (base === null) {
    // Too large to materialize; use a size calculation instead.
    const product = Object.values(info.dimensions).reduce(
      (total, values) => total * values.length,
      1,
    )
    if (product > MAX_COMBINATIONS) {
      return Math.max(0, product - info.exclude.length) + countNewIncludes(info)
    }
    return null
  }

  const kept = base.filter(
    (combination) => !info.exclude.some((filter) => matches(combination, filter)),
  )

  let count = kept.length
  const additions = countNewIncludes(info)
  count += additions
  return count
}

function countNewIncludes(info: {
  include: Record<string, string>[]
  dimensions: Record<string, string[]>
}): number {
  if (info.include.length === 0) return 0

  // GitHub merges include entries into existing combinations when the
  // combination's keys do not conflict. If none can accept an entry, it becomes
  // an extra combination. Count additions conservatively.
  const dimensions = Object.keys(info.dimensions)
  let additions = 0

  for (const include of info.include) {
    const keys = Object.keys(include).filter((key) => dimensions.includes(key))
    if (keys.length === 0) {
      // Extra keys are merged into existing combinations; no new job.
      continue
    }
    const compatible = keys.every((key) =>
      (info.dimensions[key] ?? []).includes(include[key] ?? ''),
    )
    if (!compatible) additions += 1
  }

  return additions
}

export function parseMatrix(value: unknown): MatrixInfo | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') {
    return {
      dimensions: {},
      include: [],
      exclude: [],
      dynamic: value.includes('${{'),
      count: null,
    }
  }
  if (!isRecord(value)) {
    return { dimensions: {}, include: [], exclude: [], dynamic: true, count: null }
  }

  const dimensions: Record<string, string[]> = {}
  let dynamic = false
  let include: Record<string, string>[] = []
  let exclude: Record<string, string>[] = []

  for (const [key, raw] of Object.entries(value)) {
    if (key === 'include') {
      const entries = normalizeEntries(raw)
      if (entries === null) {
        dynamic = true
      } else {
        include = entries
        if (entries.some((entry) => Object.values(entry).some(hasExpression))) {
          dynamic = true
        }
      }
      continue
    }
    if (key === 'exclude') {
      const entries = normalizeEntries(raw)
      if (entries === null) {
        dynamic = true
      } else {
        exclude = entries
      }
      continue
    }

    if (!Array.isArray(raw)) {
      dynamic = true
      continue
    }
    const values = raw.map(stringify)
    if (values.some(hasExpression)) dynamic = true
    dimensions[key] = values
  }

  return {
    dimensions,
    include,
    exclude,
    dynamic,
    count: computeMatrixCount({ dimensions, include, exclude, dynamic }),
  }
}

export function hasExpression(value: string): boolean {
  return value.includes('${{')
}
