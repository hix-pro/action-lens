import {
  FileCode2,
  FileWarning,
  Layers3,
  Play,
  Radio,
  Waypoints,
} from 'lucide-react'
import type { Analysis, Footprint, Workflow } from '../types'
import { ExportMenu } from './ExportMenu'
import { GraphCanvas } from './GraphCanvas'
import { defaultSample } from '../lib/samples'

interface GraphPanelProps {
  workflow: Workflow | null
  analysis: Analysis | null
  footprint: Footprint | null
  error: string | null
  filename: string
  selectedJob: string | null
  onSelectJob: (id: string | null) => void
  onLoadDefaultSample: () => void
  onNotify: (message: string, tone?: 'ok' | 'error') => void
}

function GraphStat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Layers3
  value: string
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10.5px] text-slate-500">
      <Icon size={11} strokeWidth={1.8} className="text-slate-600" />
      <span className="font-mono font-medium text-slate-300">{value}</span>
      <span className="hidden xl:inline">{label}</span>
    </span>
  )
}

export function GraphPanel({
  workflow,
  analysis,
  footprint,
  error,
  filename,
  selectedJob,
  onSelectJob,
  onLoadDefaultSample,
  onNotify,
}: GraphPanelProps) {
  return (
    <section className="relative flex min-h-[560px] flex-col bg-ink-950 lg:min-h-0">
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-white/[0.06] px-4">
        <div className="flex min-w-0 items-center gap-2">
          <FileCode2 size={13} className="shrink-0 text-slate-500" />
          <span className="truncate font-mono text-[11px] text-slate-300">{filename}</span>
        </div>

        {analysis && (
          <div className="hidden items-center gap-3 border-l border-white/[0.07] pl-3 sm:flex">
            <GraphStat icon={Layers3} value={String(analysis.stats.jobs)} label="jobs" />
            <GraphStat
              icon={Play}
              value={`${analysis.stats.instances}${analysis.stats.dynamicMatrices > 0 ? '+' : ''}`}
              label="instances"
            />
            <GraphStat icon={Radio} value={String(analysis.stats.triggers)} label="triggers" />
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-600 md:flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-beam/70" />
            parsed locally
          </span>
          {workflow && analysis && footprint && (
            <ExportMenu
              workflow={workflow}
              analysis={analysis}
              footprint={footprint}
              onNotify={onNotify}
            />
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {workflow && analysis ? (
          <>
            <GraphCanvas
              workflow={workflow}
              findings={analysis.findings}
              selectedJob={selectedJob}
              onSelectJob={onSelectJob}
            />
            <div className="pointer-events-none absolute left-[68px] top-4 z-10 flex items-center gap-3 rounded-full border border-white/[0.07] bg-[#080d13]/85 px-3 py-1.5 shadow-lg backdrop-blur">
              <span className="flex items-center gap-1.5 text-[9.5px] text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-crit" /> Critical
              </span>
              <span className="flex items-center gap-1.5 text-[9.5px] text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-warn" /> Warning
              </span>
              <span className="flex items-center gap-1.5 text-[9.5px] text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-info" /> Info
              </span>
              <span className="flex items-center gap-1.5 text-[9.5px] text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-beam" /> Clean
              </span>
            </div>
            <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-white/[0.06] bg-[#080d13]/80 px-3 py-1.5 text-[9.5px] text-slate-600 backdrop-blur md:flex">
              Arrows point to prerequisites · drag to rearrange · click a job to focus
            </div>
          </>
        ) : (
          <div className="relative flex h-full min-h-[480px] items-center justify-center overflow-hidden px-6">
            <div className="pointer-events-none absolute inset-0 bg-dots opacity-60" />
            <div className="relative w-full max-w-[380px] rounded-2xl border border-white/[0.07] bg-[#080d13]/80 p-6 text-center shadow-2xl backdrop-blur">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-warn/20 bg-warn/[0.06]">
                <FileWarning size={21} className="text-warn/80" strokeWidth={1.7} />
              </div>
              <h2 className="mt-4 text-[14px] font-semibold text-slate-200">
                {error ? 'This file needs a small fix' : 'No workflow loaded'}
              </h2>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                {error ??
                  'Paste a workflow on the left, drop a file anywhere, or start from a sample.'}
              </p>
              <button
                type="button"
                onClick={onLoadDefaultSample}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-slate-200 transition-colors hover:border-white/20 hover:bg-white/[0.07]"
              >
                <Waypoints size={11} />
                Open {defaultSample.name}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
