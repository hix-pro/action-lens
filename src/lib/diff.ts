import type {
  Analysis,
  Finding,
  Job,
  MatrixInfo,
  PermissionSet,
  Severity,
  Step,
  Workflow,
} from '../types'

export interface FieldChange {
  field: string
  before: string
  after: string
}

export interface JobChange {
  id: string
  changes: FieldChange[]
}

export interface StepRef {
  job: string
  label: string
}

export interface StepChange extends StepRef {
  index: number
  changes: FieldChange[]
}

export interface WorkflowDiff {
  workflow: FieldChange[]
  jobs: {
    added: string[]
    removed: string[]
    changed: JobChange[]
  }
  steps: {
    added: StepRef[]
    removed: StepRef[]
    changed: StepChange[]
  }
  findings: {
    introduced: Finding[]
    resolved: Finding[]
    changed: { key: string; before: Finding; after: Finding }[]
  }
  counts: {
    jobsAdded: number
    jobsRemoved: number
    jobsChanged: number
    stepsAdded: number
    stepsRemoved: number
    findingsIntroduced: number
    findingsResolved: number
  }
  hasChanges: boolean
}

const SECRET_KEY = /(secret|token|passw|api[_-]?key|private[_-]?key|credential|auth)/i
const TOKEN_PATTERN =
  /(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk_live_[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{16})/
const EXPRESSION = /\$\{\{.*?\}\}/

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function displayValue(key: string, value: string | null): string {
  if (value === null) return '(from context)'
  if (TOKEN_PATTERN.test(value)) return '•••• (hidden)'
  if (SECRET_KEY.test(key) && !EXPRESSION.test(value) && value.trim()) {
    return '•••• (hidden)'
  }
  return value
}

function scalarChange(
  field: string,
  before: string | undefined,
  after: string | undefined,
): FieldChange[] {
  const beforeText = before === undefined || before === '' ? '—' : before
  const afterText = after === undefined || after === '' ? '—' : after
  if (beforeText === afterText) return []
  return [{ field, before: beforeText, after: afterText }]
}

function permissionText(permissions?: PermissionSet): string {
  if (!permissions) return 'default'
  if (permissions.all) return permissions.all
  const scopes = sorted(Object.keys(permissions.scopes))
  if (scopes.length === 0) return 'configured'
  return scopes.map((scope) => `${scope}: ${permissions.scopes[scope]}`).join(', ')
}

function permissionChanges(
  before?: PermissionSet,
  after?: PermissionSet,
): FieldChange[] {
  const changes: FieldChange[] = []
  if ((before?.all ?? '') !== (after?.all ?? '')) {
    changes.push({
      field: 'permissions',
      before: before?.all ?? 'default',
      after: after?.all ?? 'default',
    })
  }
  const scopes = sorted(
    new Set([
      ...Object.keys(before?.scopes ?? {}),
      ...Object.keys(after?.scopes ?? {}),
    ]),
  )
  for (const scope of scopes) {
    const had = Object.prototype.hasOwnProperty.call(before?.scopes ?? {}, scope)
    const has = Object.prototype.hasOwnProperty.call(after?.scopes ?? {}, scope)
    const beforeValue = had ? before?.scopes[scope] ?? '—' : 'default'
    const afterValue = has ? after?.scopes[scope] ?? '—' : 'default'
    if (beforeValue !== afterValue) {
      changes.push({
        field: `permissions.${scope}`,
        before: beforeValue,
        after: afterValue,
      })
    }
  }
  if (changes.length === 0 && permissionText(before) !== permissionText(after)) {
    changes.push({
      field: 'permissions',
      before: permissionText(before),
      after: permissionText(after),
    })
  }
  return changes
}

function envChanges(
  prefix: string,
  before: Record<string, string | null>,
  after: Record<string, string | null>,
): FieldChange[] {
  const changes: FieldChange[] = []
  for (const key of sorted(new Set([...Object.keys(before), ...Object.keys(after)]))) {
    const had = Object.prototype.hasOwnProperty.call(before, key)
    const has = Object.prototype.hasOwnProperty.call(after, key)
    if (!had) {
      changes.push({
        field: `${prefix}.${key}`,
        before: '—',
        after: displayValue(key, after[key]),
      })
      continue
    }
    if (!has) {
      changes.push({
        field: `${prefix}.${key}`,
        before: displayValue(key, before[key]),
        after: '—',
      })
      continue
    }
    if (before[key] !== after[key]) {
      changes.push({
        field: `${prefix}.${key}`,
        before: displayValue(key, before[key]),
        after: displayValue(key, after[key]),
      })
    }
  }
  return changes
}

function matrixText(matrix: MatrixInfo | null): string {
  if (!matrix) return 'none'
  if (matrix.dynamic) return 'dynamic'
  return `${matrix.count ?? 1} instance${matrix.count === 1 ? '' : 's'}`
}

function matrixChanges(before: MatrixInfo | null, after: MatrixInfo | null): FieldChange[] {
  const changes: FieldChange[] = []
  const beforeText = matrixText(before)
  const afterText = matrixText(after)
  if (beforeText !== afterText) {
    changes.push({ field: 'matrix', before: beforeText, after: afterText })
  }
  const dimensions = sorted(
    new Set([
      ...Object.keys(before?.dimensions ?? {}),
      ...Object.keys(after?.dimensions ?? {}),
    ]),
  )
  for (const dimension of dimensions) {
    const beforeValues = before?.dimensions[dimension] ?? []
    const afterValues = after?.dimensions[dimension] ?? []
    if (beforeValues.join('\u0000') !== afterValues.join('\u0000')) {
      changes.push({
        field: `matrix.${dimension}`,
        before: beforeValues.length > 0 ? beforeValues.join(', ') : '—',
        after: afterValues.length > 0 ? afterValues.join(', ') : '—',
      })
    }
  }
  return changes
}

function stepLabel(step: Step): string {
  return step.name ?? step.uses ?? `Step ${step.index + 1}`
}

function stepIdentity(step: Step): string {
  if (step.uses) return `uses:${step.uses}`
  if (step.name) return `name:${step.name}`
  return 'run'
}

function matchSteps(before: Step[], after: Step[]): {
  pairs: { before: Step; after: Step }[]
  added: Step[]
  removed: Step[]
} {
  const remaining = [...before]
  const pairs: { before: Step; after: Step }[] = []
  const added: Step[] = []
  const unmatched: Step[] = []

  for (const step of after) {
    const identity = stepIdentity(step)
    const index = remaining.findIndex((candidate) => stepIdentity(candidate) === identity)
    if (index === -1) {
      unmatched.push(step)
    } else {
      pairs.push({ before: remaining[index], after: step })
      remaining.splice(index, 1)
    }
  }

  // An action version bump changes `uses` but keeps the step name. Pair those
  // by name so the diff shows a field change instead of an add plus a remove.
  for (const step of unmatched) {
    const index = step.name
      ? remaining.findIndex((candidate) => candidate.name === step.name)
      : -1
    if (index === -1) {
      added.push(step)
    } else {
      pairs.push({ before: remaining[index], after: step })
      remaining.splice(index, 1)
    }
  }

  return { pairs, added, removed: remaining }
}

function stepChanges(before: Step, after: Step, job: string): StepChange | null {
  const changes: FieldChange[] = [
    ...scalarChange('name', before.name, after.name),
    ...scalarChange('uses', before.uses, after.uses),
    ...scalarChange(
      'continue-on-error',
      before.continueOnError ? 'true' : 'false',
      after.continueOnError ? 'true' : 'false',
    ),
    ...envChanges('env', before.env, after.env),
    ...envChanges('with', before.with, after.with),
  ]

  if (before.run !== after.run) {
    changes.push({
      field: 'run',
      before: before.run === undefined ? '—' : 'script',
      after: after.run === undefined ? '—' : 'script changed (hidden)',
    })
  }

  if (changes.length === 0) return null
  return {
    job,
    index: after.index,
    label: stepLabel(after),
    changes,
  }
}

function jobChanges(before: Job, after: Job): FieldChange[] {
  const changes: FieldChange[] = [
    ...scalarChange('name', before.name, after.name),
    ...scalarChange('uses', before.uses, after.uses),
    ...scalarChange(
      'runs-on',
      sorted(before.runsOn).join(', '),
      sorted(after.runsOn).join(', '),
    ),
    ...scalarChange(
      'needs',
      sorted(before.needs).join(', '),
      sorted(after.needs).join(', '),
    ),
    ...scalarChange(
      'timeout-minutes',
      before.timeoutMinutes?.toString(),
      after.timeoutMinutes?.toString(),
    ),
    ...scalarChange(
      'secrets',
      before.secretsInherit ? 'inherit' : undefined,
      after.secretsInherit ? 'inherit' : undefined,
    ),
    ...scalarChange('if', before.condition, after.condition),
    ...permissionChanges(before.permissions, after.permissions),
    ...envChanges('env', before.env, after.env),
    ...matrixChanges(before.matrix, after.matrix),
  ]

  const steps = matchSteps(before.steps, after.steps)
  for (const pair of steps.pairs) {
    const change = stepChanges(pair.before, pair.after, after.id)
    if (change) {
      for (const field of change.changes) {
        changes.push({
          field: `step ${change.index + 1} · ${change.label} · ${field.field}`,
          before: field.before,
          after: field.after,
        })
      }
    }
  }

  return changes.sort(
    (a, b) =>
      a.field.localeCompare(b.field) ||
      a.before.localeCompare(b.before) ||
      a.after.localeCompare(b.after),
  )
}

function findingKey(finding: Finding): string {
  return [finding.rule, finding.job ?? 'workflow', finding.step ?? '', finding.title].join('|')
}

function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (a.job ?? '').localeCompare(b.job ?? '') ||
      a.title.localeCompare(b.title),
  )
}

