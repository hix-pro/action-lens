import {
  ArrowRight,
  Boxes,
  Check,
  ChevronDown,
  CircleCheck,
  GitBranch,
  Info,
  ListChecks,
  Play,
  Radio,
  ShieldAlert,
  Terminal,
  TriangleAlert,
  Workflow as WorkflowIcon,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type {
  Analysis,
  Finding,
  Footprint,
  Job,
  PermissionSet,
  Severity,
  Step,
  Workflow,
} from '../types'
import { FootprintCard } from './FootprintCard'

type Filter = 'all' | Severity

const SEVERITY: Record<
  Severity,
  {
    label: string
    icon: LucideIcon
    text: string
    bg: string
    border: string
    dot: string
    bar: string
  }
> = {
  critical: {
    label: 'Critical',
    icon: ShieldAlert,
    text: 'text-crit',
    bg: 'bg-crit/10',
    border: 'border-crit/25',
    dot: 'bg-crit',
    bar: 'bg-crit',
  },
  warning: {
    label: 'Warning',
    icon: TriangleAlert,
    text: 'text-warn',
    bg: 'bg-warn/10',
    border: 'border-warn/25',
    dot: 'bg-warn',
    bar: 'bg-warn',
  },
  info: {
    label: 'Info',
    icon: Info,
    text: 'text-info',
    bg: 'bg-info/10',
    border: 'border-info/25',
    dot: 'bg-info',
    bar: 'bg-info',
  },
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'critical', label: 'Critical' },
  { id: 'warning', label: 'Warning' },
  { id: 'info', label: 'Info' },
]

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[62px_minmax(0,1fr)] items-start gap-2 py-[3px]">
      <span className="pt-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-600">
        {label}
      </span>
      <div className="min-w-0 text-[10px] leading-relaxed text-slate-400">{children}</div>
    </div>
  )
}

function Chips({
  values,
  max = 4,
  empty = 'none',
  mono = false,
}: {
  values: string[]
  max?: number
  empty?: string
  mono?: boolean
}) {
  if (values.length === 0) return <span className="text-slate-600">{empty}</span>
  const visible = values.slice(0, max)
  const rest = values.length - visible.length
  return (
    <span className="flex flex-wrap gap-1">
      {visible.map((value) => (
        <span
          key={value}
          className={`max-w-full truncate rounded border border-white/[0.07] bg-white/[0.035] px-1.5 py-0.5 text-[9.5px] text-slate-400 ${
            mono ? 'font-mono' : ''
          }`}
        >
          {value}
        </span>
      ))}
      {rest > 0 && (
        <span className="rounded px-1 py-0.5 text-[9.5px] text-slate-600">+{rest}</span>
      )}
    </span>
  )
}

function permissionText(
  permissions: PermissionSet | undefined,
  fallback?: PermissionSet,
): { text: string; elevated: boolean } {
  const source = permissions ?? fallback
  if (!source) return { text: 'repository default', elevated: true }
  const prefix = permissions ? '' : 'inherited · '
  if (source.all) {
    return { text: `${prefix}${source.all}`, elevated: source.all === 'write-all' }
  }
  const entries = Object.entries(source.scopes)
  if (entries.length === 0) return { text: `${prefix}none`, elevated: false }
  return {
    text: `${prefix}${entries.map(([scope, access]) => `${scope}: ${access}`).join(', ')}`,
    elevated: entries.some(([, access]) => access.includes('write')),
  }
}

function jobInstancesLabel(job: Job): string {
  if (!job.matrix) return '1 run'
  if (job.matrix.dynamic || job.matrix.count === null) return '1+ runs'
  return `${job.matrix.count} run${job.matrix.count === 1 ? '' : 's'}`
}

