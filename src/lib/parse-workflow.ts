import { parse } from 'yaml'
import type {
  Job,
  MatrixInfo,
  ParseResult,
  PermissionSet,
  Step,
  TriggerInfo,
  Workflow,
} from '../types'
import { parseMatrix } from './matrix'

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null || value === undefined) return ''
  return JSON.stringify(value)
}

function normalizeStringList(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) {
    return value.map(asString).filter((item): item is string => Boolean(item))
  }
  return []
}

function normalizeEnv(value: unknown): Record<string, string | null> {
  const env: Record<string, string | null> = {}
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== 'string') continue
      const separator = entry.indexOf('=')
      if (separator === -1) env[entry] = null
      else env[entry.slice(0, separator)] = entry.slice(separator + 1)
    }
    return env
  }

  const record = asRecord(value)
  if (!record) return env
  for (const [key, raw] of Object.entries(record)) {
    env[key] = raw === null || raw === undefined ? null : stringify(raw)
  }
  return env
}

function normalizePermissions(value: unknown): PermissionSet | undefined {
  if (typeof value === 'string') {
    if (value === 'read-all' || value === 'write-all') return { all: value, scopes: {} }
    return { scopes: {} }
  }
  const record = asRecord(value)
  if (!record) return undefined
  const scopes: Record<string, string> = {}
  for (const [key, raw] of Object.entries(record)) {
    scopes[key] = stringify(raw)
  }
  return { scopes }
}

function parseTriggers(value: unknown): TriggerInfo {
  const events: string[] = []
  const schedules: string[] = []

  if (typeof value === 'string') {
    events.push(value)
  } else if (Array.isArray(value)) {
    for (const entry of value) {
      const name = asString(entry)
      if (name) events.push(name)
    }
  } else {
    const record = asRecord(value)
    if (record) {
      for (const [name, config] of Object.entries(record)) {
        events.push(name)
        if (name === 'schedule') {
          const entries = Array.isArray(config) ? config : [config]
          for (const entry of entries) {
            const cron = asString(asRecord(entry)?.cron)
            if (cron) schedules.push(cron)
          }
        }
      }
    }
  }

  return { events: [...new Set(events)], schedules }
}

function normalizeWith(value: unknown): Record<string, string> {
  const record = asRecord(value)
  if (!record) return {}
  const withValues: Record<string, string> = {}
  for (const [key, raw] of Object.entries(record)) {
    withValues[key] = stringify(raw)
  }
  return withValues
}

function parseSteps(value: unknown): Step[] {
  if (!Array.isArray(value)) return []
  const steps: Step[] = []
  value.forEach((raw, index) => {
    const record = asRecord(raw)
    if (!record) return
    steps.push({
      index,
      name: asString(record.name),
      uses: asString(record.uses)?.trim(),
      run: asString(record.run),
      with: normalizeWith(record.with),
      env: normalizeEnv(record.env),
      continueOnError: record['continue-on-error'] === true,
    })
  })
  return steps
}

function parseJob(id: string, value: unknown): Job | null {
  const record = asRecord(value)
  if (!record) return null

  const strategy = asRecord(record.strategy)
  let matrix: MatrixInfo | null = null
  if (strategy && 'matrix' in strategy) {
    matrix = parseMatrix(strategy.matrix)
  }

  const timeoutRaw = record['timeout-minutes']
  const timeout =
    typeof timeoutRaw === 'number'
      ? timeoutRaw
      : typeof timeoutRaw === 'string' && /^\d+$/.test(timeoutRaw)
        ? Number(timeoutRaw)
        : undefined

  return {
    id,
    name: asString(record.name),
    needs: normalizeStringList(record.needs),
    runsOn: normalizeStringList(record['runs-on']),
    steps: parseSteps(record.steps),
    env: normalizeEnv(record.env),
    permissions: normalizePermissions(record.permissions),
    matrix,
    timeoutMinutes: timeout,
    uses: asString(record.uses)?.trim(),
    secretsInherit:
      record.secrets === 'inherit' || asRecord(record.secrets)?.inherit === true,
    condition: asString(record.if),
  }
}

export function parseWorkflow(text: string, sourceName?: string): ParseResult {
  if (!text.trim()) {
    return { workflow: null, error: 'Paste a workflow file or drop one to get started.' }
  }

  let document: unknown
  try {
    document = parse(text, { strict: true, uniqueKeys: true })
  } catch (error) {
    return {
      workflow: null,
      error: error instanceof Error ? error.message : 'Could not parse this YAML file.',
    }
  }

  const root = asRecord(document)
  if (!root) {
    return { workflow: null, error: 'A workflow file must be a YAML object.' }
  }

  // YAML 1.1 parsers turn the unquoted `on` key into boolean true. The `yaml`
  // package defaults to 1.2, but accept both shapes for files pasted from
  // other tools.
  const triggerValue = root.on ?? root.true
  const jobsRecord = asRecord(root.jobs)
  if (!jobsRecord || Object.keys(jobsRecord).length === 0) {
    return {
      workflow: null,
      error: 'No jobs found. Add a jobs: block with at least one job.',
    }
  }

  const jobs: Job[] = []
  for (const [id, value] of Object.entries(jobsRecord)) {
    const job = parseJob(id, value)
    if (!job) {
      return {
        workflow: null,
        error: `Job "${id}" must be a YAML object with a runs-on or uses field.`,
      }
    }
    jobs.push(job)
  }

  const concurrencyRaw = root.concurrency
  const concurrencyRecord = asRecord(concurrencyRaw)
  const concurrency = asString(concurrencyRaw)
    ? asString(concurrencyRaw)
    : concurrencyRecord
      ? asString(concurrencyRecord.group) ?? 'configured'
      : undefined

  const workflow: Workflow = {
    name: asString(root.name),
    sourceName,
    triggers: parseTriggers(triggerValue),
    permissions: normalizePermissions(root.permissions),
    env: normalizeEnv(root.env),
    concurrency,
    jobs,
  }

  return { workflow, error: null }
}