export function diffWorkflow(
  before: Workflow,
  after: Workflow,
  beforeAnalysis: Analysis,
  afterAnalysis: Analysis,
): WorkflowDiff {
  const workflow: FieldChange[] = [
    ...scalarChange(
      'on',
      sorted(before.triggers.events).join(', '),
      sorted(after.triggers.events).join(', '),
    ),
    ...scalarChange(
      'schedule',
      sorted(before.triggers.schedules).join(', '),
      sorted(after.triggers.schedules).join(', '),
    ),
    ...scalarChange('concurrency', before.concurrency, after.concurrency),
    ...permissionChanges(before.permissions, after.permissions),
    ...envChanges('env', before.env, after.env),
  ]

  const beforeJobs = new Map(before.jobs.map((job) => [job.id, job]))
  const afterJobs = new Map(after.jobs.map((job) => [job.id, job]))
  const added = sorted([...afterJobs.keys()].filter((id) => !beforeJobs.has(id)))
  const removed = sorted([...beforeJobs.keys()].filter((id) => !afterJobs.has(id)))

  const changed: JobChange[] = []
  const stepRefsAdded: StepRef[] = []
  const stepRefsRemoved: StepRef[] = []
  const stepChangesList: StepChange[] = []

  for (const id of sorted([...beforeJobs.keys()].filter((key) => afterJobs.has(key)))) {
    const beforeJob = beforeJobs.get(id) as Job
    const afterJob = afterJobs.get(id) as Job
    const changes = jobChanges(beforeJob, afterJob)
    if (changes.length > 0) changed.push({ id, changes })

    const steps = matchSteps(beforeJob.steps, afterJob.steps)
    for (const step of steps.added) {
      stepRefsAdded.push({ job: id, label: stepLabel(step) })
    }
    for (const step of steps.removed) {
      stepRefsRemoved.push({ job: id, label: stepLabel(step) })
    }
    for (const pair of steps.pairs) {
      const change = stepChanges(pair.before, pair.after, id)
      if (change) stepChangesList.push(change)
    }
  }

  const beforeFindings = new Map(
    beforeAnalysis.findings.map((finding) => [findingKey(finding), finding]),
  )
  const afterFindings = new Map(
    afterAnalysis.findings.map((finding) => [findingKey(finding), finding]),
  )
  const introduced = sortFindings(
    [...afterFindings.entries()]
      .filter(([key]) => !beforeFindings.has(key))
      .map(([, finding]) => finding),
  )
  const resolved = sortFindings(
    [...beforeFindings.entries()]
      .filter(([key]) => !afterFindings.has(key))
      .map(([, finding]) => finding),
  )
  const changedFindings: { key: string; before: Finding; after: Finding }[] = []
  for (const [key, afterFinding] of afterFindings) {
    const beforeFinding = beforeFindings.get(key)
    if (beforeFinding && beforeFinding.severity !== afterFinding.severity) {
      changedFindings.push({ key, before: beforeFinding, after: afterFinding })
    }
  }
  changedFindings.sort((a, b) => a.key.localeCompare(b.key))

  return {
    workflow,
    jobs: { added, removed, changed },
    steps: { added: stepRefsAdded, removed: stepRefsRemoved, changed: stepChangesList },
    findings: { introduced, resolved, changed: changedFindings },
    counts: {
      jobsAdded: added.length,
      jobsRemoved: removed.length,
      jobsChanged: changed.length,
      stepsAdded: stepRefsAdded.length,
      stepsRemoved: stepRefsRemoved.length,
      findingsIntroduced: introduced.length,
      findingsResolved: resolved.length,
    },
    hasChanges:
      workflow.length > 0 ||
      added.length > 0 ||
      removed.length > 0 ||
      changed.length > 0 ||
      stepRefsAdded.length > 0 ||
      stepRefsRemoved.length > 0 ||
      stepChangesList.length > 0 ||
      introduced.length > 0 ||
      resolved.length > 0 ||
      changedFindings.length > 0,
  }
}

export function diffLabel(diff: WorkflowDiff): string {
  if (!diff.hasChanges) return 'No differences'
  const parts: string[] = []
  if (diff.counts.jobsAdded) parts.push(`${diff.counts.jobsAdded} added`)
  if (diff.counts.jobsRemoved) parts.push(`${diff.counts.jobsRemoved} removed`)
  if (diff.counts.jobsChanged) parts.push(`${diff.counts.jobsChanged} changed`)
  if (diff.counts.stepsAdded) parts.push(`${diff.counts.stepsAdded} step added`)
  if (diff.counts.stepsRemoved) parts.push(`${diff.counts.stepsRemoved} step removed`)
  if (diff.counts.findingsIntroduced) {
    parts.push(
      `${diff.counts.findingsIntroduced} new finding${
        diff.counts.findingsIntroduced === 1 ? '' : 's'
      }`,
    )
  }
  if (diff.counts.findingsResolved) {
    parts.push(`${diff.counts.findingsResolved} resolved`)
  }
  return parts.join(' · ')
}