function StepRow({
  step,
  findings,
}: {
  step: Step
  findings: Finding[]
}) {
  const stepFindings = findings.filter((finding) => finding.step === step.index)
  const tone: Severity | 'clean' =
    stepFindings.some((finding) => finding.severity === 'critical')
      ? 'critical'
      : stepFindings.some((finding) => finding.severity === 'warning')
        ? 'warning'
        : stepFindings.some((finding) => finding.severity === 'info')
          ? 'info'
          : 'clean'
  const dot =
    tone === 'clean'
      ? 'bg-slate-700'
      : tone === 'critical'
        ? 'bg-crit'
        : tone === 'warning'
          ? 'bg-warn'
          : 'bg-info'
  const Icon = step.uses ? Boxes : Terminal
  const label = step.name ?? (step.uses ? step.uses.split('@')[0] : 'Shell command')
  const detail = step.uses
    ? step.uses.slice(step.uses.indexOf('@') + 1) || 'no ref'
    : `run · ${step.run ? step.run.trim().split('\n').length : 0} line${step.run && step.run.trim().split('\n').length === 1 ? '' : 's'}`
  const inputs = Object.keys(step.with).length
  const envs = Object.keys(step.env).length

  return (
    <div className="flex items-start gap-2 py-[5px]">
      <span className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded border border-white/[0.06] bg-white/[0.025]">
        <Icon size={10} className="text-slate-500" strokeWidth={1.9} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[10px] font-medium text-slate-300">{label}</span>
          {step.continueOnError && (
            <span className="shrink-0 rounded border border-warn/20 bg-warn/[0.07] px-1 py-px font-mono text-[8px] text-warn/80">
              continue
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 font-mono text-[8.5px] text-slate-600">
          <span className="truncate">{detail}</span>
          {inputs > 0 && <span className="shrink-0">{inputs} input{inputs === 1 ? '' : 's'}</span>}
          {envs > 0 && <span className="shrink-0">{envs} env</span>}
          {stepFindings.length > 0 && (
            <span className="shrink-0 text-slate-500">{stepFindings.length} finding{stepFindings.length === 1 ? '' : 's'}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function JobCard({
  job,
  workflow,
  findings,
  onClear,
}: {
  job: Job
  workflow: Workflow
  findings: Finding[]
  onClear: () => void
}) {
  const [stepsOpen, setStepsOpen] = useState(false)
  const counts = {
    critical: findings.filter((finding) => finding.severity === 'critical').length,
    warning: findings.filter((finding) => finding.severity === 'warning').length,
    info: findings.filter((finding) => finding.severity === 'info').length,
  }
  const permissions = permissionText(job.permissions, workflow.permissions)
  const matrix = job.matrix
  const matrixText = matrix
    ? matrix.dynamic || matrix.count === null
      ? 'dynamic (expression)'
      : `${matrix.count} job${matrix.count === 1 ? '' : 's'} · ${Object.entries(
          matrix.dimensions,
        )
          .map(([key, values]) => `${key} (${values.length})`)
          .join(' · ')}`
    : 'none'

  return (
    <div className="mx-4 mt-4 rounded-xl border border-white/[0.08] bg-white/[0.025] xl:mx-5">
      <div className="flex items-start gap-2.5 border-b border-white/[0.06] px-3 py-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.04]">
          <WorkflowIcon size={14} className="text-beam-soft/90" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[12.5px] font-semibold text-slate-100">
              {job.name ?? job.id}
            </h3>
            {job.timeoutMinutes ? null : (
              <span className="rounded border border-warn/25 bg-warn/10 px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-wide text-warn">
                no timeout
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate font-mono text-[9.5px] text-slate-500">{job.id}</p>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear job selection"
          className="rounded p-1 text-slate-600 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
        >
          <X size={12} />
        </button>
      </div>

      <div className="px-3 py-2">
        <DetailRow label={job.uses ? 'Reusable' : 'Runner'}>
          <span className="inline-flex items-center gap-1 font-mono">
            <Play size={9} className="text-slate-600" />
            {job.uses ?? (job.runsOn.join(' · ') || 'not set')}
          </span>
          {job.secretsInherit && (
            <span className="ml-2 rounded border border-warn/20 bg-warn/[0.07] px-1 py-px font-mono text-[8.5px] text-warn/80">
              secrets: inherit
            </span>
          )}
        </DetailRow>
        <DetailRow label="Matrix">
          <span className={matrix?.dynamic ? 'text-warn/80' : ''}>{matrixText}</span>
          <span className="ml-2 text-slate-600">· {jobInstancesLabel(job)}</span>
        </DetailRow>
        <DetailRow label="Timeout">
          <span className={job.timeoutMinutes ? '' : 'text-warn/80'}>
            {job.timeoutMinutes ? `${job.timeoutMinutes} minutes` : 'not set'}
          </span>
        </DetailRow>
        <DetailRow label="Needs">
          <Chips values={job.needs} max={5} empty="no dependencies" mono />
        </DetailRow>
        <DetailRow label="Token">
          <span className={permissions.elevated ? 'text-warn/85' : 'text-slate-400'}>
            {permissions.text}
          </span>
        </DetailRow>
        {job.condition && (
          <DetailRow label="If">
            <span className="font-mono text-[9.5px] text-slate-500 break-words">
              {job.condition}
            </span>
          </DetailRow>
        )}
      </div>

      <button
        type="button"
        onClick={() => setStepsOpen((value) => !value)}
        aria-expanded={stepsOpen}
        className="flex w-full items-center gap-2 border-t border-white/[0.06] px-3 py-2 text-left transition-colors hover:bg-white/[0.02]"
      >
        <ListChecks size={11} className="text-slate-600" />
        <span className="text-[9.5px] font-medium uppercase tracking-[0.1em] text-slate-500">
          {job.steps.length} step{job.steps.length === 1 ? '' : 's'}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {counts.critical > 0 && (
            <span className="inline-flex items-center gap-1 text-[9px] text-crit">
              <span className="h-1 w-1 rounded-full bg-crit" />
              {counts.critical}
            </span>
          )}
          {counts.warning > 0 && (
            <span className="inline-flex items-center gap-1 text-[9px] text-warn">
              <span className="h-1 w-1 rounded-full bg-warn" />
              {counts.warning}
            </span>
          )}
          {counts.info > 0 && (
            <span className="inline-flex items-center gap-1 text-[9px] text-info">
              <span className="h-1 w-1 rounded-full bg-info" />
              {counts.info}
            </span>
          )}
          {findings.length === 0 && <span className="text-[9px] text-mint/80">clean</span>}
          <ChevronDown
            size={11}
            className={`text-slate-600 transition-transform ${stepsOpen ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {stepsOpen && (
        <div className="border-t border-white/[0.04] px-3 py-1.5">
          {job.steps.length === 0 ? (
            <p className="py-2 text-[10px] text-slate-600">No steps in this job.</p>
          ) : (
            job.steps.map((step) => (
              <StepRow
                key={step.index}
                step={step}
                findings={findings}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function WorkflowCard({ workflow }: { workflow: Workflow }) {
  const permissions = permissionText(workflow.permissions)
  return (
    <div className="mx-4 mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 xl:mx-5">
      <div className="flex items-center gap-2">
        <Radio size={11} className="text-beam-soft/80" />
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Workflow
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[9px] text-slate-600">
          <GitBranch size={9} />
          {workflow.jobs.length} job{workflow.jobs.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="mt-2">
        <DetailRow label="Triggers">
          <Chips values={workflow.triggers.events} max={6} empty="none" mono />
        </DetailRow>
        {workflow.triggers.schedules.length > 0 && (
          <DetailRow label="Cron">
            <Chips values={workflow.triggers.schedules} max={3} mono />
          </DetailRow>
        )}
        <DetailRow label="Token">
          <span className={permissions.elevated ? 'text-warn/85' : 'text-slate-400'}>
            {permissions.text}
          </span>
        </DetailRow>
        {workflow.concurrency && (
          <DetailRow label="Concurrency">
            <span className="font-mono text-[9.5px]">{workflow.concurrency}</span>
          </DetailRow>
        )}
      </div>
    </div>
  )
}

function FindingCard({ finding }: { finding: Finding }) {
  const severity = SEVERITY[finding.severity]
  const Icon = severity.icon
  const scope = finding.job ?? 'workflow'
  return (
    <article
      title={finding.rule}
      className="group relative overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 pl-3.5 transition-colors hover:border-white/[0.11] hover:bg-white/[0.035]"
    >
      <span className={`absolute inset-y-0 left-0 w-[2px] ${severity.bar} opacity-70`} />
      <div className="flex items-start gap-2">
        <span
          className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${severity.border} ${severity.bg}`}
        >
          <Icon size={11} className={severity.text} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 text-[11.5px] font-semibold leading-snug text-slate-200">
              {finding.title}
            </h3>
            <span className="shrink-0 rounded border border-white/[0.07] bg-black/20 px-1.5 py-px font-mono text-[8.5px] text-slate-500">
              {scope}
              {finding.step !== undefined ? `:${finding.step + 1}` : ''}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{finding.detail}</p>
          <p className="mt-1.5 flex items-start gap-1 text-[10px] leading-relaxed text-slate-400">
            <ArrowRight
              size={10}
              className={`mt-[3px] shrink-0 ${severity.text} opacity-70`}
            />
            <span>
              <span className="font-medium text-slate-500">Fix: </span>
              {finding.fix}
            </span>
          </p>
        </div>
      </div>
    </article>
  )
}

interface FindingsPanelProps {
  analysis: Analysis | null
  workflow: Workflow | null
  footprint: Footprint | null
  selectedJob: string | null
  onClearJob: () => void
  onMinutesChange: (value: number) => void
  onPriceChange: (value: number) => void
}

export function FindingsPanel({
  analysis,
  workflow,
  footprint,
  selectedJob,
  onClearJob,
  onMinutesChange,
  onPriceChange,
}: FindingsPanelProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const job = useMemo(
    () => workflow?.jobs.find((candidate) => candidate.id === selectedJob) ?? null,
    [workflow, selectedJob],
  )

  const jobFindings = useMemo(() => {
    if (!analysis || !job) return []
    return analysis.findings.filter((finding) => finding.job === job.id)
  }, [analysis, job])

  // Workflow-level findings stay visible while a job is focused; they apply to
  // every job in the file.
  const scoped = useMemo(() => {
    if (!analysis) return []
    return job
      ? analysis.findings.filter((finding) => !finding.job || finding.job === job.id)
      : analysis.findings
  }, [analysis, job])

  const visible = filter === 'all' ? scoped : scoped.filter((finding) => finding.severity === filter)

  return (
    <aside className="flex h-full min-h-0 flex-col border-t border-white/[0.06] bg-panel/40 lg:border-t-0 lg:border-l">
      <div className="shrink-0 border-b border-white/[0.06] px-4 pb-3 pt-4 xl:px-5 xl:pt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Review
          </h2>
          {analysis && (
            <span className="font-mono text-[10px] text-slate-600">
              {analysis.findings.length} finding{analysis.findings.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <p className="mt-1 text-[10.5px] leading-relaxed text-slate-600">
          {job
            ? `Focused on ${job.id}. Workflow-level findings stay visible.`
            : 'Triggers, token permissions, matrix jobs and the risks that bite in CI.'}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {FILTERS.map((item) => {
            const active = filter === item.id
            const count =
              item.id === 'all'
                ? scoped.length
                : scoped.filter((finding) => finding.severity === item.id).length
            const dot = item.id === 'all' ? 'bg-slate-500' : SEVERITY[item.id].dot
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors',
                  active
                    ? 'border-white/20 bg-white/[0.08] text-slate-100'
                    : 'border-transparent bg-white/[0.025] text-slate-500 hover:bg-white/[0.05] hover:text-slate-300',
                ].join(' ')}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                {item.label}
                <span className="font-mono text-[9px] text-slate-600">{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto pb-5">
        {footprint && (
          <FootprintCard
            footprint={footprint}
            onMinutesChange={onMinutesChange}
            onPriceChange={onPriceChange}
          />
        )}

        {workflow && analysis && !job && <WorkflowCard workflow={workflow} />}
        {workflow && analysis && job && (
          <JobCard
            job={job}
            workflow={workflow}
            findings={jobFindings}
            onClear={onClearJob}
          />
        )}

        {!analysis ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.025]">
              <WorkflowIcon size={18} className="text-slate-600" strokeWidth={1.6} />
            </div>
            <p className="mt-3 text-[11.5px] font-medium text-slate-400">No review yet</p>
            <p className="mt-1 max-w-[230px] text-[10.5px] leading-relaxed text-slate-600">
              Fix the YAML or open a sample to see the job graph and risk review.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-mint/20 bg-mint/[0.05]">
              <CircleCheck size={19} className="text-mint/80" strokeWidth={1.7} />
            </div>
            <p className="mt-3 text-[11.5px] font-medium text-slate-300">
              {scoped.length === 0 ? 'No findings from these rules' : 'Nothing at this severity'}
            </p>
            <p className="mt-1 max-w-[235px] text-[10.5px] leading-relaxed text-slate-600">
              {scoped.length === 0
                ? 'This workflow is tidy by the current rules. That is not a security guarantee.'
                : 'Switch the filter to see the rest of the review.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2 px-4 pt-3 xl:px-5">
            {visible.map((finding) => (
              <FindingCard key={finding.id} finding={finding} />
            ))}
          </div>
        )}

        {analysis && analysis.findings.length > 0 && (
          <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5 xl:mx-5">
            <Check size={11} className="mt-0.5 shrink-0 text-slate-600" />
            <p className="text-[9.5px] leading-relaxed text-slate-600">
              Static review of workflow configuration. Action internals, expression
              evaluation, runner images and live credentials are out of scope.
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}
