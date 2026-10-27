import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  Boxes,
  Check,
  Cpu,
  Info,
  ListChecks,
  ShieldAlert,
  Timer,
  TriangleAlert,
  Waypoints,
} from 'lucide-react'
import type { JobNode } from '../types'

const TONE = {
  critical: {
    bar: 'bg-crit',
    dot: 'bg-crit',
    dotRing: 'shadow-[0_0_0_4px_rgba(255,107,107,0.12)]',
    pill: 'bg-crit/10 text-crit border-crit/25',
    border: 'border-crit/45',
  },
  warning: {
    bar: 'bg-warn',
    dot: 'bg-warn',
    dotRing: 'shadow-[0_0_0_4px_rgba(255,180,84,0.12)]',
    pill: 'bg-warn/10 text-warn border-warn/25',
    border: 'border-warn/40',
  },
  info: {
    bar: 'bg-info',
    dot: 'bg-info',
    dotRing: 'shadow-[0_0_0_4px_rgba(125,211,252,0.12)]',
    pill: 'bg-info/10 text-info border-info/25',
    border: 'border-info/35',
  },
  clean: {
    bar: 'bg-beam/70',
    dot: 'bg-beam',
    dotRing: 'shadow-[0_0_0_4px_rgba(90,169,255,0.12)]',
    pill: 'bg-beam/10 text-beam border-beam/25',
    border: 'border-white/10',
  },
} as const

function matrixLabel(job: JobNode['data']['job']): string | null {
  if (!job.matrix) return null
  if (job.matrix.dynamic || job.matrix.count === null) return 'dynamic matrix'
  return `matrix ×${job.matrix.count}`
}

export function JobNodeCard({ data, selected }: NodeProps<JobNode>) {
  const { job, criticalCount, warningCount, infoCount } = data
  const tone =
    criticalCount > 0
      ? TONE.critical
      : warningCount > 0
        ? TONE.warning
        : infoCount > 0
          ? TONE.info
          : TONE.clean
  const runner = job.uses ?? job.runsOn.join(' · ') ?? ''
  const matrix = matrixLabel(job)
  const total = criticalCount + warningCount + infoCount

  return (
    <div
      style={{ width: 280, height: 154 }}
      className={[
        'group relative overflow-hidden rounded-[14px] border bg-node/95 backdrop-blur-sm',
        'transition-[border-color,box-shadow] duration-150',
        selected
          ? 'border-beam/75 shadow-[0_0_0_1px_rgba(90,169,255,0.4),0_22px_54px_-16px_rgba(90,169,255,0.4)]'
          : `${tone.border} shadow-[0_14px_34px_-20px_rgba(0,0,0,0.9)] hover:border-white/25`,
      ].join(' ')}
    >
      <div className={`absolute inset-x-0 top-0 h-[2px] ${tone.bar}`} />

      <div className="flex h-full flex-col px-[14px] pt-[15px] pb-[12px]">
        <div className="flex items-center gap-2">
          <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${tone.dot} ${tone.dotRing}`} />
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-0.01em] text-slate-50">
            {job.name ?? job.id}
          </span>
          {total > 0 ? (
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[9px] font-semibold ${tone.pill}`}
              title={`${criticalCount} critical, ${warningCount} warning, ${infoCount} info`}
            >
              {criticalCount > 0 ? (
                <ShieldAlert size={9} strokeWidth={2.2} />
              ) : warningCount > 0 ? (
                <TriangleAlert size={9} strokeWidth={2.2} />
              ) : (
                <Info size={9} strokeWidth={2.2} />
              )}
              {total}
            </span>
          ) : (
            <Check size={12} className="shrink-0 text-mint/80" strokeWidth={2.4} />
          )}
        </div>

        <div className="mt-[6px] truncate pl-[15px] font-mono text-[10px] leading-none text-slate-500">
          {job.name ? job.id : job.uses ? 'reusable workflow' : 'workflow job'}
        </div>

        <div className="my-[10px] h-px w-full bg-white/[0.06]" />

        <div className="flex items-center gap-2 text-[9.5px] text-slate-500">
          {matrix && (
            <span className="inline-flex items-center gap-1 rounded border border-beam/20 bg-beam/[0.06] px-1.5 py-0.5 font-mono text-[9px] text-beam-soft/90">
              <Boxes size={9} strokeWidth={1.9} />
              {matrix}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <ListChecks size={10} strokeWidth={1.8} />
            {job.steps.length} step{job.steps.length === 1 ? '' : 's'}
          </span>
          <span
            className={`inline-flex items-center gap-1 ${
              job.timeoutMinutes ? 'text-slate-500' : 'text-warn/75'
            }`}
          >
            <Timer size={10} strokeWidth={1.8} />
            {job.timeoutMinutes ? `${job.timeoutMinutes}m` : 'no timeout'}
          </span>
        </div>

        <div className="mt-[7px] flex items-center gap-2.5 text-[9px]">
          {criticalCount > 0 && (
            <span className="inline-flex items-center gap-1 text-crit/90">
              <span className="h-1 w-1 rounded-full bg-crit" />
              {criticalCount} critical
            </span>
          )}
          {warningCount > 0 && (
            <span className="inline-flex items-center gap-1 text-warn/90">
              <span className="h-1 w-1 rounded-full bg-warn" />
              {warningCount} warning{warningCount === 1 ? '' : 's'}
            </span>
          )}
          {infoCount > 0 && (
            <span className="inline-flex items-center gap-1 text-info/90">
              <span className="h-1 w-1 rounded-full bg-info" />
              {infoCount} info
            </span>
          )}
          {total === 0 && <span className="text-mint/70">no findings from current rules</span>}
        </div>

        <div className="mt-auto flex items-center gap-2 text-[9.5px]">
          <span className="inline-flex min-w-0 items-center gap-1 text-slate-500">
            {job.uses ? (
              <Boxes size={10} strokeWidth={1.8} className="shrink-0" />
            ) : (
              <Cpu size={10} strokeWidth={1.8} className="shrink-0" />
            )}
            <span className="truncate">{runner || 'no runner'}</span>
          </span>
          {job.needs.length > 0 && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-slate-500">
              <Waypoints size={10} strokeWidth={1.9} />
              {job.needs.length} need{job.needs.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>

      <Handle type="target" position={Position.Left} isConnectable={false} />
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  )
}
